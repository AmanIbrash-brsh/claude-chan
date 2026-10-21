// Classic script (no imports): wrapped so its names stay local.
(() => {
  type Mood = "happy" | "neutral" | "thinking" | "sad" | "surprised" | "shy";
  type State = "idle" | "thinking" | "working" | "talking";
  type ClaudeEvent =
    | { type: "text"; text: string }
    | { type: "tool"; name: string; detail: string }
    | { type: "done"; error?: string }
    | { type: "session"; id: string };

  const chan = (window as any).chan as {
    send(text: string): void;
    cancel(): void;
    newChat(): void;
    walkRandom(): void;
    walkStop(): void;
    moveWindow(dx: number, dy: number): void;
    dragEnd(): void;
    setInteractive(on: boolean): void;
    openMenu(): void;
    info(): Promise<{ workspace: string; fullAccess: boolean; hair: "loose" | "ponytail" }>;
    onEvent(cb: (e: ClaudeEvent) => void): void;
    onWalk(cb: (s: { walking: boolean; dir: 1 | -1 }) => void): void;
    onCleared(cb: () => void): void;
  };

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const avatar = $("avatar");
  const spritesEl = $("sprites");
  const bubble = $("bubble");
  const said = $("said");
  const statusEl = $("status");
  const statusText = $("status-text");
  const form = $<HTMLFormElement>("form");
  const input = $<HTMLInputElement>("input");

  const MOODS: Mood[] = ["happy", "neutral", "thinking", "sad", "surprised", "shy"];
  const MOOD_TAG = /\[mood:(\w+)\]\s*/g;
  const rand = (min: number, max: number) => min + Math.random() * (max - min);

  // ---------- sprites ----------
  const SPRITE_NAMES = ["idle", "think", "happy", "walk1", "walk2", "fix_tail", "idle_tail", "happy_tail", "think_tail"];
  const sprites = new Map<string, HTMLImageElement>();
  for (const name of SPRITE_NAMES) {
    const img = new Image();
    img.src = `sprites/${name}.png`;
    img.alt = "";
    spritesEl.appendChild(img);
    sprites.set(name, img);
  }

  let state: State = "idle";
  let mood: Mood = "neutral";
  let ambient: "idle" | "happy" | "think" | null = null; // idle-time pose changes
  let ponytail = false;
  let walking = false;
  let dir: 1 | -1 = 1;
  let shown = "";
  let walkFrame = false;
  let walkTimer: number | undefined;
  let calmTimer: number | undefined;

  const stepping = () => walking || state === "working";

  /** Which sprite fits the current state, mood and movement. */
  function pick(): string {
    const variant = (name: string) => (ponytail && sprites.has(`${name}_tail`) ? `${name}_tail` : name);
    if (stepping()) return walkFrame ? "walk2" : "walk1";
    if (state === "thinking" || mood === "thinking") return variant("think");
    if (mood === "sad") return "fix_tail";
    if (mood === "happy" || mood === "surprised") return variant("happy");
    return variant(ambient ?? "idle");
  }

  /** A short vertical hop: used for footsteps and when she changes pose. */
  function hop(px: number) {
    avatar.animate([{ translate: `0 -${px}px` }, { translate: "0 0" }], { duration: 220, easing: "ease-out" });
  }

  function show() {
    const name = pick();
    spritesEl.classList.toggle("flip", dir < 0 && name.startsWith("walk"));
    avatar.dataset.moving = String(stepping());
    avatar.dataset.dir = String(dir);
    if (name === shown) return;
    const bothWalk = name.startsWith("walk") && shown.startsWith("walk");
    spritesEl.classList.toggle("instant", bothWalk);
    sprites.get(shown)?.classList.remove("active");
    sprites.get(name)!.classList.add("active");
    shown = name;
    if (!bothWalk) hop(stepping() ? 3 : 6);
  }

  /** Alternate the two walk frames while she is on her feet. */
  function syncWalkTimer() {
    if (stepping() && walkTimer === undefined) {
      walkTimer = window.setInterval(() => {
        walkFrame = !walkFrame;
        show();
        hop(6); // each step lands with a small bounce
      }, 260);
    } else if (!stepping() && walkTimer !== undefined) {
      window.clearInterval(walkTimer);
      walkTimer = undefined;
    }
  }

  function setState(next: State) {
    state = next;
    if (next === "idle") setMood(mood);
    else window.clearTimeout(calmTimer);
    if (next === "working") {
      if (!walking) chan.walkRandom(); // pace around while busy
    } else if (next !== "idle") {
      chan.walkStop(); // hold still while thinking or talking
    }
    syncWalkTimer();
    show();
  }

  function setMood(next: Mood) {
    mood = next;
    window.clearTimeout(calmTimer);
    // Once she is done, let the emotion fade back to her relaxed pose.
    if (next !== "neutral" && state === "idle") calmTimer = window.setTimeout(() => setMood("neutral"), 6000);
    show();
  }

  chan.onWalk((s) => {
    walking = s.walking;
    dir = s.dir;
    if (!walking && state === "working") window.setTimeout(() => state === "working" && chan.walkRandom(), 400);
    syncWalkTimer();
    show();
  });

  // ---------- speech bubble ----------
  let busy = false;
  let inputOpen = false;
  let raw = "";
  let startNewSegment = true;
  let hideTimer: number | undefined;

  function escapeHtml(s: string) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  }

  /** Tiny markdown: fenced code, inline code, bold. */
  function render(text: string) {
    return escapeHtml(text)
      .replace(/```[^\n]*\n([\s\S]*?)(```|$)/g, (_m, code) => `<pre><code>${code}</code></pre>`)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  }

  function refreshBubble() {
    const hasContent = said.textContent !== "" || !statusEl.hidden || inputOpen;
    bubble.hidden = !hasContent;
  }

  function setStatus(text: string | null) {
    statusEl.hidden = text === null;
    if (text !== null) statusText.textContent = text;
    refreshBubble();
  }

  function scheduleHide(ms: number) {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (inputOpen || busy) return;
      said.textContent = "";
      said.classList.remove("err");
      refreshBubble();
    }, ms);
  }

  /** Reading time grows with the length of what she said. */
  const readingTime = (text: string) => Math.min(30000, 4000 + text.length * 60);

  function applyStreamedText() {
    let found: Mood | null = null;
    // Drop complete tags, and a trailing half-typed "[mood:..." while it streams.
    const visible = raw
      .replace(MOOD_TAG, (_m, name: string) => {
        if (!found && (MOODS as string[]).includes(name)) found = name as Mood;
        return "";
      })
      .replace(/\[[^\]]*$/, "");
    if (found) setMood(found);
    said.classList.remove("err");
    said.innerHTML = render(visible);
    said.scrollTop = said.scrollHeight;
    refreshBubble();
  }

  let typer: number | undefined;
  const stopTyping = () => window.clearInterval(typer);
  const pickLine = (key: string): Phrase => PHRASES[key][Math.floor(Math.random() * PHRASES[key].length)];

  /** Types a line into the bubble letter by letter, then leaves it up long enough to read. */
  function say(line: Phrase, hold = true) {
    stopTyping();
    window.clearTimeout(hideTimer);
    said.classList.remove("err");
    said.textContent = "";
    if (line.mood) setMood(line.mood);
    refreshBubble();
    let i = 0;
    typer = window.setInterval(() => {
      said.textContent = line.text.slice(0, ++i);
      refreshBubble();
      if (i < line.text.length) return;
      stopTyping();
      if (hold) scheduleHide(readingTime(line.text));
    }, 32);
  }

  function openInput() {
    if (busy) return;
    inputOpen = true;
    chan.walkStop();
    form.hidden = false;
    say(pickLine("listen"), false);
    input.focus();
  }

  function closeInput() {
    inputOpen = false;
    form.hidden = true;
    input.value = "";
    refreshBubble();
    if (said.textContent) scheduleHide(4000);
  }

  chan.onEvent((e) => {
    switch (e.type) {
      case "tool":
        stopTyping();
        setState("working");
        setStatus(`▸ ${e.name}${e.detail ? ` ${e.detail.slice(0, 60)}` : ""}`);
        startNewSegment = true;
        break;
      case "text":
        stopTyping();
        if (startNewSegment) {
          raw = "";
          startNewSegment = false;
        }
        raw += e.text;
        setState("talking");
        setStatus("Отвечаю…");
        applyStreamedText();
        break;
      case "done":
        busy = false;
        setStatus(null);
        chan.walkStop();
        setState("idle");
        if (e.error) {
          setMood("sad");
          said.classList.add("err");
          said.textContent = e.error;
          refreshBubble();
        }
        scheduleHide(readingTime(said.textContent ?? ""));
        raw = "";
        break;
    }
  });

  chan.onCleared(() => {
    said.textContent = "";
    refreshBubble();
  });

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    closeInput();
    stopTyping();
    busy = true;
    raw = "";
    startNewSegment = true;
    said.textContent = "";
    window.clearTimeout(hideTimer);
    setMood("thinking");
    setState("thinking");
    setStatus("Думаю…");
    chan.send(text);
  });

  $("stop").addEventListener("click", () => chan.cancel());

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeInput();
  });
  input.addEventListener("blur", () => {
    // Clicking elsewhere closes an empty input; a typed message stays.
    window.setTimeout(() => inputOpen && !input.value && document.activeElement !== input && closeInput(), 150);
  });

  bubble.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  bubble.addEventListener("mouseleave", () => said.textContent && !busy && !inputOpen && scheduleHide(4000));

  // ---------- pointer: click-through, drag, click ----------
  let interactive = false;
  let pressed = false;
  function setInteractive(on: boolean) {
    if (on === interactive) return;
    interactive = on;
    chan.setInteractive(on);
  }
  // Empty window area lets clicks fall through to the desktop.
  document.addEventListener("mousemove", (ev) => {
    if (pressed) return;
    setInteractive(!!(ev.target as HTMLElement).closest("#avatar, #bubble"));
  });
  document.addEventListener("mouseleave", () => !pressed && setInteractive(false));

  // Drag her by the sprite; a click without movement opens the bubble's input.
  avatar.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    pressed = true;
    let lastX = ev.screenX;
    let lastY = ev.screenY;
    let moved = 0;
    const onMove = (m: MouseEvent) => {
      const dx = m.screenX - lastX;
      const dy = m.screenY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = m.screenX;
      lastY = m.screenY;
      if (moved > 4) chan.moveWindow(dx, dy);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      pressed = false;
      if (moved > 4) chan.dragEnd();
      else if (inputOpen) closeInput();
      else openInput();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
  avatar.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    chan.openMenu();
  });

  // ---------- idle life: wander, change poses, talk to herself ----------
  const startedAt = Date.now();
  let nextAction = startedAt + 9000;
  let lastNudge = startedAt;
  let lastHover = 0;
  let lateNightShown = false;

  const isQuiet = () => !busy && !inputOpen && !pressed && !walking && bubble.hidden && state === "idle";

  function changePose() {
    const poses = ["idle", "happy", "think"] as const;
    ambient = poses[Math.floor(Math.random() * poses.length)];
    show();
    window.setTimeout(() => {
      ambient = null;
      show();
    }, rand(3500, 6500));
  }

  window.setInterval(() => {
    if (!isQuiet()) return;
    const now = Date.now();
    const hour = new Date().getHours();

    // Gentle reminders take priority over random behaviour.
    if (hour < 5 && !lateNightShown) {
      lateNightShown = true;
      say(pickLine("lateNight"));
    } else if (now - lastNudge > 50 * 60000) {
      lastNudge = now;
      say(pickLine("nudge"));
    } else if (now >= nextAction) {
      nextAction = now + rand(6000, 16000);
      const roll = Math.random();
      if (roll < 0.22) say(pickLine("idle"));
      else if (roll < 0.62) chan.walkRandom();
      else changePose();
    }
  }, 1000);

  // Hovering over her for a moment makes her react.
  let hoverTimer: number | undefined;
  avatar.addEventListener("mouseenter", () => {
    hoverTimer = window.setTimeout(() => {
      if (!isQuiet() || Date.now() - lastHover < 25000) return;
      lastHover = Date.now();
      say(pickLine("hover"));
    }, 1800);
  });
  avatar.addEventListener("mouseleave", () => window.clearTimeout(hoverTimer));

  // ---------- start ----------
  setState("idle");
  chan.info().then((info) => {
    ponytail = info.hair === "ponytail";
    const hour = new Date().getHours();
    const key = hour < 5 ? "greetNight" : hour < 12 ? "greetMorning" : hour < 18 ? "greetDay" : hour < 23 ? "greetEvening" : "greetNight";
    say(pickLine(key));
  });
})();
