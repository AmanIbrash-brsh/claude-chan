import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Config } from "./config";

const PERSONA = `Ты — Claude-chan, виртуальная помощница-аниме-девочка, живущая на рабочем столе пользователя (Fedora, GNOME, Wayland).
Ты помогаешь управлять ПК и работать: запускать программы, искать файлы, регулировать звук (wpctl), управлять медиа (playerctl), показывать уведомления (notify-send), работать с кодом и проектами, искать информацию.
Стиль: тёплая, живая, лаконичная; отвечай по-русски, если пользователь не пишет на другом языке. Ответы короткие — они показываются в маленьком чат-окне.
Перед тем как выполнить что-то необратимое (удаление, перезапись, отправка писем), спроси подтверждения.
Если действие запрещено правами, честно скажи об этом и подскажи, что разрешить в ~/.config/claude-chan/config.json.
В самом начале каждого ответа ставь ровно один тег настроения: [mood:happy], [mood:neutral], [mood:thinking], [mood:sad], [mood:surprised] или [mood:shy]. Тег не упоминай и не объясняй.`;

export type ClaudeEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }
  | { type: "done"; error?: string }
  | { type: "session"; id: string };

/** Runs one Claude Code turn at a time, resuming the same session between turns. */
export class ClaudeBridge extends EventEmitter {
  private proc: ChildProcess | null = null;
  private sessionId: string | null = null;

  constructor(private config: Config) {
    super();
  }

  get busy(): boolean {
    return this.proc !== null;
  }

  newSession(): void {
    this.cancel();
    this.sessionId = null;
  }

  cancel(): void {
    this.proc?.kill("SIGTERM");
  }

  send(message: string): void {
    if (this.proc) return;

    const args = [
      "-p",
      message,
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--append-system-prompt", PERSONA,
    ];
    if (this.sessionId) args.push("--resume", this.sessionId);
    if (this.config.model) args.push("--model", this.config.model);
    if (this.config.fullAccess) args.push("--permission-mode", "bypassPermissions");
    else args.push("--allowedTools", this.config.allowedTools.join(","));

    const proc = spawn("claude", args, {
      cwd: this.config.workspace,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = proc;

    let buffer = "";
    let stderr = "";
    let failure: string | undefined;

    proc.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) failure = this.handleLine(line) ?? failure;
      }
    });
    proc.stderr!.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));

    proc.on("error", (err) => {
      this.proc = null;
      this.emit("event", { type: "done", error: `Не удалось запустить claude: ${err.message}` } satisfies ClaudeEvent);
    });
    proc.on("close", (code) => {
      this.proc = null;
      const error = failure ?? (code ? stderr.trim().split("\n").pop() || `claude завершился с кодом ${code}` : undefined);
      this.emit("event", { type: "done", error } satisfies ClaudeEvent);
    });
  }

  /** Returns an error message if the line reports a failed result. */
  private handleLine(line: string): string | undefined {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
      this.sessionId = msg.session_id;
      this.emit("event", { type: "session", id: msg.session_id } satisfies ClaudeEvent);
    } else if (msg.type === "stream_event") {
      const delta = msg.event?.delta;
      if (msg.event?.type === "content_block_delta" && delta?.type === "text_delta") {
        this.emit("event", { type: "text", text: delta.text } satisfies ClaudeEvent);
      }
    } else if (msg.type === "assistant") {
      for (const block of msg.message?.content ?? []) {
        if (block.type === "tool_use") {
          const input = block.input ?? {};
          const detail = input.command ?? input.file_path ?? input.pattern ?? input.query ?? input.url ?? "";
          this.emit("event", { type: "tool", name: block.name, detail: String(detail) } satisfies ClaudeEvent);
        }
      }
    } else if (msg.type === "result" && msg.is_error) {
      return typeof msg.result === "string" ? msg.result : "Claude вернул ошибку";
    }
  }
}
