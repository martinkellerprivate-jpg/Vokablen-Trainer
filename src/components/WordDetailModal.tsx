/* V16 — word detail popup: full FSRS drilldown for a single word.
 * (A) readable, from deriveProfile (the one source); (B) raw stat.fsrs values,
 * with the derived due/interval clearly marked "berechnet". Read-only; the edit
 * path stays separate (own button). Never practised → no FSRS object (state New). */
import { useStore } from "../store/StoreProvider";
import { Icon } from "../ui/Icon";
import { PAIRS, fk, isLatinPair, NATIVE } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";
import { deriveProfile, retentionFor, effectiveRetentionFor, STUFE } from "../lib/fsrs";

const DAY = 86400000;
const toneVar = (t: string) => t === "green" ? "var(--green)" : t === "amber" ? "var(--amber)" : t === "red" ? "var(--red)" : "var(--ink-faint)";
const STATE_NAME = ["New", "Learning", "Review", "Relearning"];
const fmtDate = (ms?: number) => ms ? new Date(ms).toLocaleDateString() : "—";

export function WordDetailModal({ open, word, onClose, onEdit }: { open: boolean; word: any; onClose: () => void; onEdit?: (w: any) => void }) {
  const store = useStore();
  if (!open || !word) return null;
  const { stats, settings, lists, lessons } = store;
  const pair = settings.pair;
  const isLat = isLatinPair(pair);
  const stat = stats[word.id];
  const card = stat?.fsrs;
  const retention = effectiveRetentionFor(word, settings, lessons);
  const now = Date.now();
  const prof = deriveProfile(card, retention, now);
  const fgn = isLat ? latinHeadword(word) : (word[fk(pair)] || word.en || word.fr || "");

  const memberLists = (lists || []).filter((l: any) => (word.lists || []).includes(l.id)).map((l: any) => l.name);
  const memberLessons = (lessons || []).filter((l: any) => (l.members || []).includes(word.id)).map((l: any) => l.name);

  const Row = ({ k, v, hint }: any) => (
    <div className="row" style={{ justifyContent: "space-between", gap: 12, padding: "5px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <span className="faint" style={{ fontSize: 12.5 }}>{k}{hint && <span style={{ opacity: .7 }}> · {hint}</span>}</span>
      <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "var(--mono)" }}>{v}</span>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{fgn}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{word[NATIVE]}{word.topic ? ` · ${word.topic}` : ""}</div>
          </div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {/* A — readable */}
        <div className="panel" style={{ padding: "12px 14px", marginBottom: 12 }}>
          <div className="row" style={{ gap: 9, alignItems: "center", marginBottom: 8 }}>
            <span className="dot" style={{ width: 12, height: 12, borderRadius: "50%", background: toneVar(prof.tone) }} />
            <span style={{ fontWeight: 700 }}>{STUFE[prof.stufe].label}</span>
            {prof.istLeech && <span className="badge red"><Icon name="flame" size={11} /> Leech</span>}
            {prof.istFaellig && <span className="badge amber"><span className="dot" />fällig</span>}
            {prof.baldFaellig && <span className="badge slate"><span className="dot" />bald fällig</span>}
          </div>
          {card ? (
            <>
              <Row k="hält etwa" v={`${Math.round(prof.haeltTage)} Tage`} />
              <Row k="Erinnerung jetzt" v={`${Math.round((prof.R_now || 0) * 100)} %`} />
              <Row k={prof.istFaellig ? "fällig seit" : "fällig in"} v={prof.due == null ? "—" : `${Math.abs(Math.ceil((prof.due - now) / DAY))} Tagen`} />
              <Row k="Retention-Ziel" v={`${Math.round(retention * 100)} %`} hint={retention !== retentionFor(settings) ? "Lektions-Override" : "global"} />
            </>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Noch nicht geübt — es gibt noch kein FSRS-Objekt (state New).</div>
          )}
        </div>

        {/* B — raw FSRS values */}
        {card && (
          <div className="panel" style={{ padding: "12px 14px", marginBottom: 12 }}>
            <div className="section-title" style={{ fontSize: 12.5, marginBottom: 6 }}>Rohwerte (FSRS)</div>
            <Row k="stability" v={card.stability.toFixed(2)} />
            <Row k="difficulty" v={card.difficulty.toFixed(2)} />
            <Row k="reps · lapses" v={`${card.reps} · ${card.lapses}`} />
            <Row k="state" v={STATE_NAME[card.state] || card.state} />
            <Row k="last_review" v={fmtDate(card.last_review)} />
            <Row k="scheduled_days" v={card.scheduled_days} />
            <Row k="due" hint="berechnet" v={prof.due == null ? "—" : fmtDate(prof.due)} />
            <Row k="interval" hint="berechnet" v={prof.interval == null ? "—" : `${Math.round(prof.interval)} T`} />
          </div>
        )}

        {/* membership */}
        <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <div>Listen: {memberLists.length ? memberLists.join(", ") : "—"}</div>
          <div>Lektionen: {memberLessons.length ? memberLessons.join(", ") : "—"}</div>
        </div>

        <div className="modal-foot" style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>Schliessen</button>
          {onEdit && <button className="btn btn-primary" onClick={() => { onEdit(word); onClose(); }}><Icon name="edit" size={15} /> Bearbeiten</button>}
        </div>
      </div>
    </div>
  );
}
