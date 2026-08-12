# myremote — Remote-Desktop MVP

Ein funktionsfähiges Cross-Platform-MVP für Fernzugriff/Fernsteuerung
(ähnlich TeamViewer/AnyDesk), gebaut mit **Electron + React + TypeScript +
Vite** (via `electron-vite`). Die Bildschirmübertragung erfolgt per
**WebRTC** (Video-Stream + DataChannel), die Kopplung zweier Geräte über
eine **ID + Passwort**-Kombination und einen mitgelieferten
**Node.js/WebSocket-Signaling-Server**.

Die App-Codebasis ist identisch für Host und Controller — welche Rolle ein
Gerät einnimmt, wird zur Laufzeit in der UI entschieden (Bildschirm freigeben
= Host, ID+Passwort eingeben = Controller). Ein Mac kann daher problemlos
einen Windows-Rechner steuern und umgekehrt.

## Architektur

```
myremote/
├── src/
│   ├── main/                # Electron Main-Prozess
│   │   ├── index.ts          # App-Bootstrap, IPC-Handler, Fenster
│   │   ├── id.ts              # Generierung von Host-ID + Passwort
│   │   └── input-simulation.ts# Maus-/Tastatursimulation via nut-js
│   ├── mobile-client/          # Mobile-Web-Client (Vite, Browser)
│   │   └── src/
│   │       ├── components/     # ConnectScreen, RemoteScreen, KeyboardBar
│   │       ├── hooks/          # useDeviceClass, useMobileSettings
│   │       ├── lib/             # touchInput, keyboardInput, viewport
│   │       └── styles/          # mobile.css
│   ├── preload/               # contextBridge-API für den Renderer
│   ├── renderer/               # React-UI (Vite)
│   │   └── src/
│   │       ├── components/     # HostCard, ConnectCard, RemoteView, …
│   │       ├── pages/          # ConnectPage, SettingsPage
│   │       ├── lib/             # WebRTC-/Signaling-Client-Logik
│   │       └── styles/          # Design-Tokens (an Vorlage angelehnt)
│   ├── signaling-server/       # Eigenständiger Node/WS-Server
│   └── shared/                 # Gemeinsame TypeScript-Typen/Protokoll
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

## Setup

Voraussetzungen: Node.js ≥ 18, npm.

```bash
npm install
```

`@nut-tree-fork/nut-js` (native Input-Simulation) wird dabei für die
aktuelle Plattform mitgebaut. Auf manchen Systemen sind dafür Build-Tools
nötig (macOS: Xcode Command Line Tools `xcode-select --install`; Windows:
`windows-build-tools`/Visual Studio Build Tools). Falls der native Build
fehlschlägt, startet die App trotzdem — der Host-Modus zeigt den Fehler
dann erst beim ersten Eingabe-Event in der Konsole.

## Starten (Entwicklung)

### 1. Signaling-Server starten

```bash
npm run signaling
```

Startet einen WebSocket-Server auf `ws://localhost:8787` (Port über die
Umgebungsvariable `PORT` änderbar). Er vermittelt nur den WebRTC-Handshake
(SDP/ICE) anhand von ID+Passwort — Bildschirm- und Eingabedaten laufen
danach direkt (P2P) zwischen Host und Controller.

Für Tests zwischen zwei physischen Rechnern im selben Netzwerk: Server auf
einem Rechner (oder z.B. einem Raspberry Pi/Server im LAN) starten und in
der App unter **Einstellungen → Signaling-Server** die LAN-IP eintragen,
z.B. `ws://192.168.1.20:8787`.

### 2. App starten

```bash
npm run dev
```

Startet Electron mit Vite-HMR für den Renderer. Es öffnet sich das
Hauptfenster mit dem "Fernzugriff"-Bildschirm (Design an die Vorlage
`Remote Desktop App.html` angelehnt: dunkles UI, Teal-Akzentfarbe, Karten
für "Ihre ID"/"Passwort" und "Verbindung herstellen").

### Zwei Instanzen lokal testen (Host + Controller auf einem Rechner)

