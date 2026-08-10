import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RemoteInputEvent } from "@shared/types";
import { ControllerSession } from "@renderer/lib/controllerSession";
import { TouchInputController, type TouchPoint } from "../lib/touchInput";
import { IDENTITY_VIEWPORT, normToPoint, type Viewport } from "../lib/viewport";
import { KeyboardBar } from "./KeyboardBar";
import { NO_MODIFIERS, type ModifierKey, type ModifierState } from "../lib/keyboardInput";
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
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [touch]);

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
  }, [state, touch]);

  useEffect(() => {
    touch.setViewport(viewport);
  }, [touch, viewport]);

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

  function toggleModifier(mod: ModifierKey): void {
    setModifiers((prev) => ({ ...prev, [mod]: !prev[mod] }));
  }

  function sendEvents(events: RemoteInputEvent[]): void {
    for (const evt of events) sendInput(evt);
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

      <div className="remote-stage" ref={stageRef}>
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

        {state === "connected" && (
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
