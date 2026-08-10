/**
 * Statisches Ausliefern des Mobile-Clients (iPad / iPhone / Android-Phone)
 * über denselben HTTP-Server, an dem auch der WebSocket-Signaling-Server
 * hängt.
 *
 * Warum im Signaling-Server?
 *  - Das Mobilgerät braucht ohnehin eine Verbindung zum Signaling-Server.
 *    Wenn die Web-App von derselben Adresse geladen wird, ergibt sich die
 *    WebSocket-URL automatisch aus der Seiten-URL (siehe
 *    `defaultSignalingUrl()` im Mobile-Client) — der Nutzer muss auf dem
 *    Handy keine IP-Adresse eintippen.
 *  - Es entsteht kein zusätzlicher Prozess/Port, der freigegeben werden muss.
 *
 * Der Ordner wird nur ausgeliefert, wenn er existiert (`npm run build:mobile`).
 * Fehlt er, antwortet der Server mit einem Hinweistext statt mit 404.
 */
const fs = require("fs");
const path = require("path");
const metrics = require("./metrics");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** Verzeichnis mit dem gebauten Mobile-Client (dist/mobile im Projektstamm). */
const MOBILE_DIR = path.resolve(__dirname, "../../dist/mobile");

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * Löst einen URL-Pfad sicher gegen das Client-Verzeichnis auf.
 * Verhindert Path-Traversal ("../"): Ergebnisse außerhalb von MOBILE_DIR
 * werden verworfen.
 */
function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(MOBILE_DIR, relative);
  if (resolved !== MOBILE_DIR && !resolved.startsWith(MOBILE_DIR + path.sep)) return null;
  return resolved;
}

function sendPlain(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

/** true, wenn ein Build des Mobile-Clients vorliegt. */
function isMobileClientAvailable() {
  return fs.existsSync(path.join(MOBILE_DIR, "index.html"));
}

/**
 * Request-Handler für den HTTP-Server. Liefert Dateien aus dist/mobile;
 * unbekannte Pfade werden auf index.html abgebildet (Single-Page-App).
 */
function handleRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendPlain(res, 405, "method not allowed");
    return;
  }

  // /health liefert zusätzlich Verbindungs-Metriken. Damit lässt sich z.B.
  // automatisiert prüfen, dass ein Client genau EINE WebSocket-Verbindung
  // und EINE Controller-Session erzeugt (siehe scripts/test-mobile-strictmode.mjs).
  if ((req.url || "").split("?")[0] === "/health") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify({ ok: true, mobileClient: isMobileClientAvailable(), metrics: metrics.snapshot() }));
    return;
  }

  if (!isMobileClientAvailable()) {
    sendPlain(
      res,
      503,
      "Der Mobile-Client wurde noch nicht gebaut.\n" +
        "Bitte einmalig ausfuehren:  npm run build:mobile\n" +
        "Der Signaling-Server (WebSocket) laeuft davon unabhaengig bereits.",
    );
    return;
  }

  let filePath = resolveSafe(req.url || "/");
  if (!filePath) {
    sendPlain(res, 403, "forbidden");
    return;
  }

  // SPA-Fallback: Pfade ohne Dateiendung liefern index.html.
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(MOBILE_DIR, "index.html");
  }

  const headers = {
    "content-type": contentTypeFor(filePath),
    // Die App wird häufig neu gebaut; index.html darf nicht gecacht werden.
    "cache-control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
  };

  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

module.exports = { handleRequest, isMobileClientAvailable, MOBILE_DIR };