1. `npm run signaling` in einem Terminal laufen lassen.
2. `npm run dev` starten → App-Fenster 1 (dient als **Host**).
3. Ein zweites Mal `npm run dev` in einem weiteren Terminal starten → es
   öffnet sich Fenster 2 (dient als **Controller**). Beide Instanzen nutzen
   denselben lokalen Vite-Dev-Server-Port nicht zwingend gemeinsam — jeder
   `electron-vite dev`-Aufruf startet einen eigenen Vite-Server auf einem
   freien Port; das ist unkritisch, da beide Instanzen sich nur über den
   Signaling-Server (Port 8787) finden.
4. In Fenster 1: **„Bildschirm freigeben“** klicken, eine Bildschirmquelle
   auswählen. Die angezeigte **ID** und das **Passwort** notieren.
5. In Fenster 2: ID + Passwort im Feld **„Verbindung herstellen“**
   eingeben und auf **„Verbinden“** klicken.
6. Es öffnet sich die Remote-Ansicht mit dem Live-Bildschirm von Fenster 1.
   Mausbewegungen/-klicks und Tastatureingaben in dieser Ansicht werden an
   den Host gesendet und dort per `nut-js` ausgeführt.

> Hinweis: Da beide Instanzen auf demselben Rechner laufen, wird der Host
> durch die vom Controller gesendeten Eingaben tatsächlich gesteuert —
> zum Testen am besten die Fenster nebeneinander anordnen und beobachten.

## Mobile Fernsteuerung (iPad, iPhone, Android)

Neben der Desktop-App gibt es einen **Mobile-Client** (`src/mobile-client/`):
eine reine Web-App, die vom Signaling-Server über denselben Port per HTTP
ausgeliefert wird. Auf dem Mobilgerät ist **keine Installation aus einem App
Store nötig** — es genügt der Browser. Der Mobile-Client tritt immer als
**Controller** auf; freigegeben wird der Bildschirm weiterhin von einem Mac
oder Windows-PC.

### Unterstützte Geräte

| Gerät | Browser | Status |
| --- | --- | --- |
| iPad / iPadOS 15+ | Safari, Chrome, Edge | unterstützt (empfohlen — größte Fläche) |
| iPhone / iOS 15+ | Safari, Chrome | unterstützt (kompaktes Phone-Layout) |
| Android-Phone/-Tablet 10+ | Chrome, Edge, Firefox | unterstützt |
| Desktop-Browser | Chrome, Edge, Safari, Firefox | funktioniert (v.a. zum Testen/Vorschau) |

Voraussetzung ist ein Browser mit **WebRTC** und **Touch Events**: Die
Remote-Ansicht registriert ausschließlich `touchstart`/`touchmove`/`touchend`/
`touchcancel` (`RemoteScreen.tsx`). Praktische Folge: Auf einem Gerät **ohne
Touch-Eingabe** (klassischer Desktop-Browser mit Maus) lässt sich der entfernte
Bildschirm zwar anzeigen, aber nicht per Zeigergerät bedienen — dort stehen nur
die Schaltflächen der unteren Leiste und die Tastaturleiste zur Verfügung. Das
Layout passt sich automatisch an (Phone/Tablet, Hoch-/Querformat) — siehe
`useDeviceClass.ts`.

### 1. Host + Server starten

1. Signaling-Server starten (er liefert zugleich den Mobile-Client aus):

   ```bash
   npm run build:mobile   # einmalig bzw. nach Änderungen am Mobile-Client
   npm run signaling
   # Kurzform für beides: npm run serve:mobile
   ```

   Beim Start listet der Server die erreichbaren Adressen auf, z.B.
   `http://192.168.1.20:8787/`.

   Der Port ist über die Umgebungsvariable `PORT` einstellbar (Standard
   `8787`) und gilt **für HTTP und WebSocket gemeinsam** — beide laufen im
   selben Prozess auf derselben Adresse:

   ```bash
   PORT=9000 npm run signaling   # Client: http://192.168.1.20:9000/
   ```

2. Desktop-App starten (`npm run dev` bzw. das gebaute `mydesk`) und dort
   **„Bildschirm freigeben“** klicken. Die angezeigte **ID** und das
   **Passwort** werden gleich auf dem Mobilgerät gebraucht.
