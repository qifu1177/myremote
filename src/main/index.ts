import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen,
  shell,
  systemPreferences,
} from "electron";
import { join } from "path";
import { is } from "./is";
import { generateHostId, generateHostPassword } from "./id";
import { applyRemoteInputEvent, setInputDisplayId } from "./input-simulation";
import { detectLanAddress } from "./lan-address";
import {
  IPC_CHANNELS,
  type AppInfo,
  type DesktopSource,
  type PermissionStatus,
  type PrivacyPane,
  type RemoteInputEvent,
} from "@shared/types";

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
    const displays = screen.getAllDisplays();
    return sources.map((s) => {
      // `display_id` ist die zuverlässige Zuordnung Quelle -> Bildschirm.
      // Fällt sie aus (kommt auf manchen Plattformen/Versionen vor), steckt
      // sie meist noch in der Quell-ID ("screen:<display_id>:0").
      const displayId = s.display_id || s.id.split(":")[1] || null;
      const display = displays.find((d) => String(d.id) === displayId) ?? null;
      return {
        id: s.id,
        name: s.name,
        thumbnailDataUrl: s.thumbnail.toDataURL(),
        displayId,
        size: display ? { width: display.size.width, height: display.size.height } : null,
      };
    });
  });

  ipcMain.handle(IPC_CHANNELS.getPermissions, (): PermissionStatus => {
    if (process.platform !== "darwin") return { accessibility: true, screen: "granted" };
    let accessibility = false;
    try {
      accessibility = systemPreferences.isTrustedAccessibilityClient(false);
    } catch {
      accessibility = false;
    }
    let screenStatus: PermissionStatus["screen"] = "unknown";
    try {
      screenStatus = systemPreferences.getMediaAccessStatus("screen") as PermissionStatus["screen"];
    } catch {
      screenStatus = "unknown";
    }
    return { accessibility, screen: screenStatus };
  });

  ipcMain.handle(IPC_CHANNELS.openPrivacySettings, async (_event, pane: PrivacyPane): Promise<void> => {
    if (process.platform !== "darwin") return;
    // Öffnet direkt den passenden Bereich in "Datenschutz & Sicherheit".
    // Zusätzlich lösen wir für die Bedienungshilfen den System-Dialog aus
    // (prompt = true), damit die App überhaupt in der Liste auftaucht.
    if (pane === "accessibility") {
      try {
        systemPreferences.isTrustedAccessibilityClient(true);
      } catch {
        /* Dialog nicht verfügbar: Nutzer öffnet die Einstellungen manuell */
      }
    }
    const anchor =
      pane === "accessibility"
        ? "Privacy_Accessibility"
        : "Privacy_ScreenCapture";
    await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${anchor}`);
  });

  ipcMain.on(IPC_CHANNELS.simulateInput, (_event, evt: RemoteInputEvent) => {
    void applyRemoteInputEvent(evt);
  });

  ipcMain.on(IPC_CHANNELS.setInputDisplay, (_event, displayId: string | null) => {
    setInputDisplayId(displayId);
  });

  ipcMain.handle(IPC_CHANNELS.regenerateHostPassword, (): string => {
    hostPassword = generateHostPassword();
    return hostPassword;
  });
}
