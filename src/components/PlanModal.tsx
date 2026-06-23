/* PLANUNGS-RUNDE 2 — V-PLAN: the "Übungsplan" panel (replaces the 7-day outlook).
 * Freshly computed on every open, NO plan state.
 *
 * FIX D — two DIFFERENT numbers, never mixed:
 *  - Expected-value sentence "~X von Y": X = Σ retrievabilityAt(dueDate) — a forecast
 *    AT the exam day.
 *  - 5-stufen distribution line: deriveProfile stufen TODAY (effective retention now).
 *  Different calculation, different point in time. */
import { useStore } from "../store/StoreProvider";
import { Icon } from "../ui/Icon";
import { deriveProfile, retrievabilityAt, effectiveRetentionFor, retentionFor, STUFE, STUFE_ORDER } from "../lib/fsrs";
import { resolveLesson, resolveSmart } from "../lib/engine";
import { practiceable } from "../lib/pairs";

const DAY = 86400000;
const toneVar = (t: string) => t === "green" ? "var(--green)" : t === "amber" ? "var(--amber)" : t === "red" ? "var(--red)" : t === "blue" ? "var(--blue)" : "var(--ink-faint)";

export function PlanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  if (!open) return null;
  const { vocab, stats, lessons, settings } = store;
  const pair = settings.pair;
  const now = Date.now();
  const examWindow = (settings.examWindowDays ?? 3);
  const baseRet = retentionFor(settings);

  const go = (tokens: string[]) => {
    window.dispatchEvent(new CustomEvent("vt-practice-scope", { detail: tokens }));
    window.dispatchEvent(new CustomEvent("vt-tab", { detail: "practice" }));
    onClose();
  };

  // Part 1 — exam lessons (with a dueDate), soonest first.
  const examLessons = (lessons || [])
    .filter((l: any) => l.pair === pair && l.dueDate)
    .sort((a: any, b: any) => a.dueDate - b.dueDate);

  const examCard = (l: any) => {
    const words = resolveLesson(l, vocab);
    const daysLeft = Math.ceil((l.dueDate - now) / DAY);
    const near = daysLeft <= examWindow && daysLeft >= 0;
    // FIX D — forecast AT the exam day: Σ retrievability at dueDate
    const expected = Math.round(words.reduce((a: number, w: any) => a + (retrievabilityAt(stats[w.id]?.fsrs, l.dueDate) ?? 0), 0));
    // FIX D — stand TODAY: deriveProfile stufen now (separate calculation)
    const effRet = effectiveRetentionFor(words[0] || {}, settings, lessons, now); // lesson-level exam densification
    const dist: Record<string, number> = { sitzt: 0, sitzt_fast: 0, sitzt_schlecht: 0, neu: 0, noch_nicht_geuebt: 0 };
    for (const w of words) dist[deriveProfile(stats[w.id]?.fsrs, effRet, now).stufe]++;
    const dateStr = new Date(l.dueDate).toLocaleDateString("de-CH", { weekday: "short", day: "numeric", month: "long" });
    const countdown = daysLeft < 0 ? "vorbei" : daysLeft === 0 ? "heute" : daysLeft === 1 ? "morgen" : `in ${daysLeft} Tagen`;
    return (
      <div key={l.id} className={"plan-exam" + (near ? " near" : "")}>
        <div className="plan-exam-head">
          <div>
            <div className="plan-exam-name">{l.name}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>{dateStr} · {countdown}</div>
          </div>
          <button className={"btn btn-sm " + (near ? "btn-amber" : "")} onClick={() => go(["lesson:" + l.id])}>{l.name.length > 14 ? "Üben" : l.name + " üben"}</button>
        </div>
        <div className="plan-forecast">Du kannst voraussichtlich schon <b>~{expected} von {words.length}</b> {words.length === 1 ? "Wort" : "Wörtern"}.</div>
        <div className="stufe-band" style={{ height: 12, margin: "8px 0 6px" }}>
          {STUFE_ORDER.map((k) => dist[k] ? <i key={k} style={{ flex: dist[k], background: toneVar(STUFE[k].tone) }} title={`${STUFE[k].label}: ${dist[k]}`} /> : null)}
        </div>
        <div className="plan-legend">
          {STUFE_ORDER.filter((k) => dist[k]).map((k) => (
            <span key={k} className="plan-leg"><span className="dot" style={{ background: toneVar(STUFE[k].tone) }} />{dist[k]} {STUFE[k].label}</span>
          ))}
        </div>
      </div>
    );
  };

  const nearExams = examLessons.filter((l: any) => { const d = Math.ceil((l.dueDate - now) / DAY); return d <= examWindow && d >= 0; });

  // Part 2 — practice without a deadline.
  const pv = vocab.filter((w: any) => w.pair === pair);
  const dueN = resolveSmart("due", pv, stats, settings.masteryCorrect, { retention: baseRet }).filter(practiceable).length;
  const leechN = resolveSmart("leech", pv, stats, settings.masteryCorrect, { retention: baseRet }).filter(practiceable).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: "86vh", overflowY: "auto" } as any}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Übungsplan</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Was als Nächstes dran ist — frisch berechnet.</div>
          </div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {examLessons.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div className="section-title" style={{ marginBottom: 10 }}>Prüfungen</div>
            {nearExams.length > 1 && (
              <button className="btn btn-amber" style={{ marginBottom: 12 }} onClick={() => go(nearExams.map((l: any) => "lesson:" + l.id))}>
                <Icon name="flame" size={15} /> Alle Prüfungen zusammen üben
              </button>
            )}
            <div className="col" style={{ gap: 12 }}>{examLessons.map(examCard)}</div>
          </div>
        )}

        <div className="section-title" style={{ marginBottom: 4 }}>Üben ohne Prüfungsdeadline</div>
        <div className="col" style={{ gap: 10 }}>
          <div className="plan-row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Fällige Wörter wiederholen <span className="lchip-n">{dueN}</span></div>
              <div className="faint" style={{ fontSize: 12 }}>Diese Wörter bist du langsam wieder am Vergessen — jetzt üben, dann bleiben sie sitzen.</div>
            </div>
            <button className="btn btn-sm" disabled={!dueN} onClick={() => go(["smart:due"])}>Üben</button>
          </div>
          <div className="plan-row">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Schwierige Wörter auffrischen <span className="lchip-n">{leechN}</span></div>
              <div className="faint" style={{ fontSize: 12 }}>Diese Wörter gehen dir immer wieder verloren. Üben hilft — am besten mit einem Trick zum Merken.</div>
            </div>
            <button className="btn btn-sm" disabled={!leechN} onClick={() => go(["smart:leech"])}>Üben</button>
          </div>
        </div>
      </div>
    </div>
  );
}
