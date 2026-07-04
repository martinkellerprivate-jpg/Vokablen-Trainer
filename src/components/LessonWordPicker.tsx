/* FR3-7 — two-column word picker: LEFT the lesson (target), RIGHT the lists as an
 * accordion. Tapping a word moves it into the lesson (click is the main way; desktop
 * drag-and-drop is added on top). Words already in the lesson show a ✓. Same pair
 * only (the source lists are pair-filtered). Static snapshot of single words; dedup
 * via the store's addWordsToLesson (Set union). */
import { useState } from "react";
import { useStore } from "../store/StoreProvider";
import { Icon } from "../ui/Icon";
import { PAIRS, fk, isLatinPair } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";

export function LessonWordPicker({ lessonId, pair, onClose }: { lessonId: string; pair: string; onClose: () => void }) {
  const store = useStore();
  const { lessons, lists, vocab } = store;
  const lesson = lessons.find((l: any) => l.id === lessonId);
  const isLat = isLatinPair(pair);
  const P = PAIRS[pair] || PAIRS["en-de"];
  const fgn = (w: any) => isLat ? latinHeadword(w) : (w[fk(pair)] || w.de || "");
  const wordsOfList = (id: string) => vocab.filter((w: any) => w.pair === pair && (w.lists || []).includes(id));
  // same-pair lists; hide an empty "Wörter ohne Liste" (PFLICHT 2: auto-hide when empty)
  const pairLists = (lists || []).filter((l: any) => l.pair === pair && !(l.system === "nolist" && wordsOfList(l.id).length === 0));
  const [openList, setOpenList] = useState<string | null>(pairLists[0]?.id || null);
  const [dragWid, setDragWid] = useState<string | null>(null);

  const members = new Set(lesson?.members || []);
  const memberWords = (lesson?.members || []).map((id: string) => vocab.find((w: any) => w.id === id)).filter(Boolean);
  const add = (wid: string) => store.addWordsToLesson(lessonId, [wid]);
  const remove = (wid: string) => store.removeWordFromLesson(lessonId, wid);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, maxHeight: "86vh", overflow: "hidden", display: "flex", flexDirection: "column" } as any}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Wörter auswählen</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Tippe rechts ein Wort an — es wandert in „{lesson?.name}". Am Computer geht auch Ziehen.</div>
          </div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div className="picker-cols">
          {/* LEFT: the lesson (drop target) */}
          <div className="picker-col picker-target"
            onDragOver={(e) => { if (dragWid) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (dragWid) { add(dragWid); setDragWid(null); } }}>
            <div className="picker-col-head">{lesson?.name} <span className="lchip-n">{memberWords.length}</span></div>
            <div className="picker-chips">
              {memberWords.length ? memberWords.map((w: any) => (
                <button key={w.id} className="mini-chip picker-chip in" onClick={() => remove(w.id)} title="Entfernen">{fgn(w)} <Icon name="x" size={11} /></button>
              )) : <span className="faint" style={{ fontSize: 12.5 }}>Noch keine Wörter — rechts ein Wort antippen.</span>}
            </div>
          </div>

          {/* RIGHT: lists accordion */}
          <div className="picker-col picker-source">
            {pairLists.length === 0 ? <span className="faint" style={{ fontSize: 12.5 }}>Keine Listen in diesem Sprachpaar.</span> :
              pairLists.map((li: any) => {
                const ws = wordsOfList(li.id);
                const open = openList === li.id;
                return (
                  <div key={li.id} className="picker-acc">
                    <button className="picker-acc-head" onClick={() => setOpenList(open ? null : li.id)}>
                      <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span> {li.name} <span className="lchip-n">{ws.length}</span>
                    </button>
                    {open && (
                      <div className="picker-chips">
                        {ws.map((w: any) => {
                          const isIn = members.has(w.id);
                          return (
                            <button key={w.id} className={"mini-chip picker-chip" + (isIn ? " in" : "")}
                              draggable={!isIn} onDragStart={() => setDragWid(w.id)} onDragEnd={() => setDragWid(null)}
                              onClick={() => isIn ? remove(w.id) : add(w.id)}
                              title={isIn ? "Enthalten — antippen zum Entfernen" : "Antippen (oder ziehen) zum Hinzufügen"}>
                              {isIn && <Icon name="check" size={11} />} {fgn(w)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <div className="modal-foot" style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={onClose}>Fertig</button></div>
      </div>
    </div>
  );
}