3. Damit das Mobilgerät den Server erreicht, muss unter **Einstellungen →
   Signaling-Server** die **LAN-Adresse** des Rechners stehen (z.B.
   `ws://192.168.1.20:8787`). Steht dort `localhost`, weist die UI ausdrücklich
   darauf hin: „localhost“ zeigt auf dem Handy auf das Gerät selbst.
   Mobilgerät und Rechner müssen im **selben Netzwerk** sein.

**Läuft alles?** Der Server bietet dafür einen `/health`-Endpunkt, der JSON
zurückgibt:

```bash
curl http://192.168.1.20:8787/health
# {"ok":true,"mobileClient":true,"metrics":{…}}
```

`mobileClient: false` bedeutet, dass `dist/mobile` (noch) nicht gebaut ist.
In diesem Fall antwortet der Server auf alle übrigen HTTP-Anfragen mit
**HTTP 503** und dem Hinweis, einmalig `npm run build:mobile` auszuführen —
der häufigste Stolperstein beim ersten Start. Der WebSocket-Signaling-Teil
läuft davon unabhängig weiter.

### 2. Mobile-Client öffnen (QR-Code oder URL)

In der Desktop-App findet sich auf der Seite **„Fernzugriff“** die Karte
**„Vom Tablet oder Handy steuern“** (`MobileAccessCard.tsx`). Sie zeigt:

- einen **QR-Code**, den man mit der Kamera-App des iPads/iPhones bzw. der
  Kamera oder einem QR-Scanner unter Android scannt, und
- dieselbe **URL** als Text inklusive Kopier-Button, z.B.
  `http://192.168.1.20:8787/?id=482913607`.

Die Adresse einfach im Browser des Mobilgeräts öffnen.

**URL-Parameter zum Vorbelegen** (`App.tsx`):

| Parameter | Bedeutung | Beispiel |
| --- | --- | --- |
| `id` | Partner-ID des Hosts | `?id=482913607` |
| `pw` | Passwort (füllt das Passwortfeld vor) | `?pw=a1b2c3` |
| `server` | Signaling-URL, überschreibt die Einstellung | `?server=ws://192.168.1.20:8787` |

Alle drei lassen sich kombinieren, z.B.
`http://192.168.1.20:8787/?id=482913607&pw=a1b2c3`. Nach dem Auslesen entfernt
der Client die Parameter wieder aus der Adresszeile (`history.replaceState`),
damit die Zugangsdaten nicht dauerhaft sichtbar in der URL-Leiste oder im
Verlauf stehen.

> **Wichtig:** Der von der Desktop-App erzeugte **QR-Code enthält nur die ID,
> niemals das Passwort** (`mobileClientUrl.ts`). Das Passwort wird also auf dem
> Gerät eingegeben. Wer es dennoch bewusst mitgeben will (z.B. für einen
> selbst gebauten Link), kann `?pw=` verwenden — dann steht das Passwort
> allerdings im Klartext im Link.

> **Zum Home-Bildschirm hinzufügen (PWA):** Der Mobile-Client bringt ein
> Web-App-Manifest mit (`display: standalone`). Über *Teilen → „Zum
> Home-Bildschirm“* (iOS/iPadOS Safari) bzw. *Menü → „App installieren“ /
> „Zum Startbildschirm hinzufügen“* (Android Chrome) wird daraus ein eigenes
> Icon. Aus dem Home-Bildschirm gestartet läuft mydesk **ohne Browser-Leisten
> im Vollbild** — das ist auf iOS/iPadOS die einzige Möglichkeit für echtes
> Vollbild und lässt spürbar mehr Platz für den entfernten Bildschirm.

Die Signaling-Adresse muss auf dem Gerät normalerweise **nicht** eingetippt
werden: Da die Seite vom Signaling-Server selbst geladen wurde, leitet der
Client die WebSocket-URL aus der Seiten-URL ab (`defaultSignalingUrl()`).

