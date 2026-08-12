import { useEffect, useRef, useState } from "react";
import type { ChatMessage, RemoteInputEvent } from "@shared/types";
import { ControllerSession } from "../lib/controllerSession";
import { StatusBadge } from "./StatusBadge";
import { ChatPanel } from "./ChatPanel";
import { useTranslation } from "../i18n";
import type { AppSettings } from "../hooks/useAppSettings";
import { ChatIcon, ExpandIcon, FolderIcon } from "./icons";

interface RemoteViewProps {
  hostId: string;
  password: string;
  signalingUrl: string;
  displaySettings: AppSettings["display"];
  onClose: () => void;
}

type ConnState = "connecting" | "connected" | "disconnected" | "rejected" | "error";
type SidePanel = "none" | "files" | "chat";

export function RemoteView({ hostId, password, signalingUrl, displaySettings, onClose }: RemoteViewProps): JSX.Element {
  const t = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ControllerSession | null>(null);
  const [state, setState] = useState<ConnState>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [inputEnabled, setInputEnabled] = useState(true);
  const [panel, setPanel] = useState<SidePanel>("none");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);

  useEffect(() => {
    const session = new ControllerSession(signalingUrl, hostId, password, {
      onRemoteStream: (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      },
      onChatMessage: (msg) => {
        setChatMessages((prev) => [...prev, msg]);
        setUnreadChat((n) => n + 1);
      },
      onConnected: () => setState("connected"),
      onDisconnected: () => setState("disconnected"),
      onRejected: (reason) => {
        setState("rejected");
        setMessage(reason === "wrong-password" ? t.remoteView.wrongPassword : t.remoteView.connectionRejected(reason));
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, password, signalingUrl]);

  // Verbindungsinfo-Overlay (Auflösung + grobe Latenzschätzung via RTT der
  // WebRTC-Statistiken), analog zum Design ("1920×1080 · 32ms · AES-256").
  useEffect(() => {
    if (state !== "connected") return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (video && video.videoWidth && video.videoHeight) {
        setResolution(`${video.videoWidth}×${video.videoHeight}`);
      }
      const pc = sessionRef.current?.peerConnection;
      if (pc) {
        pc.getStats().then((stats) => {
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") {
              setLatencyMs(Math.round(report.currentRoundTripTime * 1000));
            }
          });
        });
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [state]);

  useEffect(() => {
    function onFsChange(): void {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function sendEvt(evt: RemoteInputEvent): void {
    if (!inputEnabled) return;
    sessionRef.current?.sendInput(evt);
  }

  function normFromMouseEvent(e: React.MouseEvent<HTMLVideoElement>): { xNorm: number; yNorm: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    const xNorm = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const yNorm = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { xNorm, yNorm };
  }

  function buttonName(button: number): "left" | "right" | "middle" {
    return button === 2 ? "right" : button === 1 ? "middle" : "left";
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      stageRef.current?.requestFullscreen().catch(() => {});
    }
  }

  function togglePanel(next: SidePanel): void {
    setPanel((prev) => (prev === next ? "none" : next));
    if (next === "chat") setUnreadChat(0);
  }

  function sendChat(text: string): void {
    const sent = sessionRef.current?.sendChat(text);
    if (sent) setChatMessages((prev) => [...prev, sent]);
  }

  return (
    <div className="remote-view">
      <div className="remote-toolbar">
        <div className="remote-toolbar-left">
          <button className="btn btn-secondary" onClick={onClose}>
            {t.remoteView.disconnect}
          </button>
          <span className="remote-toolbar-title">{hostId}</span>
        </div>
        <div className="remote-toolbar-right">
          <label className="checkbox-row">
            <input type="checkbox" checked={inputEnabled} onChange={(e) => setInputEnabled(e.target.checked)} />
            {t.remoteView.remoteControlActive}
          </label>
          <button
            type="button"
            className={`toolbar-icon-btn ${panel === "files" ? "active" : ""}`}
            title={t.remoteView.fileTransfer}
            onClick={() => togglePanel("files")}
          >
            <FolderIcon size={17} />
          </button>
          <button
            type="button"
            className={`toolbar-icon-btn ${panel === "chat" ? "active" : ""}`}
            title={unreadChat > 0 ? t.chat.unread(unreadChat) : t.remoteView.chat}
            onClick={() => togglePanel("chat")}
          >
            <ChatIcon size={17} />
            {unreadChat > 0 && <span className="chat-unread-dot" />}
          </button>
          <button
            type="button"
            className="toolbar-icon-btn"
            title={isFullscreen ? t.remoteView.exitFullscreen : t.remoteView.fullscreen}
            onClick={toggleFullscreen}
          >
            <ExpandIcon size={17} />
          </button>
          <StatusBadge status={state === "connected" ? "live" : state === "error" || state === "rejected" ? "error" : "idle"}>
            {state === "connecting" && t.remoteView.connecting}
            {state === "connected" && t.remoteView.connected}
            {state === "disconnected" && t.remoteView.disconnected}
            {state === "rejected" && t.remoteView.rejected}
            {state === "error" && t.remoteView.error}
          </StatusBadge>
        </div>
      </div>
      <div className="remote-stage" ref={stageRef}>
        {state !== "connected" && (
          <div className="placeholder">{message ?? t.remoteView.waitingForStream}</div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            display: state === "connected" ? "block" : "none",
            objectFit: displaySettings.fitToWindow ? "contain" : "none",
            cursor: displaySettings.showRemoteCursor ? "none" : "default",
          }}
          tabIndex={0}
          onMouseMove={(e) => sendEvt({ type: "mouse-move", ...normFromMouseEvent(e) })}
          onMouseDown={(e) => {
            e.currentTarget.focus();
            sendEvt({ type: "mouse-down", button: buttonName(e.button), ...normFromMouseEvent(e) });
          }}
          onMouseUp={(e) => sendEvt({ type: "mouse-up", button: buttonName(e.button), ...normFromMouseEvent(e) })}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => sendEvt({ type: "mouse-wheel", deltaX: e.deltaX, deltaY: e.deltaY })}
          onKeyDown={(e) => {
            e.preventDefault();
            sendEvt({
              type: "key-down",
              key: e.key,
              code: e.code,
              ctrlKey: e.ctrlKey,
              shiftKey: e.shiftKey,
              altKey: e.altKey,
              metaKey: e.metaKey,
            });
          }}
          onKeyUp={(e) => {
            e.preventDefault();
            sendEvt({
              type: "key-up",
              key: e.key,
              code: e.code,
              ctrlKey: e.ctrlKey,
              shiftKey: e.shiftKey,
              altKey: e.altKey,
              metaKey: e.metaKey,
            });
          }}
        />
        {state === "connected" && resolution && (
          <div className="remote-stage-info">{t.remoteView.connectionInfo(resolution, latencyMs)}</div>
        )}
        {panel === "files" && (
          <div className="settings-inline" style={{ position: "absolute", right: 16, top: 16, background: "var(--bg-card)", padding: 16, borderRadius: 10, maxWidth: 260 }}>
            {t.remoteView.featureNotAvailable}
          </div>
        )}
        {panel === "chat" && (
          <div className="remote-chat-overlay">
            {/* Der Chat läuft über den Signaling-Kanal und ist deshalb schon
                vor dem Zustandekommen der Bildschirmverbindung nutzbar. */}
            <ChatPanel messages={chatMessages} selfRole="controller" onSend={sendChat} />
          </div>
        )}
      </div>
    </div>
  );
}
