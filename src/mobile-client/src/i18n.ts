/**
 * Kompakte Übersetzungen für den Mobile-Client.
 *
 * Die Desktop-App bringt ein umfangreicheres i18n-Modul mit
 * (`src/renderer/src/i18n`), dessen Texte jedoch auf Desktop-Bedienung
 * zugeschnitten sind. Der Mobile-Client hat eigene Begriffe (Gesten,
 * Tastenleiste), verwendet aber dieselben Sprachcodes und denselben
 * localStorage-Schlüssel, damit die Sprachwahl konsistent bleibt.
 */
export type Locale = "de" | "en" | "zh";

const STORAGE_KEY = "myremote:locale";

export interface MobileTexts {
  appName: string;
  tagline: string;
  hostId: string;
  hostIdPlaceholder: string;
  password: string;
  passwordPlaceholder: string;
  server: string;
  serverHint: string;
  connect: string;
  connecting: string;
  connected: string;
  disconnected: string;
  rejected: string;
  wrongPassword: string;
  hostNotFound: string;
  error: string;
  disconnect: string;
  waitingForStream: string;
  recent: string;
  clearRecent: string;
  advanced: string;
  keyboard: string;
  hideKeyboard: string;
  leftClick: string;
  rightClick: string;
  drag: string;
  dragActive: string;
  resetZoom: string;
  settings: string;
  modeTrackpad: string;
  modeDirect: string;
  modeHint: string;
  sensitivity: string;
  naturalScroll: string;
  gesturesTitle: string;
  gestures: string[];
  close: string;
  installHint: string;
  retry: string;
  fullscreen: string;
}

const de: MobileTexts = {
  appName: "mydesk Mobile",
  tagline: "Mac oder Windows vom Tablet/Handy fernsteuern",
  hostId: "Partner-ID",
  hostIdPlaceholder: "z. B. 482 913 607",
  password: "Passwort",
  passwordPlaceholder: "Passwort des Hosts",
  server: "Signaling-Server",
  serverHint: "Adresse des Servers, den auch der Host verwendet.",
  connect: "Verbinden",
  connecting: "Verbinde …",
  connected: "Verbunden",
  disconnected: "Verbindung getrennt",
  rejected: "Abgelehnt",
  wrongPassword: "Falsches Passwort.",
  hostNotFound: "Host nicht gefunden. Läuft die Bildschirmfreigabe?",
  error: "Fehler",
  disconnect: "Trennen",
  waitingForStream: "Warte auf Bildschirm …",
  recent: "Zuletzt verbunden",
  clearRecent: "Verlauf löschen",
  advanced: "Erweitert",
  keyboard: "Tastatur",
  hideKeyboard: "Tastatur ausblenden",
  leftClick: "Linksklick",
  rightClick: "Rechtsklick",
  drag: "Ziehen",
  dragActive: "Ziehen aktiv",
  resetZoom: "Zoom zurücksetzen",
  settings: "Steuerung",
  modeTrackpad: "Trackpad",
  modeDirect: "Direkt",
  modeHint: "Trackpad: Zeiger relativ bewegen (präzise). Direkt: Zeiger springt zum Finger.",
  sensitivity: "Empfindlichkeit",
  naturalScroll: "Natürliches Scrollen",
  gesturesTitle: "Gesten",
  gestures: [
    "1× tippen = Linksklick",
    "2× tippen = Doppelklick",
    "Mit 2 Fingern tippen = Rechtsklick",
    "Ziehen = Zeiger bewegen",
    "Lang drücken + ziehen = Ziehen mit Maustaste",
    "2 Finger schieben = Scrollen",
    "2 Finger auf-/zuziehen = Zoomen",
  ],
  close: "Schließen",
  installHint: "Tipp: Über „Zum Home-Bildschirm“ läuft mydesk im Vollbild.",
  retry: "Erneut versuchen",
  fullscreen: "Vollbild",
};