`ws://` (unverschlüsselt) genügt dabei **funktional** vollständig: Der
Mobile-Client ruft selbst kein `getUserMedia()` auf — die Bildschirmaufnahme
passiert ausschließlich auf dem Host (`screenCapture.ts`). Ein *Secure Context*
(HTTPS) ist für den Client also **keine technische Voraussetzung**. `https://`/
`wss://` bleibt trotzdem eine **Sicherheitsempfehlung**, sobald das Netz nicht
vertrauenswürdig ist.

### 3. Bedienung der Remote-Ansicht

Ist die Verbindung aufgebaut, zeigt der Client den entfernten Bildschirm
formatfüllend (`RemoteScreen.tsx`):

- **Virtueller Cursor**: Der Client zeichnet die aktuelle Zeigerposition als
  eigenes Overlay über das Video. Das ist wichtig, weil der Finger die
  Trefferstelle verdeckt und der entfernte Mauszeiger im Videobild je nach
  Zoomstufe kaum zu erkennen ist — bei aktivem Ziehen wechselt das Overlay
  sichtbar in den „gedrückt“-Zustand.
- **Statusleiste oben**: Verbindungszustand, dazu im verbundenen Zustand die
  **Auflösung** des entfernten Bildschirms und die **Latenz (RTT)** in
  Millisekunden, z.B. `1920×1080 · 32 ms`. Beide Werte werden alle **2 Sekunden**
  aus `RTCPeerConnection.getStats()` bzw. aus dem Videoelement aktualisiert.
- **Bedienleisten ausblenden**: Die Schaltfläche **⤢** oben rechts blendet die
  obere und untere Leiste aus, sodass das Remote-Bild die volle Fläche nutzt.
  Über die kleine Schaltfläche **⌃** werden sie wieder eingeblendet.
- **Zoom**: Pinch-Zoom vergrößert die Ansicht stufenlos von **1× bis 6×**
  (rein lokal). Gezoomt wird immer um die **Bildmitte**; eine Geste zum
  Verschieben (Pan) des vergrößerten Ausschnitts gibt es nicht — dafür wird die
  Zeigerbewegung im Trackpad-Modus mit steigendem Zoom entsprechend feiner. Die
  Schaltfläche **„Zoom zurücksetzen“** in der unteren Leiste stellt 1× wieder
  her.
- **Vollbild**: Der Vollbild-Button erscheint nur auf Geräten außerhalb von
  iOS/iPadOS (dort gibt es die Fullscreen-API nicht — siehe Einschränkungen).
- **Haptisches Feedback**: Klicks und der Start eines Ziehvorgangs lösen eine
  kurze Vibration aus (`navigator.vibrate`). Das funktioniert nur auf
  **Android**; iOS/iPadOS ignoriert die API — dort bleibt es beim visuellen
  Feedback des virtuellen Cursors.

> **Autoplay-Hinweis:** Manche mobilen Browser blockieren die automatische
> Videowiedergabe. Bleibt das Bild nach dem Verbinden kurz schwarz, genügt
> **eine erste Berührung** der Ansicht — danach startet die Wiedergabe.

### 4. Gesten-Referenz

Die Gesten-Engine (`src/mobile-client/src/lib/touchInput.ts`) übersetzt
Fingergesten in die bestehenden `RemoteInputEvent`s:

| Geste | Wirkung |
| --- | --- |
| 1× tippen | Linksklick |
| 2× tippen (Doppeltipp) | Doppelklick (es werden zwei einzelne Klicks gesendet, die das Betriebssystem des Hosts als Doppelklick wertet) |
| Mit 2 Fingern tippen | **Rechtsklick** (das mobile Pendant zum Kontextmenü) |
| 1 Finger ziehen | Mauszeiger bewegen |
| Lang drücken (ca. 0,5 s) und ziehen | **Drag & Drop**: Nach ca. 500 ms wird die linke Maustaste gedrückt — auch ohne Bewegung. Anschließendes Ziehen verschiebt, das Loslassen des Fingers lässt die Maustaste wieder los. |
| 2 Finger schieben | Scrollen (vertikal/horizontal) |
| 2 Finger auf-/zuziehen | Pinch-Zoom **lokal** in die Bildschirmansicht hineinzoomen (1×–6×) |

