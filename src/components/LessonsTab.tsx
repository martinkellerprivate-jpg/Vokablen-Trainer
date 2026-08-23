/* Lessons tab (V9) — lessons are STATIC snapshots, shown as trackable units:
 * a 4-colour mastery band + "% sitzt" + "zuletzt geübt" + optional deadline.
 * Beherrschung comes only from deriveProfile (the one source). */
import { useState, useMemo } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { PAIRS, fk, isLatinPair } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";
import { resolveLesson, lessonProfile, snapshotMembers, examPrognosis } from "../lib/engine";
import { STUFE, STUFE_ORDER, retentionFor, deriveProfile } from "../lib/fsrs";
import { LessonWordPicker } from "./LessonWordPicker";

const DAY = 86400000;
const toneVar = (t: string) => t === "green" ? "var(--green)" : t === "amber" ? "var(--amber)" : t === "red" ? "var(--red)" : t === "blue" ? "var(--blue)" : "var(--bg-2)";

function deadlineText(due?: number, now = Date.now()) {
  if (!due) return null;
  const days = Math.ceil((due - now) / DAY);
  const near = days <= 3;
  const label = days < 0 ? `überfällig (${-days} T)` : days === 0 ? "heute fällig" : `in ${days} ${days === 1 ? "Tag" : "Tagen"}`;
  return { label, near };
}

