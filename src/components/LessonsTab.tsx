/* Lessons tab (V6) — the library of practice units for the active pair.
 * Words = library · Lessons = what you practise · Practise = practising.
 * Built-in smart quick-accesses (Fällige/Schwierige) live on the Practice
 * screen, NOT here. */
import { useState, useMemo } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { PAIRS, fk, isLatinPair } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";
import { resolveLesson } from "../lib/engine";

export function LessonsTab() {
  const store = useStore();
  const toast = useToast();
  const { lessons, vocab, settings } = store;
  const pair = settings.pair;
  const P = PAIRS[pair] || PAIRS["en-de"];
  const isLat = isLatinPair(pair);

  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [openMembers, setOpenMembers] = useState(null);

  const pairLessons = useMemo(() => lessons.filter((l) => l.pair === pair), [lessons, pair]);
  const pairVocab = useMemo(() => vocab.filter((w) => w.pair === pair), [vocab, pair]);
  const topics = useMemo<any[]>(() => Array.from(new Set(pairVocab.map((w: any) => w.topic).filter(Boolean))).sort(), [pairVocab]);
  const fgn = (w) => isLat ? latinHeadword(w) : (w[fk(pair)] || "");
  const countOf = (l) => resolveLesson(l, vocab).length;
  const kindLabel = (l) => l.kind === "static" ? "Handauswahl" : l.source?.type === "topic" ? "Thema" : "Liste";

  const createFromTopic = () => {
    if (!newTopic) return;
    if (pairLessons.some((l) => l.source?.type === "topic" && l.source.ref === newTopic)) { toast("Lektion für dieses Thema gibt es schon", "x"); return; }
    store.addLesson({ name: newTopic, pair, kind: "dynamic", source: { type: "topic", ref: newTopic } });
    toast(`Lektion „${newTopic}" erstellt`, "check");
    setNewTopic("");
  };
  const startRename = (l) => { setEditId(l.id); setEditName(l.name); };
  const commitRename = () => { if (editId) store.updateLesson(editId, { name: editName.trim() || "Lektion" }); setEditId(null); };
  const move = (id, delta) => {
    const arr = [...lessons];
    const i = arr.findIndex((l) => l.id === id);
    let j = i + delta;
    while (j >= 0 && j < arr.length && arr[j].pair !== pair) j += delta;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    store.setLessons(arr);
  };
  const removeMember = (l, wid) => store.updateLesson(l.id, { members: (l.members || []).filter((x) => x !== wid) });

  return (
    <div>
      <div className="bar" style={{ alignItems: "flex-end" }}>
        <div className="grow">
          <div className="section-title">Lektionen · {P.foreignLabel} ⇄ Deutsch</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
            Lektionen sind, was du übst. Jede Liste ist automatisch als Lektion da. Neue Lektion aus einem Thema oder per Handauswahl in der Wortliste.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select className="field" style={{ width: "auto", minWidth: 150 }} value={newTopic} onChange={(e) => setNewTopic(e.target.value)}>
            <option value="">Thema wählen …</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="btn btn-sm btn-primary" onClick={createFromTopic} disabled={!newTopic}><Icon name="plus" size={15} /> Aus Thema</button>
        </div>
      </div>

      {pairLessons.length === 0 && (
        <div className="empty"><div className="big">Noch keine Lektionen</div><div>Aktiviere einen Grundwortschatz oder lege oben eine Themen-Lektion an.</div></div>
      )}

      <div className="col" style={{ gap: 10 }}>
        {pairLessons.map((l, i) => (
          <div key={l.id} className="panel" style={{ padding: "12px 14px" }}>
            <div className="row" style={{ gap: 10, alignItems: "center" }}>
              <span className="badge slate" style={{ flex: "0 0 auto" }}><span className="dot" />{kindLabel(l)}</span>
              {editId === l.id ? (
                <input className="mini-input grow" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={commitRename} onKeyDown={(e) => e.key === "Enter" && commitRename()} />
              ) : (
                <span className="grow" style={{ fontWeight: 600 }}>{l.name} <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· {countOf(l)} Wörter</span></span>
              )}
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="Nach oben" disabled={i === 0} onClick={() => move(l.id, -1)}><Icon name="arrowRight" size={14} style={{ transform: "rotate(-90deg)" }} /></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="Nach unten" disabled={i === pairLessons.length - 1} onClick={() => move(l.id, 1)}><Icon name="arrowRight" size={14} style={{ transform: "rotate(90deg)" }} /></button>
              {l.kind === "static" && <button className="icon-btn" style={{ width: 30, height: 30 }} title="Mitglieder" onClick={() => setOpenMembers(openMembers === l.id ? null : l.id)}><Icon name="list" size={14} /></button>}
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="Umbenennen" onClick={() => startRename(l)}><Icon name="edit" size={14} /></button>
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="Löschen" onClick={() => store.deleteLesson(l.id)}><Icon name="trash" size={14} /></button>
            </div>
            {l.kind === "static" && openMembers === l.id && (
              <div className="chk-wrap" style={{ marginTop: 10 }}>
                {(l.members || []).length ? (l.members || []).map((wid) => {
                  const w = pairVocab.find((x) => x.id === wid);
                  if (!w) return null;
                  return <span key={wid} className="mini-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{fgn(w)} <button className="btn-ghost" style={{ border: "none", padding: 0, cursor: "pointer", color: "var(--ink-faint)" }} onClick={() => removeMember(l, wid)}><Icon name="x" size={12} /></button></span>;
                }) : <span className="faint" style={{ fontSize: 12.5 }}>Noch keine Wörter — in der Wortliste auswählen und hinzufügen.</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
