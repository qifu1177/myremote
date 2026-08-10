/**
 * Erfasst den lokalen Bildschirm als MediaStream via Electrons desktopCapturer
 * + getUserMedia mit chromeMediaSourceId (Chromium-spezifische Erweiterung).
 */
// chromeMediaSource/chromeMediaSourceId sind Chromium-Erweiterungen von
// MediaTrackConstraints, in den offiziellen DOM-Typen nicht vorhanden.
interface ChromeDesktopMediaTrackConstraints extends MediaTrackConstraints {
  mandatory: {
    chromeMediaSource: "desktop";
    chromeMediaSourceId: string;
    maxFrameRate: number;
  };
}

/** Bildqualität-Stufen (Settings → Anzeige), wirken sich auf die Bildrate der
 *  Aufnahme aus: "best" priorisiert Bildqualität (niedrigere Framerate,
 *  höhere Latenz laut Design-Hinweis), "fast" priorisiert Reaktionsfähigkeit
 *  (höhere Framerate). */
const FRAME_RATE_BY_QUALITY: Record<"best" | "balanced" | "fast", number> = {
  best: 15,
  balanced: 30,
  fast: 45,
};

export async function captureDesktopStream(
  sourceId: string,
  quality: "best" | "balanced" | "fast" = "balanced",
): Promise<MediaStream> {
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxFrameRate: FRAME_RATE_BY_QUALITY[quality],
      },
    } as ChromeDesktopMediaTrackConstraints,
  } as MediaStreamConstraints;
  return navigator.mediaDevices.getUserMedia(constraints);
}
