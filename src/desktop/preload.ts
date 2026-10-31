import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("desktop", {
  action: (action: string, value?: string) => ipcRenderer.invoke("action", action, value),
  onState: (callback: (state: unknown) => void) =>
    ipcRenderer.on("state", (_event, state) => callback(state)),
});
