import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { detectDevice } from "./platform";
import { initTheme } from "./theme";

initTheme();

const device = detectDevice();

// Phones load the lightweight viewer bundle only; the Modeler, properties
// panel, and palette never download on a phone.
const App =
  device === "phone"
    ? lazy(() => import("./mobile/MobileApp"))
    : lazy(() => import("./desktop/DesktopApp"));

// Invisible for the first 500ms so fast loads show nothing at all; only a
// genuinely slow connection ever sees the hint fade in.
function Boot() {
  return (
    <div
      className="boot-loader"
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      Loading
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<Boot />}>
      <App device={device} />
    </Suspense>
  </StrictMode>,
);

// Offline support: cache the app shell after first visit.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is an enhancement; failure changes nothing else.
    });
  });
}