Ein Rechtsklick ist also auf zwei Wegen erreichbar: als **Zwei-Finger-Tipp**
oder über die Schaltfläche in der unteren Leiste. Dort finden sich zusätzlich
**Linksklick**, **Ziehen** (umschaltbar, hält die Maustaste gedrückt),
**Tastatur**, **Modus** und **Zoom zurücksetzen** — praktisch, wenn eine Geste
in der jeweiligen Anwendung schwer zu treffen ist.

**Trackpad- vs. Direktmodus** (umschaltbar in der unteren Leiste der
Remote-Ansicht oder auf dem Verbindungsbildschirm unter **„Erweitert“ →
„Steuerung“**):

- **Trackpad** (Standard): Der Finger bewegt den Zeiger **relativ**, wie auf
  einem Notebook-Trackpad. Der Zeiger springt nicht unter den Finger, was auf
  einem großen entfernten Bildschirm deutlich präziser ist. Die
  **Empfindlichkeit** ist von 0,5× bis 3,0× einstellbar.
- **Direkt**: Der Zeiger springt **absolut** an die Position des Fingers —
  intuitiver für große Ziele (Buttons, Menüs), aber ungenauer bei kleinen
  Bedienelementen, weil der Finger die Trefferfläche verdeckt.

Die Scrollrichtung lässt sich über **„Natürliches Scrollen“** umkehren.
Pinch-Zoom wirkt nur auf die *lokale* Darstellung und wird **nicht** an den
Host übertragen — die Auflösung des entfernten Rechners ändert sich also nicht.

### 5. Bildschirmtastatur und Modifier-Leiste

Ein Tippen auf **⌨ Tastatur** öffnet die Bildschirmtastatur des Geräts
(`KeyboardBar.tsx`). Getippte Zeichen werden in `key-down`/`key-up`-Events
übersetzt und an den Host geschickt. Darüber liegt eine eigene Leiste mit:

- **Modifiern**: `Ctrl`, `Shift`, `Alt`/`⌥`, `Win`/`⌘` — sie arbeiten als
  **Sticky Keys**: einmal antippen aktiviert sie, sie gelten für den *nächsten*
  Tastendruck und lösen sich danach automatisch. So sind Kombinationen wie
  `Cmd+C` oder `Ctrl+Alt+Entf`-artige Kürzel mit einer Hand möglich.
- **Sondertasten**, die auf mobilen Tastaturen fehlen: `Esc`, `Tab`, `⏎`,
  `⌫`, `Entf`, Pfeiltasten, `Pos1`, `Ende`, `Bild↑`, `Bild↓`.
- **⌄** blendet die Tastatur wieder aus.

> **Beschriftung der Modifier:** Ob `⌘`/`⌥` oder `Win`/`Alt` angezeigt wird,
> entscheidet der Client anhand des **eigenen Mobilgeräts**
> (`/Mac/.test(navigator.platform)`), **nicht** anhand des Hosts. Auf
> iPad/iPhone steht dort daher immer `⌘`/`⌥` — auch wenn ein Windows-Rechner
> gesteuert wird; auf Android steht immer `Win`/`Alt`, auch bei einem Mac als
> Host. Das ist rein kosmetisch: Gesendet wird stets derselbe Modifier
> (`meta` bzw. `alt`), den der Host entsprechend seinem Betriebssystem
> auswertet.

### 6. Einstellungen & Verlauf

Auf dem Verbindungsbildschirm gibt es zusätzlich:

- **Sprache**: `Deutsch`, `English`, `中文` (de/en/zh). Der Mobile-Client nutzt
  denselben `localStorage`-Schlüssel wie die Desktop-App
  (`myremote:locale`), sodass die Sprachwahl im selben Browser-Profil
  konsistent bleibt.
- **Signaling-Server**: Unter **„Erweitert“** lässt sich die WebSocket-URL
  manuell überschreiben (sie wird ebenfalls unter demselben Schlüssel wie in
  der Desktop-App abgelegt, `myremote:signalingUrl`).
- **Steuerung** (ebenfalls unter „Erweitert“): Trackpad-/Direktmodus,
  Empfindlichkeit (0,5×–3,0×) und „Natürliches Scrollen“ — alle Einstellungen
  werden lokal gespeichert.
