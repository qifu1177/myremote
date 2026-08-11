# myremote

# myremote — Remote-Desktop MVP

Cross-platform remote-desktop/remote-control application (TeamViewer/AnyDesk-style) built with **Electron + React + TypeScript**, bundled via `electron-vite`. Screen sharing uses **WebRTC** (video track + DataChannel for input events); device pairing uses a **Host ID + password** exchanged through a bundled **Node.js/WebSocket signaling server**. The same app binary/codebase serves both roles — "Host" (share screen) or "Controller" (enter ID+password) — decided at runtime in the UI, so any platform can control any other.

## Commands

```bash
npm install                 # also rebuilds native nut-js module for the current platform
npm run dev                 # electron-vite dev — hot-reloading Electron app
npm run typecheck           # AUTHORITATIVE GATE — tsc --noEmit for renderer/preload/shared + main
npm run build                # electron-vite build (production bundles)
npm run build:mac           # build + electron-builder --mac
npm run build:win           # build + electron-builder --win
npm run preview              # electron-vite preview
npm run signaling            # node src/signaling-server/server.js — run signaling server standalone
node scripts/test-signaling.mjs   # manual/ad-hoc script exercising the signaling server (no test framework configured)
```

There is no automated test runner (`npm test`) and no lint script in this repo — **`npm run typecheck` is the verification gate**. It runs `tsc` twice: once for `tsconfig.json` (renderer, preload, shared, `--noEmit`) and once for `tsconfig.node.json` (main process / Electron config). Run both when validating changes touching main-process code.

## Tech Stack

- **Electron 31** (main/preload/renderer split, bootstrapped by `electron-vite`)
- **React 18 + TypeScript 5** for the renderer UI (via `@vitejs/plugin-react`)
- **Vite 5** as the underlying bundler (`electron.vite.config.ts`)
- **WebRTC** (browser-native APIs in the renderer) for video streaming + DataChannel
- **`ws`** — WebSocket library powering the standalone signaling server
- **`@nut-tree-fork/nut-js`** — native mouse/keyboard simulation library used only in the main process, requires native build tools/rebuild (`electron-builder install-app-deps` runs on `postinstall`)
- **`electron-builder`** for packaging (`electron-builder.yml`), macOS/Windows targets
- Path aliases: `@shared/*` → `src/shared/*`, `@renderer/*` → `src/renderer/src/*`

## Architecture

**Process split (Electron three-process model):**
- `src/main/` — main process. `index.ts` bootstraps the app window and registers IPC handlers; `id.ts` generates the Host ID + password pair used for pairing; `input-simulation.ts` wraps `nut-js` to inject mouse/keyboard events received from a remote Controller. This is the only place native input injection happens.
- `src/preload/` — a `contextBridge` API surface (`index.ts`) that is the *sole* channel between renderer and main. Renderer code never talks to Node/Electron APIs directly.
- `src/renderer/` — the React UI, running fully sandboxed, WebRTC and signaling logic lives here (browser context, not Node).
- `src/signaling-server/` — a standalone Node process (`server.js`, run via `npm run signaling`, not launched by Electron itself) that relays pairing/signaling messages (offers/answers/ICE candidates) between a Host and a Controller by ID.
- `src/shared/types.ts` — TypeScript types shared across renderer/preload/main defining the IPC and signaling protocol shapes. Keep this the single source of truth when the message contract changes.

**Runtime data flow (Host ↔ Controller):**
1. On the **Host** side, the user shares their screen: `screenCapture.ts` captures the display stream, `hostSession.ts` creates an `RTCPeerConnection` (config from `rtcConfig.ts`), and generates an offer.
2. `signalingClient.ts` sends/receives signaling messages (offer/answer/ICE) over WebSocket to the standalone signaling server, keyed by the Host's ID+password.
3. On the **Controller** side, `controllerSession.ts` connects using the entered ID+password, receives the offer via `signalingClient.ts`, creates an answer, and establishes the peer connection.
4. Once connected, the video track renders in `RemoteView.tsx` on the Controller; a WebRTC **DataChannel** carries mouse/keyboard events from the Controller back to the Host.
5. On the Host, incoming DataChannel input events are forwarded through the preload bridge via IPC to the main process, where `input-simulation.ts` replays them locally using `nut-js`.

**UI composition:** `App.tsx` renders `Sidebar.tsx` plus page routing between `ConnectPage.tsx` (host/connect flows using `HostCard.tsx`, `ConnectCard.tsx`, `RecentConnections.tsx`, `StatusBadge.tsx`) and `SettingsPage.tsx`. Hooks (`useAppInfo`, `useRecentConnections`, `useSignalingUrl`) isolate cross-cutting state (app metadata, connection history, configurable signaling server URL) from the components.

**Conventions & gotchas:**
- Because Host and Controller share one codebase, role-specific logic (`hostSession.ts` vs `controllerSession.ts`) must stay symmetric with respect to the shared protocol in `src/shared/types.ts` — changing a message shape requires updating both sides plus the signaling server.
- The signaling server is a separate deployable Node process, not part of the Electron bundle; it must be run/hosted independently (`npm run signaling`) and its URL is configurable at runtime via `useSignalingUrl`.
- Native input simulation (`nut-js`) only works in the main process; never attempt to call it from renderer/preload code — route input events through IPC.
- `tsconfig.json` and `tsconfig.node.json` cover different parts of the codebase (renderer/preload/shared vs. main/build config) — both must typecheck cleanly.
- There's a `.fena/` directory (session/working-state DB for the AI agent tooling itself) — not part of the application source, no need to inspect it when reasoning about app behavior.

<!-- Generated by Fena Init. Edit freely; the worker reads this file as project context. -->
