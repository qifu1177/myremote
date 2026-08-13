import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, RemoteInputEvent } from "@shared/types";
import { ControllerSession } from "@renderer/lib/controllerSession";
import { useFileTransfers } from "@renderer/hooks/useFileTransfers";
import { TouchInputController, type TouchPoint } from "../lib/touchInput";
import { MouseInputController } from "../lib/mouseInput";
import { IDENTITY_VIEWPORT, normToPoint, type Viewport } from "../lib/viewport";
import { KeyboardBar } from "./KeyboardBar";
import { ChatPanel } from "./ChatPanel";
import { FilePanel } from "./FilePanel";
import {
  NO_MODIFIERS,
  keyEventFromBrowser,
  type ModifierKey,
  type ModifierState,
} from "../lib/keyboardInput";
import type { MobileSettings } from "../hooks/useMobileSettings";
import type { DeviceInfo } from "../hooks/useDeviceClass";
import type { MobileTexts } from "../i18n";

interface RemoteScreenProps {
  hostId: string;
  password: string;
  settings: MobileSettings;
  onUpdateSettings: (patch: Partial<MobileSettings>) => void;
  texts: MobileTexts;
  device: DeviceInfo;
  onClose: () => void;
}

type ConnState = "connecting" | "connected" | "disconnected" | "rejected" | "error";

/** React-Touch-Liste in einfache Punkte in Container-Koordinaten übersetzen. */
function toPoints(touches: TouchList, rect: DOMRect): TouchPoint[] {
  const points: TouchPoint[] = [];
  for (let i = 0; i < touches.length; i += 1) {
    const t = touches[i];
    points.push({ id: t.identifier, x: t.clientX - rect.left, y: t.clientY - rect.top });
  }
  return points;
}

/**
 * Laufende Fernsteuerungs-Sitzung auf dem Mobilgerät.
 *
 * Nutzt die unveränderte `ControllerSession` der Desktop-App (gleiche
 * WebRTC-/Signaling-Logik) und ergänzt lediglich die Touch-Bedienung:
 * Gesten-Engine, virtueller Cursor, Zoom/Pan und Bildschirmtastatur.
 */