const en: MobileTexts = {
  appName: "mydesk Mobile",
  tagline: "Control your Mac or Windows PC from tablet/phone",
  hostId: "Partner ID",
  hostIdPlaceholder: "e.g. 482 913 607",
  password: "Password",
  passwordPlaceholder: "Host password",
  server: "Signaling server",
  serverHint: "Address of the server the host uses as well.",
  connect: "Connect",
  connecting: "Connecting …",
  connected: "Connected",
  disconnected: "Disconnected",
  rejected: "Rejected",
  wrongPassword: "Wrong password.",
  hostNotFound: "Host not found. Is screen sharing running?",
  error: "Error",
  disconnect: "Disconnect",
  waitingForStream: "Waiting for screen …",
  recent: "Recent connections",
  clearRecent: "Clear history",
  advanced: "Advanced",
  keyboard: "Keyboard",
  hideKeyboard: "Hide keyboard",
  leftClick: "Left click",
  rightClick: "Right click",
  drag: "Drag",
  dragActive: "Dragging",
  resetZoom: "Reset zoom",
  settings: "Control",
  modeTrackpad: "Trackpad",
  modeDirect: "Direct",
  modeHint: "Trackpad: move pointer relatively (precise). Direct: pointer jumps to finger.",
  sensitivity: "Sensitivity",
  naturalScroll: "Natural scrolling",
  gesturesTitle: "Gestures",
  gestures: [
    "Single tap = left click",
    "Double tap = double click",
    "Two-finger tap = right click",
    "Drag = move pointer",
    "Long press + drag = drag with button held",
    "Two-finger swipe = scroll",
    "Pinch = zoom",
  ],
  close: "Close",
  installHint: "Tip: use “Add to Home Screen” to run mydesk full screen.",
  retry: "Try again",
  fullscreen: "Full screen",
};

const zh: MobileTexts = {
  appName: "mydesk 移动版",
  tagline: "用平板或手机远程控制 Mac 或 Windows",
  hostId: "伙伴 ID",
  hostIdPlaceholder: "例如 482 913 607",
  password: "密码",
  passwordPlaceholder: "主机密码",
  server: "信令服务器",
  serverHint: "与主机使用的服务器地址相同。",
  connect: "连接",
  connecting: "正在连接 …",
  connected: "已连接",
  disconnected: "连接已断开",
  rejected: "已拒绝",
  wrongPassword: "密码错误。",
  hostNotFound: "未找到主机，屏幕共享是否已开启？",
  error: "错误",
  disconnect: "断开",
  waitingForStream: "正在等待画面 …",
  recent: "最近连接",
  clearRecent: "清除记录",
  advanced: "高级",
  keyboard: "键盘",
  hideKeyboard: "隐藏键盘",
  leftClick: "左键",
  rightClick: "右键",
  drag: "拖拽",
  dragActive: "拖拽中",
  resetZoom: "重置缩放",
  settings: "控制",
  modeTrackpad: "触控板",
  modeDirect: "直接",
  modeHint: "触控板：相对移动指针（精确）。直接：指针跳到手指位置。",
  sensitivity: "灵敏度",
  naturalScroll: "自然滚动",
  gesturesTitle: "手势",
  gestures: [
    "单击 = 左键",
    "双击 = 双击",
    "双指点击 = 右键",
    "拖动 = 移动指针",
    "长按后拖动 = 按住左键拖拽",
    "双指滑动 = 滚动",
    "双指开合 = 缩放",
  ],
  close: "关闭",
  installHint: "提示：添加到主屏幕可全屏运行。",
  retry: "重试",
  fullscreen: "全屏",
};

const dictionaries: Record<Locale, MobileTexts> = { de, en, zh };

export const locales: Locale[] = ["de", "en", "zh"];

export const localeLabels: Record<Locale, string> = {
  de: "Deutsch",
  en: "English",
  zh: "中文",
};

function isLocale(value: string | null): value is Locale {
  return value === "de" || value === "en" || value === "zh";
}

/** Gespeicherte Sprache, sonst Browsersprache, sonst Deutsch. */
export function detectLocale(): Locale {
  const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) return stored;
  const nav = typeof navigator === "undefined" ? "" : navigator.language.slice(0, 2);
  if (isLocale(nav)) return nav;
  return "de";
}

export function storeLocale(locale: Locale): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, locale);
}

export function textsFor(locale: Locale): MobileTexts {
  return dictionaries[locale];
}
