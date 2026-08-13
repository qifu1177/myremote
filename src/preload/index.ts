import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type AppInfo,
  type DesktopSource,
  type PermissionStatus,
  type PrivacyPane,
  type RemoteInputEvent,
} from "@shared/types";

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getDesktopSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke(IPC_CHANNELS.getDesktopSources),
  getPermissions: (): Promise<PermissionStatus> => ipcRenderer.invoke(IPC_CHANNELS.getPermissions),
  openPrivacySettings: (pane: PrivacyPane): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.openPrivacySettings, pane),
  simulateInput: (evt: RemoteInputEvent): void => ipcRenderer.send(IPC_CHANNELS.simulateInput, evt),
  setInputDisplay: (displayId: string | null): void =>
    ipcRenderer.send(IPC_CHANNELS.setInputDisplay, displayId),
  regenerateHostPassword: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.regenerateHostPassword),
  setStayAwake: (active: boolean): void => ipcRenderer.send(IPC_CHANNELS.setStayAwake, active),
};

export type MyRemoteApi = typeof api;

contextBridge.exposeInMainWorld("myremote", api);
