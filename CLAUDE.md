# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Electron app with Vite HMR (starts embedded signaling on :8787)
npm test                 # vitest run (all tests, ~1s)
npx vitest run tests/chat.test.ts          # single test file
npx vitest run -t "wrong password"          # single test by name
npm run typecheck        # 4 separate tsc projects — see below; run this, there is no linter

npm run signaling        # standalone signaling server (PORT=9000 to change port)
npm run build:mobile     # mobile web client -> dist/mobile (server 503s without it)
npm run dev:mobile       # mobile client dev server on :5180 (auto-targets :8787 for WS)
npm run build            # bundle only -> out/
npm run build:mac        # .dmg — run on the target platform; cross-build unverified
npm run build:win        # NSIS .exe
```

`npm run typecheck` runs four `tsc` projects, each covering a different surface: `tsconfig.json`
(renderer + preload + shared), `tsconfig.node.json` (main + preload + shared),
`src/mobile-client/tsconfig.json`, and `tsconfig.tests.json`. A change can typecheck in one and
fail in another — always run the full script.

`scripts/` is gitignored: the ad-hoc `node scripts/test-*.mjs` harnesses referenced in README.md
are local-only and may be absent.

## Architecture

Three runtime surfaces share one protocol definition (`src/shared/types.ts`):

1. **Electron app** (`src/main`, `src/preload`, `src/renderer`) — the desktop app. Its codebase is
   role-agnostic: whether an instance is **host** (shares screen, executes input) or **controller**
   (views screen, sends input) is decided at runtime in the UI. A Mac can drive a Windows box and
   vice versa.
2. **Mobile web client** (`src/mobile-client`) — a plain Vite web app, controller-only. It imports
   `@renderer/lib/controllerSession` **unchanged**; adding features must not require host-side
   changes. Mobile browsers offer no screen capture, hence no host role.
3. **Signaling server** (`src/signaling-server`) — CommonJS Node/`ws`. Serves both the WebSocket
   handshake *and* `dist/mobile` over HTTP on the same port, so a phone needs exactly one URL and
   derives its WS URL from `location`.

### Data paths (the key mental model)

Four distinct channels, each chosen deliberately:

| What | Path | Why |
| --- | --- | --- |
| Screen video | WebRTC media track (P2P) | never touches the server |
| Mouse/keyboard | WebRTC DataChannel `myremote-input` | low latency |
| File transfer | separate DataChannel `myremote-files` | 16 KiB chunks would delay input events on a shared channel |
| Chat | relayed through the **signaling** server as `SignalPayload {kind:"chat"}` | must work *before* the peer connection exists (e.g. to agree on the password); the server needed no changes since it relays `signal` verbatim |

Host rejection (`{kind:"reject"}`, from the "confirm each connection" setting) rides the same
signal relay for the same reason.

### The DataChannel invariant

Both DataChannels **must** be created by `HostSession` before `createOffer()`. A DataChannel only
gets negotiated if it exists on the *offerer* at offer time — otherwise the SDP has no
`m=application` section and the channel stays in `connecting` forever. `ControllerSession` only
receives them via `ondatachannel`. `tests/helpers/fake-webrtc.ts` reproduces this SDP behavior
(measured against real Chrome) precisely so tests catch a regression here; don't "simplify" it into
a stub that opens every channel.

### Signaling flow

Host `register-host {id, password}` → controller `join {hostId, password}` → server checks the
password (`join-rejected` with `reason: "wrong-password"` on mismatch, no WebRTC handshake starts)
→ server relays `signal` messages both ways. One host, many controller sessions; the host holds one
`RTCPeerConnection` per `sessionId`. Repeated `join` on the *same* socket is idempotent — React
StrictMode double-mounts made that necessary.

`createSignalingServer()` must **not** listen on `require()`; only the CLI entry point
(`require.main === module`) does. Tests depend on this and start instances on port 0.
`src/main/embedded-signaling.ts` starts the server with the app and silently falls back to
`mode: "external"` on `EADDRINUSE` (another instance or `npm run signaling` already owns 8787) —
and then never stops it on quit.

### Main-process boundaries

`src/main/key-map.ts` (browser key → nut-js `Key` name) and `src/main/display-mapping.ts`
(normalized 0..1 coords → global multi-monitor coords) are deliberately **dependency-free** so they
can be unit-tested without Electron or nut-js, which are unavailable in the test process. Keep new
pure logic out of `input-simulation.ts` for the same reason. nut-js is loaded lazily: a missing
native build must not crash the main process.

## Conventions

- **Code comments and user-facing strings are German**, and comments explain *why* (often citing the
  bug that motivated the code). Match this — a terse English comment reads as foreign here.
- **Adding an IPC call** touches four files: `IPC_CHANNELS` + types in `src/shared/types.ts`, a
  handler in `src/main/index.ts`, a bridge method in `src/preload/index.ts` (the renderer sees it
  through `window.myremote`, typed via `src/renderer/src/global.d.ts`).
- **Adding a translation key** touches `src/renderer/src/i18n/types.ts` (the contract) and *all
  three* locales `de`/`en`/`zh`; `de` is the reference language. The mobile client has its own
  smaller dictionary (`src/mobile-client/src/i18n.ts`) but shares the `myremote:locale` storage key.
- **Path aliases** (`@shared`, `@renderer`, `@mobile`) are declared in five places that must stay in
  sync: `electron.vite.config.ts`, `src/mobile-client/vite.config.ts`, `vitest.config.ts`, and the
  tsconfigs.
- **localStorage keys** are shared between desktop and mobile: `myremote:locale`,
  `myremote:signalingUrl`, `myremote:settings`. Mobile session credentials use `sessionStorage`
  (`mydesk-mobile:session`) on purpose — they survive a reload but not a new tab.
- Packaging depends on `dist/mobile` and `src/signaling-server/**` being present (see
  `electron-builder.yml` `files`), so run `npm run build:mobile` before `build:mac`/`build:win`.

## Testing

Tests are integration-leaning by design: they run the **real** signaling server on an OS-assigned
port and the real `HostSession`/`ControllerSession`, substituting only WebRTC
(`installFakeWebRtc()`). `tests/ipad-remote-control.test.ts` covers the full chain iPad gesture →
signaling → host → nut-js key name. Prefer extending this style over mocking session classes.

## MVP limitations (intentional — don't "fix" without being asked)

STUN only, no TURN (`rtcConfig.ts`); `ws://` plaintext signaling with plaintext passwords held in
server memory; no reconnect on WebSocket/WebRTC drop; no clipboard sync; video only, no audio
(`audio: false` in `screenCapture.ts`).
