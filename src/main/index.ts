import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, systemPreferences } from "electron";
import { join } from "path";
import { is } from "./is";
import { generateHostId, generateHostPassword } from "./id";
import { applyRemoteInputEvent } from "./input-simulation";
import { detectLanAddress } from "./lan-address";
import { IPC_CHANNELS, type AppInfo, type DesktopSource, type RemoteInputEvent } from "@shared/types";

// App-Name explizit setzen: Im gepackten Build liefert electron-builder
// (productName in electron-builder.yml) bereits "mydesk" über CFBundleName/
// package.json, im Dev-Modus (electron-vite dev) würde Electron sonst den
// "name" aus package.json ("myremote") verwenden. Damit der beim Hovern
// über das Dock-/Fenster-Icon angezeigte Tooltip-Name konsistent "mydesk"
// lautet, setzen wir ihn hier zusätzlich hart.
app.setName("mydesk");

// Für die gesamte App-Laufzeit feste Host-Zugangsdaten (bei jedem Start neu generiert).
// hostPassword ist bewusst "let": Über den "Aktualisieren"-Button im Host-Karten-UI
// (Passwort neu generieren) kann der Renderer per IPC ein neues Passwort anfordern.
const hostId = generateHostId();
let hostPassword = generateHostPassword();

let mainWindow: BrowserWindow | null = null;

// App-Icon: In der Entwicklung liegt es im Projektordner unter build/icon.png,
// im gepackten Build wird es (siehe electron-builder.yml "extraResources") in
// den Resources-Ordner der App kopiert. Für macOS-Paketierung wird zusätzlich
// build/icon.icns automatisch von electron-builder als Dock-/Finder-Icon der
// .app verwendet (Konvention über "directories.buildResources").
function resolveIconPath(): string {
  if (is.dev) {
    return join(__dirname, "../../build/icon.png");
  }
  return join(process.resourcesPath, "icon.png");
}

function createWindow(): void {
  const iconPath = resolveIconPath();

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#12151b",
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  // Wir nutzen bewusst getUserMedia() mit chromeMediaSourceId (Quelle wird
  // manuell über desktopCapturer ausgewählt) statt getDisplayMedia(), daher
  // ist kein setDisplayMediaRequestHandler nötig.

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();

  // Auf macOS wird das Dock-Icon im gepackten Build aus dem Info.plist
  // (build/icon.icns, von electron-builder eingebunden) übernommen; im
  // Dev-Modus (electron-vite dev, ungepackt) zeigt Electron sonst nur das
  // generische Electron-Icon, daher setzen wir es hier explizit.
  if (process.platform === "darwin" && is.dev) {
    const dockIcon = nativeImage.createFromPath(resolveIconPath());
    if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon);
  }

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.getAppInfo, (): AppInfo => {
    // Bei jedem Aufruf neu ermitteln: Die LAN-Adresse kann sich zur Laufzeit
    // ändern (WLAN-Wechsel, neuer DHCP-Lease).
    return { platform: process.platform, hostId, hostPassword, lanAddress: detectLanAddress() };
  });

  ipcMain.handle(IPC_CHANNELS.getDesktopSources, async (): Promise<DesktopSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 300, height: 180 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }));
  });

  ipcMain.handle(IPC_CHANNELS.checkAccessibilityPermission, (): boolean => {
    if (process.platform !== "darwin") return true;
    try {
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.requestScreenPermission, (): string => {
    if (process.platform !== "darwin") return "granted";
    try {
      return systemPreferences.getMediaAccessStatus("screen");
    } catch {
      return "unknown";
    }
  });

  ipcMain.on(IPC_CHANNELS.simulateInput, (_event, evt: RemoteInputEvent) => {
    void applyRemoteInputEvent(evt);
  });

  ipcMain.handle(IPC_CHANNELS.regenerateHostPassword, (): string => {
    hostPassword = generateHostPassword();
    return hostPassword;
  });
}
