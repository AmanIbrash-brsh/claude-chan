import { app, BrowserWindow, ipcMain, Menu, screen, shell } from "electron";
import path from "node:path";
import { ClaudeBridge, ClaudeEvent } from "./claude";
import { configPath, loadConfig } from "./config";

const WIDTH = 440;
const HEIGHT = 720;
/** Transparent margin around the sprite: she may overhang the screen edge by this much. */
const MARGIN = 70;
const SPEED = 90; // top walking speed, px per second
const ACCEL = 260; // px per second squared: she eases into and out of a walk
const TICK_MS = 16;

let win: BrowserWindow | null = null;
let dragging = false;
let target: number | null = null;
let fx = 0;
let vel = 0;

function geometry() {
  const wa = screen.getPrimaryDisplay().workArea;
  const height = Math.min(HEIGHT, wa.height - 24);
  return {
    height,
    minX: wa.x - MARGIN,
    maxX: wa.x + wa.width - WIDTH + MARGIN,
    floorY: wa.y + wa.height - height,
  };
}

function createWindow(clickThrough: boolean): BrowserWindow {
  const g = geometry();
  const w = new BrowserWindow({
    width: WIDTH,
    height: g.height,
    x: g.maxX - 40,
    y: g.floorY,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  w.setAlwaysOnTop(true, "floating");
  // Empty areas pass clicks to the desktop; the renderer re-enables input over her and the bubble.
  if (clickThrough) w.setIgnoreMouseEvents(true, { forward: true });
  w.loadFile(path.join(__dirname, "renderer", "index.html"));
  return w;
}

function notifyWalk(walking: boolean, dir: 1 | -1 = 1) {
  win?.webContents.send("walk:state", { walking, dir });
}

function stopWalking() {
  if (target === null) return;
  target = null;
  vel = 0;
  notifyWalk(false);
}

/** Moves toward the walk target and settles back onto the floor after a drag. */
function tick() {
  if (!win || dragging) return;
  const g = geometry();
  const [x, y] = win.getPosition();

  let ny = y;
  if (y !== g.floorY) {
    const d = g.floorY - y;
    ny = y + Math.sign(d) * Math.min(Math.abs(d), Math.max(3, Math.abs(d) * 0.2));
  }

  let nx = x;
  if (target !== null) {
    const dt = TICK_MS / 1000;
    const d = target - fx;
    // Slow down early enough to stop exactly on the target.
    const wanted = Math.min(SPEED, Math.sqrt(2 * ACCEL * Math.abs(d)));
    vel += Math.max(-ACCEL * dt, Math.min(ACCEL * dt, wanted - vel));
    vel = Math.max(vel, 14);
    if (Math.abs(d) <= Math.max(vel * dt, 1)) {
      fx = target;
      target = null;
      vel = 0;
      notifyWalk(false);
    } else {
      fx += Math.sign(d) * vel * dt;
    }
    nx = Math.round(fx);
  }

  if (nx !== x || ny !== y) win.setPosition(nx, ny);
}

app.whenReady().then(() => {
  const config = loadConfig();
  const claude = new ClaudeBridge(config);
  win = createWindow(config.clickThrough);
  setInterval(tick, TICK_MS);

  claude.on("event", (e: ClaudeEvent) => win?.webContents.send("claude:event", e));

  ipcMain.on("chat:send", (_e, text: string) => {
    if (typeof text === "string" && text.trim()) claude.send(text.trim());
  });
  ipcMain.on("chat:cancel", () => claude.cancel());
  ipcMain.on("chat:new", () => claude.newSession());

  ipcMain.on("walk:random", () => {
    if (!win || dragging) return;
    const g = geometry();
    const [x] = win.getPosition();
    let next = x;
    for (let i = 0; i < 10 && Math.abs(next - x) < 160; i++) {
      next = Math.round(g.minX + Math.random() * (g.maxX - g.minX));
    }
    fx = x;
    vel = 0;
    target = next;
    notifyWalk(true, next > x ? 1 : -1);
  });
  ipcMain.on("walk:stop", stopWalking);

  ipcMain.on("window:move", (_e, dx: number, dy: number) => {
    if (!win) return;
    if (!dragging) {
      dragging = true;
      stopWalking();
    }
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.on("drag:end", () => {
    dragging = false;
  });

  ipcMain.on("window:interactive", (_e, on: boolean) => {
    if (config.clickThrough) win?.setIgnoreMouseEvents(!on, { forward: true });
  });

  ipcMain.on("menu:open", () => {
    Menu.buildFromTemplate([
      { label: "Новый разговор", click: () => (claude.newSession(), win?.webContents.send("chat:cleared")) },
      { label: "Открыть настройки", click: () => shell.openPath(configPath) },
      { type: "separator" },
      { label: "Выйти", click: () => app.quit() },
    ]).popup({ window: win ?? undefined });
  });

  ipcMain.handle("config:info", () => ({ workspace: config.workspace, fullAccess: config.fullAccess, hair: config.hair }));
});

app.on("window-all-closed", () => app.quit());
