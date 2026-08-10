import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/mobile.css";

// Doppeltipp-Zoom und Gummiband-Scrollen des Browsers unterdrücken: Beides
// würde sonst mit den Fernsteuerungs-Gesten kollidieren. `passive: false` ist
// nötig, damit preventDefault() in Safari/Chrome überhaupt greift.
document.addEventListener(
  "gesturestart",
  (e) => {
    e.preventDefault();
  },
  { passive: false },
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
