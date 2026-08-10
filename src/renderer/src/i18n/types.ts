// Zentrale Typdefinition für alle Übersetzungstexte der App.
// "de" (src/renderer/src/i18n/locales/de.ts) ist die Referenzsprache; jede
// weitere Sprache muss exakt diese Struktur erfüllen (siehe locales/*.ts).
export type Locale = "de" | "en" | "zh";

export interface Translations {
  sidebar: {
    connect: string;
    addressBook: string;
    settings: string;
  };
  hostCard: {
    yourId: string;
    copyId: string;
    password: string;
    hidePassword: string;
    showPassword: string;
    regeneratePassword: string;
    copyPassword: string;
    accessibilityHint: string;
    shareScreen: string;
    stopSharing: string;
    chooseScreen: string;
    peersConnected: (count: number) => string;
    waitingForConnection: string;
    hint: string;
    confirmIncomingConnection: string;
  };
  connectCard: {
    title: string;
    partnerId: string;
    partnerIdPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    hidePassword: string;
    showPassword: string;
    connecting: string;
    connect: string;
    hint: string;
  };
  recentConnections: {
    title: string;
    empty: string;
    emptyFavorites: string;
    justNow: string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
    tabHistory: string;
    tabFavorites: string;
    addFavorite: string;
    removeFavorite: string;
    edit: string;
    delete: string;
    save: string;
    cancel: string;
    editPlaceholder: string;
    confirmDelete: string;
  };
  remoteView: {
    disconnect: string;
    remoteControlActive: string;
    connecting: string;
    connected: string;
    disconnected: string;
    rejected: string;
    error: string;
    waitingForStream: string;
    wrongPassword: string;
    connectionRejected: (reason: string) => string;
    fileTransfer: string;
    chat: string;
    fullscreen: string;
    exitFullscreen: string;
    featureNotAvailable: string;
    connectionInfo: (resolution: string, latencyMs: number) => string;
  };
  connectPage: {
    title: string;
    subtitle: string;
  };
  /** Karte "Vom Tablet/Handy steuern" (QR-Code für den Mobile-Client). */
  mobileAccess: {
    title: string;
    subtitle: string;
    qrAlt: string;
    copyUrl: string;
    copied: string;
    loopbackHint: string;
    hint: string;
  };
  addressBook: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    groupTeam: string;
    groupFavorites: string;
    empty: string;
    online: string;
    offline: string;
    addTitle: string;
    namePlaceholder: string;
    idPlaceholder: string;
    add: string;
    edit: string;
    delete: string;
    save: string;
    cancel: string;
    confirmDelete: string;
    connect: string;
  };
  settingsPage: {
    title: string;
    subtitle: string;
    signalingServer: string;
    websocketUrl: string;
    signalingHintPrefix: string;
    signalingHintSuffix: string;
    systemInfo: string;
    platform: (p: string) => string;
    language: string;
    languageHint: string;
    navGeneral: string;
    navSecurity: string;
    navDisplay: string;
    navLanguage: string;
    navNetwork: string;
    networkTitle: string;
    networkHint: string;
    securityTitle: string;
    randomPasswordOnStart: string;
    randomPasswordOnStartHint: string;
    confirmEachConnection: string;
    confirmEachConnectionHint: string;
    twoFactor: string;
    twoFactorHint: string;
    displayTitle: string;
    qualityBest: string;
    qualityBestHint: string;
    qualityBalanced: string;
    qualityBalancedHint: string;
    qualityFast: string;
    qualityFastHint: string;
    showRemoteCursor: string;
    fitToWindow: string;
    relayServer: string;
    relayServerHint: string;
    directIpAccess: string;
    directIpAccessHint: string;
    port: string;
  };
  languages: {
    de: string;
    en: string;
    zh: string;
  };
}
