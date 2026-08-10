import { useEffect, useState } from "react";

/**
 * Formfaktor-Erkennung für das adaptive Layout.
 *
 * "phone"  – iPhone / Android-Phone (schmale Seite < 600 px)
 * "tablet" – iPad / Android-Tablet
 * "desktop"– Browser am Rechner (nur für Tests/Vorschau relevant)
 *
 * Bewusst über die *kürzere* Fensterseite bestimmt, damit ein gedrehtes
 * Handy nicht plötzlich als Tablet gilt.
 */
export type DeviceClass = "phone" | "tablet" | "desktop";

export type Orientation = "portrait" | "landscape";

export interface DeviceInfo {
  deviceClass: DeviceClass;
  orientation: Orientation;
  width: number;
  height: number;
  /** true, wenn das Gerät primär per Finger bedient wird */
  isTouch: boolean;
  /** true auf iOS/iPadOS (relevant für Vollbild-/Tastatur-Eigenheiten) */
  isIOS: boolean;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS meldet sich seit Version 13 als "Macintosh"; die Kombination aus
  // Mac-UA und Touch-Punkten identifiziert ein iPad zuverlässig.
  const iPadOS = /Macintosh/.test(ua) && typeof document !== "undefined" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}

function read(): DeviceInfo {
  const width = typeof window === "undefined" ? 1024 : window.innerWidth;
  const height = typeof window === "undefined" ? 768 : window.innerHeight;
  const shortSide = Math.min(width, height);
  const isTouch = detectTouch();

  let deviceClass: DeviceClass;
  if (!isTouch && shortSide >= 700) deviceClass = "desktop";
  else if (shortSide < 600) deviceClass = "phone";
  else deviceClass = "tablet";

  return {
    deviceClass,
    orientation: width >= height ? "landscape" : "portrait",
    width,
    height,
    isTouch,
    isIOS: detectIOS(),
  };
}

export function useDeviceClass(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(read);

  useEffect(() => {
    function update(): void {
      setInfo(read());
    }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return info;
}