- **„Zuletzt verbunden“**: Der Client merkt sich die zuletzt genutzten
  Partner-IDs (maximal **8**, neueste zuerst). Ein Tippen übernimmt die ID ins
  Eingabefeld; einzelne Einträge lassen sich per **✕** entfernen, die ganze
  Liste über **„Verlauf löschen“**. **Passwörter werden nicht gespeichert.**

### Bekannte Einschränkungen des Mobile-Clients

- **Nur Controller-Rolle**: Ein Tablet/Handy kann einen Rechner steuern, aber
  seinen eigenen Bildschirm nicht freigeben (mobile Browser bieten keine
  Bildschirmaufnahme für WebRTC an).
- **Nur im LAN praktikabel**: Wie die Desktop-App nutzt der Mobile-Client nur
  **STUN, kein TURN** (`rtcConfig.ts`). Über Mobilfunk/restriktive NATs kommt
  oft keine P2P-Verbindung zustande (siehe „Bekannte Einschränkungen (MVP)“).
- **`http://` im LAN**: Der Mobile-Client wird unverschlüsselt ausgeliefert und
  signalisiert über `ws://`. Das ist funktional ausreichend (kein Secure
  Context nötig), für den Einsatz außerhalb eines vertrauenswürdigen Netzes ist
  aber `https://`/`wss://` (TLS) dringend zu empfehlen.
- **Kein Service Worker → keine echte Offline-PWA**: Die „Installation“ auf dem
  Home-Bildschirm ist lediglich eine **Vollbild-Verknüpfung**. Es wird nichts
  zwischengespeichert; der Signaling-Server muss beim Start der App erreichbar
  sein, sonst lädt sie nicht.
- **Kein Wake-Lock**: Der Bildschirmschoner bzw. das automatische Sperren des
  Mobilgeräts wird nicht verhindert. Für längere Sitzungen die Display-Sperre
  in den Geräteeinstellungen hochsetzen.
- **Vollbild auf iOS/iPadOS**: Weil die Fullscreen-API dort nicht zuverlässig
  zur Verfügung steht, blendet der Client den Vollbild-Button auf
  iPhone/iPad aus. Echtes Vollbild gibt es dort nur über „Zum Home-Bildschirm
  hinzufügen“.
- **Haptik nur auf Android**: `navigator.vibrate()` wird von iOS/iPadOS
  ignoriert.
- **Tastatur-Layout**: Es wird das Layout des *Hosts* wirksam. Umlaute,
  Tottasten und exotische Sonderzeichen werden nicht in jedem Layout korrekt
  abgebildet (dieselbe Einschränkung wie bei der Desktop-App).
- **Systemweite Kürzel** des Mobilgeräts (App-Wechsel, Home-Geste, iPadOS-Dock)
  fängt das Betriebssystem ab und erreichen den Host nicht.
- **Kein Clipboard-Sync, kein Dateitransfer**: Text lässt sich nicht zwischen
  Mobilgerät und Host austauschen.
- **Keine Audioübertragung**: Der Host nimmt bewusst nur Video auf
  (`audio: false` in `screenCapture.ts`).
- **Kein automatischer Reconnect**: Wird das Gerät gesperrt oder die App in den
  Hintergrund geschoben, kann die Verbindung abbrechen und muss manuell neu
  aufgebaut werden.
- **QR-Code nur in der Desktop-UI**: Es gibt kein CLI-Flag und keine
  Server-Ausgabe mit QR-Code; der Signaling-Server gibt beim Start nur die
  URLs als Text aus.

### Mobile-Client entwickeln und testen

```bash
npm run dev:mobile      # Vite-Dev-Server (Port 5180), Signaling separat auf 8787
npm run build:mobile    # Produktions-Build nach dist/mobile
npm run preview:mobile  # Vorschau des Builds

node scripts/test-touch-input.mjs        # Gesten-Engine (Tap, Rechtsklick, Scroll, Pinch, …)
node scripts/test-mobile-e2e.mjs         # Handshake Mobile -> Signaling -> Host (Server muss laufen)
node scripts/test-mobile-strictmode.mjs  # keine Doppelverbindung/-session (startet Server selbst,
                                         # setzt einen vorherigen `npm run build:mobile` voraus)
```

