import { useState } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { RECOMMENDED } from "../lib/defaults";
import { useAuth } from "../sync/auth";
import { exportAllData, deleteLocalData } from "../lib/accountData";
import { deleteCloudAccount } from "../sync/share";
import { STARTERS, activateStarter, isStarterActivated } from "../data/starter";

/* ===================================================================
 * settingsTab.jsx — adjustable engine parameters with research-backed
 * ("Recommended") defaults from learning psychology.
 * =================================================================== */

function Toggle({ value, onChange }: any) {
  return (
    <button className={"switch" + (value ? " on" : "")} role="switch" aria-checked={value}
      onClick={() => onChange(!value)}><span className="knob" /></button>
  );
}

function Seg({ value, options, onChange }: any) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function SliderControl({ value, min, max, step, onChange, fmt }: any) {
  return (
    <div className="set-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="set-val">{fmt ? fmt(value) : value}</div>
    </div>
  );
}

function Field({ title, desc, recLabel, atRec, children }: any) {
  return (
    <div className="set-row">
      <div className="set-info">
        <div className="set-title">{title}{atRec && <span className="rec-pill">✓ Recommended</span>}</div>
        {desc && <div className="set-desc">{desc}</div>}
        {recLabel != null && <div className="set-rec">Best-practice default: <b>{recLabel}</b></div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

export function SettingsTab() {
  const store = useStore();
  const toast = useToast();
  const auth = useAuth();
  const { settings, setSettings, resetSettings } = store;
  const R = RECOMMENDED;
  const set = (k, v) => setSettings({ [k]: v });

  // Konto & Daten (Phase 7)
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");
  const cloudActive = auth.configured && !!auth.user;
  const doExport = () => { exportAllData(new Date().toISOString()); toast("Daten exportiert", "download"); };
  const addStarter = (pair: string, stufe: number) => { const r = activateStarter(store, pair, stufe); toast(`„${r.label}" aktiviert · ${r.added} Wört${r.added === 1 ? "" : "er"}`, "check"); };
  const doDelete = async () => {
    if (confirmText.trim().toUpperCase() !== "LÖSCHEN") return;
    setDelBusy(true); setDelErr("");
    try {
      if (cloudActive) await deleteCloudAccount();
      deleteLocalData();
      if (cloudActive) await auth.signOut();
      location.reload();
    } catch (e: any) {
      setDelBusy(false);
      setDelErr("Löschen fehlgeschlagen: " + (e?.message || e));
    }
  };
  const atR = (k) => settings[k] === R[k];
  const onOff = (b) => (b ? "On" : "Off");

  return (
    <div className="settings">
      <div className="set-head">
        <div>
          <div className="section-title">Settings</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4, maxWidth: 540 }}>
            Defaults follow learning-psychology best practice — spaced repetition, active recall, and a modest number of new words per day. Adjust anything; the <span style={{ color: "var(--green)", fontWeight: 700 }}>✓ Recommended</span> tag shows when a value is at its research-backed norm.
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => { resetSettings(); toast("Restored recommended settings", "refresh"); }}>
          <Icon name="refresh" size={14} /> Reset to recommended
        </button>
      </div>

      {/* Practice */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="cards" size={16} /> Practice</div>
        <Field title="Default answer mode" recLabel="Type" atRec={atR("mode")}
          desc="Typing the answer (active recall) builds the strongest memory. Recall = self-check flashcards; Memorize = browse only, no scoring.">
          <select className="field" style={{ width: "100%" }} value={settings.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="type">Type</option>
            <option value="choice">Choose</option>
            <option value="recall">Recall (self-check)</option>
            <option value="memorize">Memorize (browse)</option>
          </select>
        </Field>
        <Field title="Multiple-choice options" recLabel={R.choicesCount} atRec={atR("choicesCount")}
          desc="How many options appear in Choose mode.">
          <SliderControl value={settings.choicesCount} min={2} max={6} step={1} onChange={(v) => set("choicesCount", v)} />
        </Field>
        <Field title="Auto-play pronunciation" recLabel="Off" atRec={atR("autoAudio")}
          desc="Read each new card aloud automatically. Great for listening practice; can distract in a quiet classroom.">
          <Toggle value={settings.autoAudio} onChange={(v) => set("autoAudio", v)} />
        </Field>
        <Field title="Daily goal (cards)" recLabel={`${R.dailyGoal} (~15 min)`} atRec={atR("dailyGoal")}
          desc="A short daily session beats long, infrequent ones — daily exposure keeps memory fresh.">
          <SliderControl value={settings.dailyGoal} min={10} max={80} step={5} onChange={(v) => set("dailyGoal", v)} />
        </Field>
      </div>

      {/* Pacing & repetition */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="flame" size={16} /> Review cycle & repetition</div>
        <Field title="New words per day" recLabel={`${R.newPerDay} (8–12 is ideal)`} atRec={atR("newPerDay")}
          desc="Limiting how many brand-new words appear each day prevents overload — once reached, the day focuses on reviewing.">
          <SliderControl value={settings.newPerDay} min={3} max={30} step={1} onChange={(v) => set("newPerDay", v)} />
        </Field>
        <Field title="Lernintensität" recLabel="Normal" atRec={settings.lernIntensity === "normal" || !settings.lernIntensity}
          desc="Wie gut die App ein Wort im Gedächtnis halten will, bevor sie es zur Wiederholung bringt. Intensiver = häufigere Wiederholung, sicherer im Behalten. Alles Weitere regelt die App automatisch.">
          <Seg value={settings.lernIntensity || "normal"} onChange={(v) => set("lernIntensity", v)}
            options={[{ v: "locker", label: "Locker" }, { v: "normal", label: "Normal" }, { v: "intensiv", label: "Intensiv" }]} />
        </Field>
      </div>

      {/* Answer checking */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="check" size={16} /> Answer checking</div>
        <Field title="Ignore capitalisation" recLabel="On" atRec={atR("lenientCase")}
          desc="Treat “Hund” and “hund” as the same answer.">
          <Toggle value={settings.lenientCase} onChange={(v) => set("lenientCase", v)} />
        </Field>
        <Field title="Strict umlauts / accents" recLabel="Off" atRec={atR("strictAccents")}
          desc="When off, “grun” for “grün” is a small mistake (partial credit) instead of fully wrong.">
          <Toggle value={settings.strictAccents} onChange={(v) => set("strictAccents", v)} />
        </Field>
        <Field title="Article (der/die/das)" recLabel="Required (partial penalty)" atRec={atR("articleMode")}
          desc="How a missing or wrong article is scored. Required = it must be there; Optional = the article is ignored entirely.">
          <select className="field" style={{ width: "100%" }} value={settings.articleMode} onChange={(e) => set("articleMode", e.target.value)}>
            <option value="required-full">Required · full penalty</option>
            <option value="required-partial">Required · partial penalty</option>
            <option value="optional">Optional</option>
          </select>
        </Field>
        <Field title="Allow near-misses" recLabel="On" atRec={atR("acceptPartial")}
          desc="A single typo counts as almost-right (partial credit) and the slip is highlighted in the solution. Off = a near-miss is marked wrong.">
          <Toggle value={settings.acceptPartial} onChange={(v) => set("acceptPartial", v)} />
        </Field>
      </div>

      {/* Latein */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="list" size={16} /> Latein</div>
        <Field title="Abfrage-Form" recLabel="L2 (Grundform)" atRec={atR("latinMode")}
          desc="Gilt nur für das Paar Latein ⇄ Deutsch. L2: die Karte zeigt die volle Lernform, abgefragt wird nur die Grundform. L3: du gibst die vollständigen Stammformen ein (Reihenfolge egal).">
          <select className="field" style={{ width: "100%" }} value={settings.latinMode} onChange={(e) => set("latinMode", e.target.value)}>
            <option value="L2">L2 · Grundform abfragen</option>
            <option value="L3">L3 · volle Lernform abfragen</option>
          </select>
        </Field>
      </div>

      {/* Lernhilfen */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="hint" size={16} /> Lernhilfen</div>
        <Field title="Lerntipp-Einblendungen" recLabel="Gelegentlich" atRec={atR("tipsFrequency")}
          desc="Kurze Lerntipps tauchen an natürlichen Pausen auf (nie mitten in der Antwort) und lassen sich wegklicken.">
          <select className="field" style={{ width: "100%" }} value={settings.tipsFrequency} onChange={(e) => set("tipsFrequency", e.target.value)}>
            <option value="off">Aus</option>
            <option value="occasional">Gelegentlich</option>
            <option value="frequent">Häufig</option>
          </select>
        </Field>
      </div>

      {/* Erscheinungsbild */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="swatch" size={16} /> Erscheinungsbild</div>
        <Field title="Skin" recLabel="Papier" atRec={atR("skin")}
          desc="Farbwelt der ganzen App. Papier ist der gewohnte warme Look.">

          <select className="field" style={{ width: "100%" }} value={settings.skin} onChange={(e) => set("skin", e.target.value)}>
            <option value="paper">Papier (warm)</option>
            <option value="dark">Dunkel</option>
            <option value="fresh">Frisch (kühl)</option>
          </select>
        </Field>
        <Field title="Kartenstil" recLabel="Liniert" atRec={atR("cardStyle")}
          desc="Aussehen der Karteikarte – unabhängig vom Skin.">
          <select className="field" style={{ width: "100%" }} value={settings.cardStyle} onChange={(e) => set("cardStyle", e.target.value)}>
            <option value="ruled">Liniert (mit Rand)</option>
            <option value="plain">Glatt</option>
            <option value="indexcard">Karteikarte (Reiter)</option>
          </select>
        </Field>
        <Field title="Kartenschrift" recLabel="Serif" atRec={atR("cardFont")}
          desc="Schrift des grossen Karten-Worts und der Antwort. Die übrige Oberfläche bleibt gleich.">
          <select className="field" style={{ width: "100%" }} value={settings.cardFont} onChange={(e) => set("cardFont", e.target.value)}>
            <option value="serif">Serif (Source Serif)</option>
            <option value="arial">Arial</option>
            <option value="handwriting">Handschrift (Patrick Hand)</option>
          </select>
        </Field>
      </div>

      {/* Grundwortschatz (Starter-Listen) */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="sparkle" size={16} /> Grundwortschatz</div>
        {STARTERS.map((s) => {
          const done = isStarterActivated(settings, s.pair, s.stufe);
          return (
            <Field key={s.key} title={s.label} desc={`${s.count} häufige Wörter, nach Themen sortiert. Wird als eigene Liste hinzugefügt (bereits vorhandene Wörter werden übersprungen).`}>
              {done
                ? <span className="badge green"><span className="dot" />Aktiviert</span>
                : <button className="btn btn-sm" onClick={() => addStarter(s.pair, s.stufe)}><Icon name="plus" size={15} /> Hinzufügen</button>}
            </Field>
          );
        })}
      </div>

      {/* Konto & Daten */}
      <div className="set-section">
        <div className="set-section-h"><Icon name="download" size={16} /> Konto & Daten</div>
        <Field title="Daten exportieren" desc="Lädt alle deine Wörter, Listen, Fortschritte und Einstellungen als JSON-Datei herunter.">
          <button className="btn btn-sm" onClick={doExport}><Icon name="download" size={15} /> Exportieren</button>
        </Field>
        <Field title="Datenschutz" desc="Wie deine Daten gespeichert werden.">
          <button className="btn btn-sm btn-ghost" onClick={() => setPrivacyOpen(true)}>Datenschutz ansehen</button>
        </Field>
        <Field title="Account löschen" desc={cloudActive ? "Löscht deine Daten endgültig – lokal und in der Cloud. Das kann nicht rückgängig gemacht werden." : "Löscht alle Daten auf diesem Gerät. Das kann nicht rückgängig gemacht werden."}>
          <button className="btn btn-sm" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={() => { setConfirmText(""); setDelErr(""); setDelOpen(true); }}>
            <Icon name="trash" size={15} /> Löschen
          </button>
        </Field>
      </div>

      {privacyOpen && (
        <div className="modal-backdrop" onClick={() => setPrivacyOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <div className="modal-title">Datenschutz</div>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setPrivacyOpen(false)}><Icon name="x" size={16} /></button>
            </div>
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              <p style={{ marginBottom: 10 }}><b style={{ color: "var(--ink)" }}>Platzhalter — die vollständige Datenschutzerklärung folgt vor dem Launch.</b></p>
              <p style={{ marginBottom: 8 }}>Deine Vokabeln, Listen und Fortschritte werden zuerst lokal auf deinem Gerät gespeichert. Wenn du dich anmeldest, werden sie zusätzlich mit der Cloud (Supabase) synchronisiert, damit sie auf deinen Geräten verfügbar sind.</p>
              <p style={{ marginBottom: 8 }}>Du kannst deine Daten jederzeit als Datei exportieren und deinen Account vollständig löschen (oben unter „Konto & Daten").</p>
              <p>Ohne Anmeldung bleibt alles ausschliesslich auf diesem Gerät.</p>
            </div>
            <div className="modal-foot"><button className="btn btn-primary" onClick={() => setPrivacyOpen(false)}>Verstanden</button></div>
          </div>
        </div>
      )}

      {delOpen && (
        <div className="modal-backdrop" onClick={() => !delBusy && setDelOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-head">
              <div className="modal-title">Account löschen</div>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => !delBusy && setDelOpen(false)}><Icon name="x" size={16} /></button>
            </div>
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.45, marginBottom: 12 }}>
              {cloudActive
                ? "Das löscht deine Daten endgültig – auf diesem Gerät und in der Cloud. Danach wirst du abgemeldet."
                : "Das löscht alle Vokabeln, Listen und Fortschritte auf diesem Gerät."}
              {" "}Tippe zum Bestätigen <b style={{ color: "var(--ink)" }}>LÖSCHEN</b>.
            </div>
            <input className="field" placeholder="LÖSCHEN" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
            {delErr && <div className="badge red" style={{ marginTop: 10 }}><span className="dot" />{delErr}</div>}
            <div className="modal-foot">
              <button className="btn btn-ghost" disabled={delBusy} onClick={() => setDelOpen(false)}>Abbrechen</button>
              <button className="btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} disabled={delBusy || confirmText.trim().toUpperCase() !== "LÖSCHEN"} onClick={doDelete}>
                {delBusy ? <Icon name="refresh" size={15} /> : <Icon name="trash" size={15} />} Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="muted" style={{ fontSize: 11.5, textAlign: "center", padding: "4px 0 10px" }}>
        Settings are saved on this device and apply to both language tracks.
      </div>
    </div>
  );
}
