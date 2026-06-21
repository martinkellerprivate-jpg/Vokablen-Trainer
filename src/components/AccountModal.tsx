/* Account modal (Phase 3): email/password sign in & sign up, sync status,
 * sign out. Rendered only when Supabase is configured. */
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { useAuth } from "../sync/auth";
import { useSync, type SyncStatus } from "../sync/SyncBridge";

const STATUS_LABEL: Record<SyncStatus, string> = {
  local: "Nur auf diesem Gerät",
  syncing: "Synchronisiere…",
  synced: "Synchronisiert",
  offline: "Offline — wird nachgeholt",
  error: "Sync-Problem — Wiederholung folgt",
};

export function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const { status } = useSync();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  if (!open) return null;

  const submit = async () => {
    setBusy(true); setError(""); setInfo("");
    const r = mode === "in" ? await auth.signIn(email.trim(), password) : await auth.signUp(email.trim(), password);
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    if (mode === "up" && !auth.user) { setInfo("Account erstellt. Falls E-Mail-Bestätigung aktiv ist, bestätige zuerst die Mail."); return; }
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <div className="modal-title">{auth.user ? "Dein Account" : (mode === "in" ? "Anmelden" : "Account erstellen")}</div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {auth.user ? (
          <div className="col" style={{ gap: 14 }}>
            <div className="muted" style={{ fontSize: 14 }}>Angemeldet als <b style={{ color: "var(--ink)" }}>{auth.email}</b></div>
            <div className="badge slate" style={{ alignSelf: "flex-start" }}><span className="dot" />{STATUS_LABEL[status]}</div>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              Deine Wörter, Listen und Fortschritte werden mit der Cloud synchronisiert und stehen auf deinen Geräten zur Verfügung. Offline läuft alles weiter und wird beim nächsten Mal nachgeholt.
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => auth.signOut()}>Abmelden</button>
            </div>
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            <input className="field" type="email" placeholder="E-Mail" value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)} />
            <input className="field" type="password" placeholder="Passwort" value={password} autoComplete={mode === "in" ? "current-password" : "new-password"}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            {error && <div className="badge red" style={{ alignSelf: "flex-start" }}><span className="dot" />{error}</div>}
            {info && <div className="muted" style={{ fontSize: 12.5 }}>{info}</div>}
            <button className="btn btn-primary" onClick={submit} disabled={busy || !email.trim() || !password}>
              {busy ? <Icon name="refresh" size={15} /> : <Icon name="check" size={15} />} {mode === "in" ? "Anmelden" : "Registrieren"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); setInfo(""); }}>
              {mode === "in" ? "Noch kein Account? Registrieren" : "Schon registriert? Anmelden"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
