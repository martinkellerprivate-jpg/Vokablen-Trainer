/* V18 — drag-&-drop lesson builder (desktop comfort path). Left = lesson drop
 * target, right = lists/topics as an accordion. Dropping a word adds its id;
 * dropping a whole list/topic adds a STATIC snapshot (same as V9), deduped, same
 * pair only. The mobile tap path (V9 lesson edit „+ hinzufügen") stays the way on
 * touch — native HTML5 DnD is the desktop extra, not a replacement. */
import { useState, useMemo } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { fk, isLatinPair } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";
import { snapshotMembers } from "../lib/engine";

export function LessonBuilder({ pair }: { pair: string }) {
  const store = useStore();
  const toast = useToast();
  const { vocab, lessons, lists } = store;
  const isLat = isLatinPair(pair);
  const fgn = (w: any) => isLat ? latinHeadword(w) : (w[fk(pair)] || "");

  const [targetId, setTargetId] = useState("");
  const [newName, setNewName] = useState("");
  const [openSrc, setOpenSrc] = useState<string | null>(null);
  const [hot, setHot] = useState(false);

  const pairVocab = useMemo(() => vocab.filter((w: any) => w.pair === pair), [vocab, pair]);
  const pairLists = useMemo(() => (lists || []).filter((l: any) => l.pair === pair), [lists, pair]);
  const pairLessons = useMemo(() => lessons.filter((l: any) => l.pair === pair), [lessons, pair]);
  const topics = useMemo<any[]>(() => Array.from(new Set(pairVocab.map((w: any) => w.topic).filter(Boolean))).sort(), [pairVocab]);
  const target = pairLessons.find((l: any) => l.id === targetId);

  const ensureTarget = (): string => {
    if (targetId && target) return targetId;
    const id = store.addLesson({ name: newName.trim() || "Neue Lektion", pair, members: [] });
    setTargetId(id);
    return id;
  };
  const handleDrop = (data: string) => {
    if (!data) return;
    const i = data.indexOf(":"); const type = data.slice(0, i); const ref = data.slice(i + 1);
    const id = ensureTarget();
    if (type === "word") { store.addWordsToLesson(id, [ref]); toast("Wort hinzugefügt", "check"); }
    else { const m = snapshotMembers(vocab, pair, { type: type as any, ref }); store.addWordsToLesson(id, m); toast(`${m.length} Wörter (Momentaufnahme)`, "check"); }
  };
  const drag = (data: string) => (e: any) => { e.dataTransfer.setData("text/plain", data); e.dataTransfer.effectAllowed = "copy"; };

  return (
    <div className="dnd-builder">
      {/* LEFT: lesson drop target */}
      <div className={"dnd-target" + (hot ? " hot" : "")}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); handleDrop(e.dataTransfer.getData("text/plain")); }}>
        <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <select className="field" style={{ width: "auto", minWidth: 140 }} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">+ Neue Lektion …</option>
            {pairLessons.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {!targetId && <input className="field" style={{ width: 150 }} placeholder="Name der Lektion" value={newName} onChange={(e) => setNewName(e.target.value)} />}
        </div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>Wörter, Listen oder Themen hierher ziehen{target ? "" : " (legt die Lektion an)"}.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 40 }}>
          {target && (target.members || []).length ? (target.members || []).map((wid: string) => {
            const w = pairVocab.find((x: any) => x.id === wid); if (!w) return null;
            return <span key={wid} className="mini-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{fgn(w)} <button className="btn-ghost" style={{ border: "none", padding: 0, cursor: "pointer", color: "var(--ink-faint)" }} onClick={() => store.removeWordFromLesson(target.id, wid)}><Icon name="x" size={12} /></button></span>;
          }) : <span className="faint" style={{ fontSize: 12.5 }}>Noch leer.</span>}
        </div>
      </div>

      {/* RIGHT: lists + topics accordion (draggable sources) */}
      <div className="dnd-source">
        {pairLists.map((l: any) => {
          const ws = pairVocab.filter((w: any) => (w.lists || []).includes(l.id));
          const key = "list:" + l.id;
          return (
            <div key={key} className="dnd-grp">
              <div className="dnd-grp-head" draggable onDragStart={drag(key)}>
                <button className="btn-ghost" style={{ border: "none", background: "none", cursor: "pointer", flex: 1, textAlign: "left", padding: 0 }} onClick={() => setOpenSrc(openSrc === key ? null : key)}>
                  <Icon name="list" size={13} /> {l.name} <span className="muted">· {ws.length}</span>
                </button>
                <Icon name="cards" size={12} style={{ opacity: .5 }} />
              </div>
              {openSrc === key && <div className="dnd-words">{ws.map((w: any) => <span key={w.id} className="mini-chip" draggable onDragStart={drag("word:" + w.id)} style={{ cursor: "grab" }}>{fgn(w)}</span>)}</div>}
            </div>
          );
        })}
        {topics.map((t) => {
          const ws = pairVocab.filter((w: any) => w.topic === t);
          const key = "topic:" + t;
          return (
            <div key={key} className="dnd-grp">
              <div className="dnd-grp-head" draggable onDragStart={drag(key)}>
                <button className="btn-ghost" style={{ border: "none", background: "none", cursor: "pointer", flex: 1, textAlign: "left", padding: 0 }} onClick={() => setOpenSrc(openSrc === key ? null : key)}>
                  <Icon name="filter" size={13} /> {t} <span className="muted">· {ws.length}</span>
                </button>
                <Icon name="cards" size={12} style={{ opacity: .5 }} />
              </div>
              {openSrc === key && <div className="dnd-words">{ws.map((w: any) => <span key={w.id} className="mini-chip" draggable onDragStart={drag("word:" + w.id)} style={{ cursor: "grab" }}>{fgn(w)}</span>)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