Der Dev-Server ist über `host: true` auch aus dem WLAN erreichbar
(`http://<LAN-IP>:5180`). Praktisch dabei: Erkennt der Client, dass er auf
Port **5180** läuft, verwendet er automatisch Port **8787** für die
WebSocket-Verbindung — im Dev-Modus muss die Signaling-URL also nicht von Hand
umgestellt werden, solange der Signaling-Server auf dem Standardport läuft.

## Signaling-Server isoliert testen

`scripts/test-signaling.mjs` ist ein kleines Ad-hoc-Testskript, das die
Kernlogik des Signaling-Servers (Host-Registrierung, Ablehnung bei falschem
Passwort, Annahme bei richtigem Passwort) automatisiert prüft:

```bash
npm run signaling &            # Server im Hintergrund starten
node scripts/test-signaling.mjs
```

## Host-ID/Passwort-Generierung testen

`scripts/test-id.mjs` prüft `generateHostId()`/`generateHostPassword()`
(`src/main/id.ts`) – Format, Länge, erlaubtes Zeichenset und Zufälligkeit der
für das Host↔Controller-Pairing verwendeten Zugangsdaten:

```bash
node --experimental-strip-types scripts/test-id.mjs
```

## Build (Distribution)

```bash
npm run build        # nur Bundle (out/), kein Installer
npm run build:mac    # macOS .dmg (electron-builder), auf einem Mac ausführen
npm run build:win    # Windows .exe/NSIS (electron-builder), auf Windows ausführen
```

Cross-Building (z.B. Windows-Installer von macOS aus) ist mit
electron-builder grundsätzlich möglich, wurde für dieses MVP aber nicht
verifiziert — am zuverlässigsten ist der Build jeweils auf der Zielplattform
oder über CI-Runner pro Plattform.

## Benötigte macOS-Berechtigungen

macOS verlangt für zwei Funktionen eine explizite Nutzerfreigabe in
**Systemeinstellungen → Datenschutz & Sicherheit**:

1. **Bildschirmaufnahme** — erforderlich, damit `desktopCapturer` den
   Bildschirminhalt liefert (Host-Modus). Beim ersten Freigabeversuch fragt
   macOS danach bzw. die App muss in der Liste manuell aktiviert werden;
   ein Neustart der App ist danach meist nötig.
2. **Bedienungshilfen (Accessibility)** — erforderlich, damit `nut-js`
   Maus-/Tastatureingaben simulieren darf (Host-Modus, um vom Controller
   gesteuert zu werden). Ohne diese Berechtigung werden Eingaben empfangen,
   aber nicht ausgeführt (Fehler erscheint in der Konsole). Die App prüft
   den Status beim Start der Bildschirmfreigabe und zeigt einen Hinweis an,
   falls die Berechtigung fehlt.

Im Dev-Modus muss die Berechtigung meist dem Terminal bzw. `Electron`
selbst (nicht einem fertig gebauten `myremote.app`) erteilt werden.

## Passwortschutz

Der Signaling-Server prüft bei jedem `join`-Versuch das übermittelte
Passwort gegen das beim `register-host` hinterlegte. Bei falschem Passwort
wird die Verbindung mit `join-rejected` (`reason: "wrong-password"`)
abgelehnt und in der Controller-UI angezeigt — es wird kein WebRTC-Handshake
gestartet.

## Chat zwischen zwei Geräten

Host und Controller können Textnachrichten austauschen — **vor und nach** dem
Aufbau der Bildschirmverbindung.

- **Controller**: In der Remote-Ansicht das Chat-Symbol in der Toolbar öffnen.
- **Host**: Nach dem Start der Bildschirmfreigabe erscheint neben dem
  Verbindungsstatus ein Chat-Symbol.
- Neue Nachrichten bei geschlossenem Chat werden durch einen Punkt am Symbol
  markiert.