export function RemoteScreen({
  hostId,
  password,
  settings,
  onUpdateSettings,
  texts,
  device,
  onClose,
}: RemoteScreenProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ControllerSession | null>(null);

  const [state, setState] = useState<ConnState>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>(IDENTITY_VIEWPORT);
  const [cursor, setCursor] = useState({ xNorm: 0.5, yNorm: 0.5 });
  const [dragging, setDragging] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [modifiers, setModifiers] = useState<ModifierState>(NO_MODIFIERS);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [showControls, setShowControls] = useState(true);
  const [latencyMs, setLatencyMs] = useState(0);
  const [resolution, setResolution] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // Der Chat ist von Anfang an sichtbar: Er läuft über den Signaling-Kanal und
  // ist damit schon nutzbar, während der Bildschirm noch gar nicht ankommt.
  // Vorher war er hinter dem 💬-Knopf verborgen und beim Start der App im
  // Browser nicht zu sehen.
  const [chatVisible, setChatVisible] = useState(true);
  const [unreadChat, setUnreadChat] = useState(0);
  const [filesVisible, setFilesVisible] = useState(false);

  // Dateien laufen — anders als der Chat — über den WebRTC-DataChannel und
  // brauchen deshalb die stehende Peer-Verbindung. Derselbe Hook wie in der
  // Desktop-App: Beide Sessions bieten dieselbe sendFile-Signatur.
  const { transfers, callbacks: fileCallbacks, sendFiles } = useFileTransfers((file, onProgress) => {
    const session = sessionRef.current;
    if (!session) return Promise.reject(new Error(texts.filesWaitingForPeer));
    return session.sendFile(file, onProgress);
  });
  // Die Sitzungs-Callbacks entstehen einmalig beim Verbindungsaufbau; über das
  // Ref greifen sie trotzdem immer auf den aktuellen Stand zu.
  const fileCallbacksRef = useRef(fileCallbacks);
  fileCallbacksRef.current = fileCallbacks;

  // Spiegelt `chatVisible` für den Sitzungs-Callback (siehe onChatMessage).
  const chatVisibleRef = useRef(chatVisible);
  useEffect(() => {
    chatVisibleRef.current = chatVisible;
  }, [chatVisible]);

  const sendInput = useCallback((evt: RemoteInputEvent) => {
    sessionRef.current?.sendInput(evt);
  }, []);

  // Gesten-Controller lebt für die gesamte Sitzung (keine Neuerzeugung bei
  // jedem Render, sonst ginge der Gestenzustand verloren).
  const touch = useMemo(
    () =>
      new TouchInputController(
        {
          onInput: sendInput,
          onViewportChange: setViewport,
          onCursorChange: setCursor,
          onDragStateChange: setDragging,
          onFeedback: () => {
            // Kurzes haptisches Feedback, sofern das Gerät es unterstützt
            // (Android/Chrome; iOS ignoriert vibrate()).
            navigator.vibrate?.(10);
          },
        },
        settings,
      ),
    [sendInput],
  );

  // Maus-Steuerung für den Desktop-Browser. Eigene, schlanke Engine ohne
  // Gestenerkennung: Die echte Mausposition wird direkt abgebildet.
  const mouse = useMemo(() => new MouseInputController({ onInput: sendInput }), [sendInput]);

  useEffect(() => {
    touch.setConfig(settings);
  }, [touch, settings]);

  useEffect(() => () => touch.dispose(), [touch]);

  // --- Verbindung aufbauen ------------------------------------------------
  useEffect(() => {
    const session = new ControllerSession(settings.signalingUrl, hostId, password, {
      onRemoteStream: (stream) => {
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {
            /* Autoplay-Sperre: Nutzer tippt, dann startet die Wiedergabe */
          });
        }
      },
      onChatMessage: (msg) => {
        setChatMessages((prev) => [...prev, msg]);
        // Nur zählen, was der Nutzer nicht ohnehin gerade sieht. Über ein Ref,
        // weil dieser Callback beim Sitzungsaufbau einmalig erzeugt wird und
        // `chatVisible` sonst auf dem Startwert eingefroren bliebe.
        if (!chatVisibleRef.current) setUnreadChat((n) => n + 1);
      },
      onIncomingFile: (meta) => {
        fileCallbacksRef.current.onIncomingFile(meta);
        // Eine eingehende Datei soll nicht unbemerkt bleiben.
        setFilesVisible(true);
      },
      onIncomingFileProgress: (id, received, total) =>
        fileCallbacksRef.current.onIncomingFileProgress(id, received, total),
      onFileReceived: (file) => fileCallbacksRef.current.onFileReceived(file),
      onFileAborted: (id, reason) => fileCallbacksRef.current.onFileAborted(id, reason),
      onConnected: () => setState("connected"),
      onDisconnected: () => setState("disconnected"),
      onRejected: (reason) => {
        setState("rejected");
        setMessage(
          reason === "wrong-password"
            ? texts.wrongPassword
            : reason === "host-not-found"
              ? texts.hostNotFound
              : reason,
        );
      },
      onError: (msg) => {
        setState("error");
        setMessage(msg);
      },
    });
    sessionRef.current = session;
    session.connect().catch((err) => {
      setState("error");
      setMessage(err instanceof Error ? err.message : String(err));
    });
    return () => {
      session.disconnect();
      sessionRef.current = null;
    };
    // Zugangsdaten ändern sich während einer Sitzung nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, password, settings.signalingUrl]);

  // --- Containergröße beobachten (Rotation, Tastatur ein/aus) -------------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function measure(): void {
      const rect = el!.getBoundingClientRect();
      const size = { width: rect.width, height: rect.height };
      setContainerSize(size);
      touch.setContainer(size);
      mouse.setContainer(size);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [touch, mouse]);

  // --- Statusinfos (Auflösung/Latenz) -------------------------------------
  useEffect(() => {
    if (state !== "connected") return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (video?.videoWidth && video.videoHeight) {
        setResolution(`${video.videoWidth}×${video.videoHeight}`);
        const aspect = video.videoWidth / video.videoHeight;
        setVideoAspect(aspect);
        touch.setVideoAspect(aspect);
        mouse.setVideoAspect(aspect);
      }
      const pc = sessionRef.current?.peerConnection;
      pc?.getStats().then((stats) => {
        stats.forEach((report) => {
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded" &&
            typeof report.currentRoundTripTime === "number"
          ) {
            setLatencyMs(Math.round(report.currentRoundTripTime * 1000));
          }
        });
      });
    }, 2000);
    return () => window.clearInterval(interval);
  }, [state, touch, mouse]);

  useEffect(() => {
    touch.setViewport(viewport);
    mouse.setViewport(viewport);
  }, [touch, mouse, viewport]);

  // --- Touch-Handler ------------------------------------------------------
  // Bewusst als native Listener mit { passive: false }: React-Handler sind in
  // Chrome für touchmove passiv, preventDefault() (Scroll-Unterdrückung)
  // würde dort wirkungslos bleiben.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    function rect(): DOMRect {
      return el!.getBoundingClientRect();
    }
    function onStart(e: TouchEvent): void {
      e.preventDefault();
      touch.onTouchStart(toPoints(e.touches, rect()));
    }
    function onMove(e: TouchEvent): void {
      e.preventDefault();
      touch.onTouchMove(toPoints(e.touches, rect()));
    }
    function onEnd(e: TouchEvent): void {
      e.preventDefault();
      touch.onTouchEnd(toPoints(e.touches, rect()));
    }
    function onCancel(): void {
      touch.onTouchCancel();
    }

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onCancel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [touch]);

  // --- Maus-Handler (Desktop-Browser) ------------------------------------
  // Nur auf Nicht-Touch-Geräten aktiv: Auf Touch-Geräten erzeugt der Browser
  // zusätzlich zu den Touch-Events emulierte Maus-Events — beide Engines
  // gleichzeitig würden den Zeiger doppelt bewegen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || device.isTouch || state !== "connected") return;

    function point(e: MouseEvent): { x: number; y: number } {
      const rect = el!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onMouseMove(e: MouseEvent): void {
      mouse.onMove(point(e));
    }
    function onMouseDown(e: MouseEvent): void {
      e.preventDefault();
      el!.focus();
      mouse.onDown(point(e), e.button);
    }
    function onMouseUp(e: MouseEvent): void {
      e.preventDefault();
      mouse.onUp(point(e), e.button);
    }
    function onWheel(e: WheelEvent): void {
      e.preventDefault();
      mouse.onWheel({ deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode });
    }
    // Ohne das wäre die rechte Maustaste nicht nutzbar: Der Browser würde
    // stattdessen sein eigenes Kontextmenü öffnen.
    function onContextMenu(e: Event): void {
      e.preventDefault();
    }

    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mousedown", onMouseDown);
    // mouseup am Fenster, damit ein außerhalb des Bildes losgelassener Knopf
    // nicht "hängen" bleibt (der Host hielte die Taste sonst gedrückt).
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [mouse, device.isTouch, state]);

  // --- Physische Tastatur (Desktop-Browser) -------------------------------
  // Am Fenster registriert, damit auch ohne Klick ins Bild getippt werden kann.
  // Die Bildschirmtastatur-Leiste (KeyboardBar) hat Vorrang: Ist sie offen,
  // liefert bereits ihr Eingabefeld die Events.
  useEffect(() => {
    if (device.isTouch || keyboardVisible || state !== "connected") return;

    function isEditable(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    }
    function onKeyDown(e: KeyboardEvent): void {
      // Eingaben in eigene Felder (z.B. Servereinstellung) nicht abfangen.
      if (isEditable(e.target)) return;
      // Escape bleibt lokal: sonst gäbe es keinen Weg mehr aus dem Vollbild.
      if (e.key === "Escape" && document.fullscreenElement) return;
      e.preventDefault();
      sendInput(keyEventFromBrowser("key-down", e));
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (isEditable(e.target)) return;
      e.preventDefault();
      sendInput(keyEventFromBrowser("key-up", e));
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [sendInput, device.isTouch, keyboardVisible, state]);

  function toggleModifier(mod: ModifierKey): void {
    setModifiers((prev) => ({ ...prev, [mod]: !prev[mod] }));
  }

  function sendEvents(events: RemoteInputEvent[]): void {
    for (const evt of events) sendInput(evt);
  }

  function sendChat(text: string): void {
    const sent = sessionRef.current?.sendChat(text);
    if (sent) setChatMessages((prev) => [...prev, sent]);
  }

  function toggleChat(): void {
    setChatVisible((visible) => {
      if (!visible) setUnreadChat(0);
      return !visible;
    });
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void stageRef.current?.requestFullscreen?.().catch(() => {});
  }

  const cursorPoint = normToPoint(cursor, containerSize, videoAspect, viewport);
  const statusText =
    state === "connecting"
      ? texts.connecting
      : state === "connected"
        ? texts.connected
        : state === "rejected"
          ? texts.rejected
          : state === "error"
            ? texts.error
            : texts.disconnected;

  return (
    <div className={`remote-screen ${keyboardVisible ? "keyboard-open" : ""}`}>
      <header className={`remote-bar top ${showControls ? "" : "hidden"}`}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          ← {texts.disconnect}
        </button>
        <div className="remote-status">
          <span className={`status-dot ${state}`} aria-hidden="true" />
          <span className="status-text">{statusText}</span>
          {state === "connected" && resolution && (
            <span className="status-meta">
              {resolution} · {latencyMs} ms
            </span>
          )}
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setShowControls(false)}>
          ⤢
        </button>
      </header>

      <div className="remote-stage-wrap">
        {/* tabIndex: macht die Bühne fokussierbar, damit ein Klick ins Bild den
            Fokus aus etwaigen Eingabefeldern holt. */}
        <div className="remote-stage" ref={stageRef} tabIndex={-1}>
          <video
            ref={videoRef}
            className="remote-video"
            autoPlay
            playsInline
            muted
            style={{
              transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
            }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight) {
                const aspect = v.videoWidth / v.videoHeight;
                setVideoAspect(aspect);
                touch.setVideoAspect(aspect);
                mouse.setVideoAspect(aspect);
              }
            }}
          />

          {state !== "connected" && (
            <div className="stage-overlay">
              <p className="overlay-text">{message ?? texts.waitingForStream}</p>
              {(state === "error" || state === "rejected" || state === "disconnected") && (
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  {texts.retry}
                </button>
              )}
            </div>
          )}

          {/* Der virtuelle Zeiger ergibt nur per Finger Sinn — mit echter Maus
              steht der Systemcursor bereits an der richtigen Stelle. */}
          {state === "connected" && device.isTouch && (
            <div
              className={`virtual-cursor ${dragging ? "dragging" : ""}`}
              style={{ transform: `translate(${cursorPoint.x}px, ${cursorPoint.y}px)` }}
              aria-hidden="true"
            />
          )}

          {!showControls && (
            <button type="button" className="show-controls-btn" onClick={() => setShowControls(true)}>
              ⌃
            </button>
          )}
        </div>

        {/* Bewusst AUSSERHALB der Bühne (nur darüber gelegt): Die Bühne fängt
            touchstart/mousedown mit preventDefault() ab und zieht den Fokus zu
            sich. Läge der Chat darin, bekäme sein Eingabefeld nie den Fokus und
            die getippten Zeichen gingen als Tastendrücke an den Host. */}
        {chatVisible && (
          <div className="chat-overlay">
            <ChatPanel
              messages={chatMessages}
              onSend={sendChat}
              onClose={() => setChatVisible(false)}
              texts={texts}
            />
          </div>
        )}

        {/* Aus demselben Grund wie der Chat außerhalb der Bühne: Die Bühne
            fängt touchstart/mousedown mit preventDefault() ab, der
            Dateiauswahl-Knopf bekäme dort keinen Tap. */}
        {filesVisible && (
          <div className="chat-overlay">
            <FilePanel
              transfers={transfers}
              onSend={(files) => void sendFiles(files)}
              onClose={() => setFilesVisible(false)}
              disabled={state !== "connected"}
              texts={texts}
            />
          </div>
        )}
      </div>

      <footer className={`remote-bar bottom ${showControls ? "" : "hidden"}`}>
        <button type="button" className="action-btn" onClick={() => touch.click("left")}>
          <span className="action-icon">🖱</span>
          <span className="action-label">{texts.leftClick}</span>
        </button>
        <button type="button" className="action-btn" onClick={() => touch.click("right")}>
          <span className="action-icon">🖱</span>
          <span className="action-label">{texts.rightClick}</span>
        </button>
        <button
          type="button"
          className={`action-btn ${dragging ? "active" : ""}`}
          onClick={() => touch.toggleDrag()}
        >
          <span className="action-icon">✊</span>
          <span className="action-label">{dragging ? texts.dragActive : texts.drag}</span>
        </button>
        <button
          type="button"
          className={`action-btn ${keyboardVisible ? "active" : ""}`}
          onClick={() => setKeyboardVisible((v) => !v)}
        >
          <span className="action-icon">⌨</span>
          <span className="action-label">{texts.keyboard}</span>
        </button>
        {/* Chat läuft über den Signaling-Kanal und ist deshalb auch ohne
            stehende Bildschirmverbindung nutzbar. */}
        <button type="button" className={`action-btn ${chatVisible ? "active" : ""}`} onClick={toggleChat}>
          <span className="action-icon">
            💬
            {unreadChat > 0 && <span className="chat-unread-dot" />}
          </span>
          <span className="action-label">{texts.chat}</span>
        </button>
        {/* Dateien brauchen — anders als der Chat — die stehende
            Peer-Verbindung, laufen also nur bei aktiver Freigabe. */}
        <button
          type="button"
          className={`action-btn ${filesVisible ? "active" : ""}`}
          onClick={() => setFilesVisible((v) => !v)}
        >
          <span className="action-icon">📁</span>
          <span className="action-label">{texts.files}</span>
        </button>
        <button
          type="button"
          className={`action-btn ${settings.mode === "direct" ? "active" : ""}`}
          onClick={() => onUpdateSettings({ mode: settings.mode === "trackpad" ? "direct" : "trackpad" })}
        >
          <span className="action-icon">{settings.mode === "trackpad" ? "▭" : "◎"}</span>
          <span className="action-label">
            {settings.mode === "trackpad" ? texts.modeTrackpad : texts.modeDirect}
          </span>
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() => {
            touch.resetViewport();
            setViewport(IDENTITY_VIEWPORT);
          }}
        >
          <span className="action-icon">⤢</span>
          <span className="action-label">{texts.resetZoom}</span>
        </button>
        {!device.isIOS && (
          <button type="button" className="action-btn" onClick={toggleFullscreen}>
            <span className="action-icon">⛶</span>
            <span className="action-label">{texts.fullscreen}</span>
          </button>
        )}
      </footer>

      <KeyboardBar
        visible={keyboardVisible}
        modifiers={modifiers}
        onToggleModifier={toggleModifier}
        onSend={sendEvents}
        onKeySent={() => setModifiers(NO_MODIFIERS)}
        hostIsMac={/Mac/.test(navigator.platform)}
        texts={texts}
        onHide={() => setKeyboardVisible(false)}
      />
    </div>
  );
}
