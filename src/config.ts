import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Config {
  /** Directory Claude works in. */
  workspace: string;
  /** Tools Claude may use without asking (headless mode cannot prompt). */
  allowedTools: string[];
  /** Skip all permission checks. Gives full control of the PC; off by default. */
  fullAccess: boolean;
  /** "loose" curls or "ponytail"; the walking and wrench poses exist in one style only. */
  hair: "loose" | "ponytail";
  /** Let clicks pass through the empty parts of her window. Turn off if the window blocks the desktop. */
  clickThrough: boolean;
  model?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".config", "claude-chan");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULTS: Config = {
  workspace: os.homedir(),
  allowedTools: [
    "Read",
    "Glob",
    "Grep",
    "WebSearch",
    "WebFetch",
    "Bash(ls:*)",
    "Bash(wpctl:*)",
    "Bash(playerctl:*)",
    "Bash(notify-send:*)",
    "Bash(xdg-open:*)",
    "Bash(gdbus call:*)",
    "Bash(date:*)",
  ],
  fullAccess: false,
  hair: "loose",
  clickThrough: true,
};

export function loadConfig(): Config {
  try {
    const user = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>;
    return { ...DEFAULTS, ...user };
  } catch {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + "\n");
    return DEFAULTS;
  }
}

export const configPath = CONFIG_PATH;
