import { createRoot } from "react-dom/client";
// Self-hosted fonts (Phase 8) — offline + no external request. Family names
// match the CSS tokens ("Hanken Grotesk", "Source Serif 4", "Patrick Hand").
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/hanken-grotesk/800.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/patrick-hand/400.css";
import "./index.css";
import { ToastHost } from "./ui/Toast";
import { StoreProvider } from "./store/StoreProvider";
import { AuthProvider } from "./sync/auth";
import { SyncBridge } from "./sync/SyncBridge";
import { App } from "./App";

// warm up speech voices (some browsers load them lazily)
if (window.speechSynthesis) { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = () => {}; }

createRoot(document.getElementById("root")!).render(
  <ToastHost>
    <AuthProvider>
      <StoreProvider>
        <SyncBridge>
          <App />
        </SyncBridge>
      </StoreProvider>
    </AuthProvider>
  </ToastHost>
);