Technisch laufen die Nachrichten über den **Signaling-Kanal** (Relay-Nachricht
`{ kind: "chat", message }` in `SignalPayload`, siehe `src/shared/types.ts`) und
nicht über den WebRTC-DataChannel. Nur so kann bereits geschrieben werden,
bevor die Peer-Verbindung steht (z.B. um das Passwort abzustimmen oder eine
Verbindung anzukündigen). Der Signaling-Server musste dafür nicht angepasst
werden, da er `signal`-Nachrichten unverändert weiterleitet. Der Host sendet
an alle aktuell beigetretenen Controller.

> Hinweis: Da der Chat über den Signaling-Server läuft, gilt für ihn nicht die
> Ende-zu-Ende-Verschlüsselung von WebRTC — er ist nur so sicher wie der
> Transport zum Signaling-Server (im MVP `ws://`, siehe Einschränkungen).

## Bekannte Einschränkungen (MVP)

- **NAT-Traversal / Internet-Verbindungen**: Es wird nur ein öffentlicher
  STUN-Server verwendet. Das reicht für Verbindungen im selben LAN oder mit
  "einfachem" NAT. Für zuverlässige Verbindungen über restriktive
  Firewalls/symmetrisches NAT (typisch bei manchen Unternehmens- oder
  Mobilfunknetzen) hinweg wird zusätzlich ein **TURN-Server** benötigt —
  siehe "Nächste Schritte".
- **Transportverschlüsselung**: WebRTC verschlüsselt Medien/DataChannel
  standardmäßig (DTLS-SRTP); der Signaling-Kanal selbst läuft im MVP über
  unverschlüsseltes `ws://`. Für den produktiven Einsatz über das offene
  Internet sollte der Signaling-Server über `wss://` (TLS) betrieben werden.
- **Passwort-Handling**: Passwörter werden für dieses MVP im Klartext an
  den Signaling-Server übertragen und dort im Prozessspeicher gehalten
  (keine Persistenz, kein Hashing). Für den produktiven Einsatz sollte
  mindestens TLS (`wss://`) sowie ein Challenge-Response-Verfahren statt
  Klartextübertragung genutzt werden.
- **Reconnect**: Bricht die WebSocket- oder WebRTC-Verbindung ab, wird sie
  nicht automatisch neu aufgebaut; der Nutzer muss die Verbindung erneut
  starten.
- **Eingabesimulation**: Tastatur-Mapping (`KEY_NAME_MAP` in
  `src/main/input-simulation.ts`) deckt die gängigsten Tasten ab, aber nicht
  jede Sondertaste/jedes Layout (z.B. Umlaute, Tottasten) 1:1.
- **Mehrere Displays**: Bei Multi-Monitor-Setups wird für die
  Eingabesimulation aktuell der primäre Bildschirm (`screen.getPrimaryDisplay`)
  als Referenzgröße für die Koordinatenumrechnung angenommen.
- **Kein Clipboard-Sync, kein Dateitransfer** (siehe "Nächste Schritte").
- **Chat**: Der Verlauf wird nicht gespeichert (nur im Speicher der laufenden
  Sitzung) und läuft über den Signaling-Server, ist also nicht
  Ende-zu-Ende-verschlüsselt. Der Mobile-Client hat noch keine Chat-Oberfläche.

## Nächste sinnvolle Schritte

1. **TURN-Server** (z.B. coturn) ergänzen und in `rtcConfig.ts` eintragen,
   für zuverlässige Verbindungen über das offene Internet/restriktive NATs.
2. **`wss://` + Auth-Token** für den Signaling-Server (TLS-Terminierung,
   z.B. hinter nginx/Caddy) statt Klartext-`ws://`.
3. **Clipboard-Synchronisation** zwischen Host und Controller.
4. **Dateitransfer** über einen zusätzlichen WebRTC-DataChannel.
5. **Bildschirmauswahl bei Multi-Monitor** auch im Controller (aktuell wird
   die zuerst ausgewählte Quelle des Hosts übertragen).
6. **Session-Persistenz/Reconnect** bei Netzwerkabbrüchen.
7. **Codesigning/Notarization** für macOS- und Windows-Builds, damit
   Installer ohne Sicherheitswarnungen laufen.
