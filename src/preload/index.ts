import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type AppInfo, type DesktopSource, type RemoteInputEvent } from "@shared/types";

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getDesktopSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke(IPC_CHANNELS.getDesktopSources),
  checkAccessibilityPermission: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.checkAccessibilityPermission),
  requestScreenPermission: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.requestScreenPermission),
  simulateInput: (evt: RemoteInputEvent): void => ipcRenderer.send(IPC_CHANNELS.simulateInput, evt),
  regenerateHostPassword: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.regenerateHostPassword),
};

export type MyRemoteApi = typeof api;

contextBridge.exposeInMainWorld("myremote", api);
