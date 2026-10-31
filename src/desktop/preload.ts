import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  action: (action: string) => ipcRenderer.invoke("action", action),
  onState: (callback: (state: unknown) => void) =>
    ipcRenderer.on("state", (_event, state) => callback(state)),
});
