import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("chan", {
  send: (text: string) => ipcRenderer.send("chat:send", text),
  cancel: () => ipcRenderer.send("chat:cancel"),
  newChat: () => ipcRenderer.send("chat:new"),
  walkRandom: () => ipcRenderer.send("walk:random"),
  walkStop: () => ipcRenderer.send("walk:stop"),
  moveWindow: (dx: number, dy: number) => ipcRenderer.send("window:move", dx, dy),
  dragEnd: () => ipcRenderer.send("drag:end"),
  setInteractive: (on: boolean) => ipcRenderer.send("window:interactive", on),
  openMenu: () => ipcRenderer.send("menu:open"),
  info: () => ipcRenderer.invoke("config:info"),
  onEvent: (cb: (e: unknown) => void) => ipcRenderer.on("claude:event", (_e, data) => cb(data)),
  onWalk: (cb: (s: unknown) => void) => ipcRenderer.on("walk:state", (_e, data) => cb(data)),
  onCleared: (cb: () => void) => ipcRenderer.on("chat:cleared", () => cb()),
});
