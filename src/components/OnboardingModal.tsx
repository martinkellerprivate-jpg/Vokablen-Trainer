/* First-run onboarding (CR): offers to activate the bundled Grundwortschatz
 * for the active pair. Skippable; shown once (settings.onboardingDone). */
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { PAIRS } from "../lib/pairs";
import { getStarter, activateStarter } from "../data/starter";

export function OnboardingModal() {
  const store = useStore();
  const toast = useToast();
  const { settings } = store;
  const [open, setOpen] = useState(() => !settings.onboardingDone);
  if (!open) return null;

  const pair = settings.pair || "en-de";
  const P = PAIRS[pair] || PAIRS["en-de"];
  const entry = getStarter(pair, 1);

  const finish = () => { store.setSettings({ onboardingDone: true }); setOpen(false); };
  const activate = () => {
    const r = activateStarter(store, pair, 1);
    toast(`„${r.label}" aktiviert · ${r.added} Wört${r.added === 1 ? "" : "er"}`, "check");
    finish();
  };

  return (
    <div className="modal-backdrop" onClick={finish}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <div className="modal-title">Willkommen!</div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={finish}><Icon name="x" size={16} /></button>
        </div>
        <div className="muted" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
          Möchtest du mit einem <b style={{ color: "var(--ink)" }}>Grundwortschatz</b> für {P.foreignLabel} ⇄ Deutsch starten?
          {entry ? <> Das fügt <b style={{ color: "var(--ink)" }}>{entry.count}</b> häufige Wörter als eigene Liste hinzu — nach Themen sortiert.</> : null}
          {" "}Du kannst das auch später in den Einstellungen tun.
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={finish}>Überspringen</button>
          <button className="btn btn-primary" onClick={activate} disabled={!entry}>
            <Icon name="check" size={15} /> Grundwortschatz aktivieren
          </button>
        </div>
      </div>
    </div>
  );
}