export function LessonsTab() {
  const store = useStore();
  const toast = useToast();
  const { lessons, vocab, stats, settings } = store;
  const pair = settings.pair;
  const P = PAIRS[pair] || PAIRS["en-de"];
  const isLat = isLatinPair(pair);
  const retention = retentionFor(settings);

  const [openEdit, setOpenEdit] = useState<string | null>(null); // edit-mode lesson id
  const [editName, setEditName] = useState("");                  // inline name buffer
  const [newName, setNewName] = useState("");
  const [addSrc, setAddSrc] = useState("");
  const [wordFgn, setWordFgn] = useState("");                    // FR3-6 way 3: manual word
  const [wordDe, setWordDe] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null); // FR3-7: two-column picker

  const pairLessons = useMemo(() => lessons.filter((l: any) => l.pair === pair), [lessons, pair]);
  const pairVocab = useMemo(() => vocab.filter((w: any) => w.pair === pair), [vocab, pair]);
  const pairLists = useMemo(() => (store.lists || []).filter((l: any) => l.pair === pair), [store.lists, pair]);
  const topics = useMemo<any[]>(() => Array.from(new Set(pairVocab.map((w: any) => w.topic).filter(Boolean))).sort(), [pairVocab]);
  const fgn = (w: any) => isLat ? latinHeadword(w) : (w[fk(pair)] || "");

  // deadline-sorted (soonest first; lessons without a deadline after)
  const sorted = useMemo(() => [...pairLessons].sort((a: any, b: any) =>
    (a.dueDate || Infinity) - (b.dueDate || Infinity) || (a.createdAt || 0) - (b.createdAt || 0)), [pairLessons]);

  const createEmpty = () => {
    const name = newName.trim() || "Neue Lektion";
    store.addLesson({ name, pair, members: [] });
    toast(`Lektion „${name}" angelegt`, "check");
    setNewName("");
  };
  const openEditLesson = (l: any) => { const on = openEdit === l.id; setOpenEdit(on ? null : l.id); if (!on) setEditName(l.name); };
  const commitName = () => { if (openEdit) store.updateLesson(openEdit, { name: editName.trim() || "Lektion" }); };
  const addSnapshot = (l: any) => {
    if (!addSrc) return;
    const [type, ref] = addSrc.startsWith("t:") ? ["topic", addSrc.slice(2)] : ["list", addSrc];
    const members = snapshotMembers(vocab, pair, { type: type as any, ref });
    store.addWordsToLesson(l.id, members);
    toast(`${members.length} Wörter als Momentaufnahme hinzugefügt`, "check");
    setAddSrc("");
  };
  // FR3-6 way 3: a hand-typed word → lands in the per-pair "Wörter ohne Liste" list + the lesson.
  const addManualWord = (l: any) => {
    const f = wordFgn.trim(), d = wordDe.trim();
    if (!f || !d) return;
    const wid = store.addLooseWord({ [fk(pair)]: f, de: d }, pair);
    store.addWordsToLesson(l.id, [wid]);
    toast(`„${f}" hinzugefügt (in „Wörter ohne Liste")`, "check");
    setWordFgn(""); setWordDe("");
  };
  const setDeadline = (l: any, val: string) => store.updateLesson(l.id, { dueDate: val ? new Date(val + "T08:00:00").getTime() : undefined });

  return (
    <div>
      <div className="bar" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div className="grow">
          <div className="section-title">Lektionen · {P.foreignLabel} ⇄ Deutsch</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
            Lektionen sind feste Momentaufnahmen von Wörtern. Farbe = wie gut sie sitzen (aus deinem Lernstand). Ein Prüfungstermin ist optional und zeigt, wie viel Zeit bleibt.
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="field" style={{ width: 180 }} placeholder="Name der Lektion …" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createEmpty()} />
          <button className="btn btn-sm btn-primary" onClick={createEmpty}><Icon name="plus" size={15} /> Erstellen</button>
        </div>
      </div>

      {pairLessons.length === 0 && (
        <div className="empty"><div className="big">Noch keine Lektionen</div><div>Gib oben einen Namen ein und klicke „Erstellen" — danach kannst du Wörter hinzufügen.</div></div>
      )}

      <div className="col" style={{ gap: 12 }}>
        {sorted.map((l: any) => {
          const prof = lessonProfile(l, vocab, stats, retention);
          const dl = deadlineText(l.dueDate);
          const notSitting = resolveLesson(l, vocab).filter((w: any) => deriveProfile(stats[w.id]?.fsrs, retention).stufe !== "sitzt");
          const shownMembers = notSitting.slice(0, 8);
          return (
            <div key={l.id} className="panel" style={{ padding: "13px 15px" }}>
              <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className="dot" style={{ width: 11, height: 11, borderRadius: "50%", background: toneVar(prof.tone), flex: "0 0 auto" }} />
                {openEdit === l.id ? (
                  <input className="mini-input grow" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} title="Name bearbeiten" />
                ) : (
                  <span className="grow" style={{ fontWeight: 600 }}>{l.name}
                    <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> · {prof.total} {prof.total === 1 ? "Wort" : "Wörter"} · {Math.round(prof.pctSitzt * 100)}% sitzt</span>
                    {l.origin && <span className="badge slate" style={{ marginLeft: 8 }}><span className="dot" />{l.origin}</span>}
                  </span>
                )}
                {dl && <span className="badge" style={{ background: dl.near ? "var(--red-bg)" : "var(--bg-2)", color: dl.near ? "var(--red)" : "var(--ink-soft)" }}><Icon name="target" size={12} /> {dl.label}</span>}
                <button className={"icon-btn" + (openEdit === l.id ? " active" : "")} style={{ width: 30, height: 30 }} title="Bearbeiten" onClick={() => openEditLesson(l)}><Icon name="edit" size={14} /></button>
                <button className="icon-btn" style={{ width: 30, height: 30 }} title="Löschen" onClick={() => store.deleteLesson(l.id)}><Icon name="trash" size={14} /></button>
              </div>

              {/* 4-colour mastery band */}
              {prof.total > 0 && (
                <div className="stufe-band" title={STUFE_ORDER.map((k) => `${STUFE[k].label}: ${prof.dist[k] || 0}`).join(" · ")}>
                  {STUFE_ORDER.map((k) => prof.dist[k] ? <i key={k} style={{ flex: prof.dist[k], background: toneVar(STUFE[k].tone) }} /> : null)}
                </div>
              )}
              <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                <span className="faint" style={{ fontSize: 12 }}>{prof.lastReview ? `zuletzt geübt: vor ${Math.max(0, Math.round((Date.now() - prof.lastReview) / DAY))} T` : "noch nicht geübt"}</span>
                {notSitting.length > 0 && (
                  <span className="faint" style={{ fontSize: 12, textAlign: "right" }}>
                    wackelt noch: {shownMembers.map((w: any) => fgn(w)).join(", ")}{notSitting.length > shownMembers.length ? ` … +${notSitting.length - shownMembers.length} weitere` : ""}
                  </span>
                )}
              </div>

              {/* V15: exam prognosis when a deadline is set */}
              {l.dueDate && (() => {
                const pg = examPrognosis(l, vocab, stats);
                if (!pg) return null;
                const seg = (n: number, tone: string) => n ? <i style={{ flex: n, background: toneVar(tone) }} /> : null;
                return (
                  <div className="exam-box">
                    <div className="exam-head">
                      <Icon name="target" size={13} /> {pg.daysLeft < 0 ? "Prüfung vorbei" : `Prüfung in ${pg.daysLeft} ${pg.daysLeft === 1 ? "Tag" : "Tagen"}`} · <b>{pg.buckets.sicher.length} von {pg.total} sicher</b> <span className="faint">· Schätzung</span>
                    </div>
                    <div className="stufe-band" style={{ marginTop: 7 }}>
                      {seg(pg.buckets.sicher.length, "green")}{seg(pg.buckets.wackelig.length, "amber")}{seg(pg.buckets.vergessen.length, "red")}
                    </div>
                    {pg.need > 0 && pg.daysLeft >= 0 && (
                      <div className="row" style={{ justifyContent: "space-between", marginTop: 7, gap: 8, flexWrap: "wrap" }}>
                        <span className="faint" style={{ fontSize: 12 }}>Übe alle {pg.need} Wörter · Empfehlung: {pg.perDay}/Tag{pg.unreachable > 0 ? ` · ${pg.unreachable} kaum noch auf grün` : ""}</span>
                        <button className="btn btn-sm btn-amber" onClick={() => { store.setSettings({ practiceSel: "lesson:" + l.id }); window.dispatchEvent(new CustomEvent("vt-tab", { detail: "practice" })); }}>
                          <Icon name="flame" size={13} /> Gefährdete üben ({pg.need})
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {openEdit === l.id && (
                <div className="chk-wrap" style={{ marginTop: 10, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
                  <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                    <label className="faint" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Icon name="target" size={13} /> Prüfungstermin (optional): <input type="date" className="field" style={{ width: "auto" }} value={l.dueDate ? new Date(l.dueDate).toISOString().slice(0, 10) : ""} onChange={(e) => setDeadline(l, e.target.value)} />
                    </label>
                    {/* A native date input can't reliably be cleared on iOS — give it an explicit way out. */}
                    {l.dueDate && (
                      <button className="icon-btn" style={{ width: 26, height: 26 }} title="Prüfungstermin entfernen"
                        onClick={() => setDeadline(l, "")}><Icon name="x" size={12} /></button>
                    )}
                  </div>

                  <div className="lesson-ways">
                    {/* Weg 1: aus Listen auswählen (Zwei-Spalten-Picker) */}
                    <button className="btn btn-sm" onClick={() => setPickerFor(l.id)}><Icon name="list" size={14} /> Aus Listen auswählen</button>
                    {/* Weg 2: ganze Liste / ganzes Thema übernehmen */}
                    <div className="row" style={{ gap: 6 }}>
                      <select className="field" style={{ width: "auto", minWidth: 150 }} value={addSrc} onChange={(e) => setAddSrc(e.target.value)}>
                        <option value="">Ganze Liste / Thema übernehmen …</option>
                        {pairLists.filter((li: any) => li.system !== "nolist" || (li.members || pairVocab.filter((w:any)=>(w.lists||[]).includes(li.id))).length).map((li: any) => <option key={li.id} value={li.id}>Liste: {li.name}</option>)}
                        {topics.map((t) => <option key={"t:" + t} value={"t:" + t}>Thema: {t}</option>)}
                      </select>
                      <button className="btn btn-sm" disabled={!addSrc} onClick={() => addSnapshot(l)}><Icon name="plus" size={14} /> Übernehmen</button>
                    </div>
                    {/* Weg 3: eigenes Wort tippen → "Wörter ohne Liste" */}
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <input className="field" style={{ width: 130 }} placeholder={P.foreignLabel} value={wordFgn} onChange={(e) => setWordFgn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addManualWord(l)} />
                      <input className="field" style={{ width: 130 }} placeholder="Deutsch" value={wordDe} onChange={(e) => setWordDe(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addManualWord(l)} />
                      <button className="btn btn-sm" disabled={!wordFgn.trim() || !wordDe.trim()} onClick={() => addManualWord(l)}><Icon name="plus" size={14} /> Eigenes Wort</button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {(l.members || []).length ? (l.members || []).map((wid: string) => {
                      const w = pairVocab.find((x: any) => x.id === wid);
                      if (!w) return null;
                      return <span key={wid} className="mini-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{fgn(w)} <button className="btn-ghost" style={{ border: "none", padding: 0, cursor: "pointer", color: "var(--ink-faint)" }} onClick={() => store.removeWordFromLesson(l.id, wid)}><Icon name="x" size={12} /></button></span>;
                    }) : <span className="faint" style={{ fontSize: 12.5 }}>Noch keine Wörter — wähle oben aus Listen, übernimm eine Liste/ein Thema, oder tippe ein eigenes Wort.</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pickerFor && <LessonWordPicker lessonId={pickerFor} pair={pair} onClose={() => setPickerFor(null)} />}
    </div>
  );
}
