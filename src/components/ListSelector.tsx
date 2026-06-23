import { useState, useEffect } from "react";
import { useStore } from "../store/StoreProvider";
import { Icon } from "../ui/Icon";
import { SMART, smartCount } from "../lib/engine";

/* ===================================================================
 * lists.jsx — list (lesson) selector chips + list-picker modal.
 * Both are scoped to a language pair when a `pair` prop is given.
 * =================================================================== */

export function ListSelector({ selected, onChange, smart = ["tricky"], pair, mc }) {
  const { lists, lessons, vocab, stats } = useStore();
  const pairLists = pair ? lists.filter((l) => l.pair === pair) : lists;
  const pairLessons = (pair ? (lessons || []).filter((l: any) => l.pair === pair) : (lessons || []));
  const pairVocab = pair ? vocab.filter((w) => w.pair === pair) : vocab;
  const sel = selected || [];
  const isAll = sel.length === 0;
  const countFor = (id) => pairVocab.filter((w) => (w.lists || []).includes(id)).length;
  const lessonCount = (l: any) => (l.members || []).length;
  const topics: any[] = Array.from(new Set(pairVocab.map((w: any) => w.topic).filter(Boolean))).sort();
  const topicCount = (t) => pairVocab.filter((w) => w.topic === t).length;

  const toggle = (id) => {
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    onChange(next);
  };
  // F-NAV-2: three collapsible groups (Lektionen default open) + "alle" per group.
  const [lessonsOpen, setLessonsOpen] = useState(true);
  const [listsOpen, setListsOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const toggleAll = (toks: string[]) => {
    const on = toks.length > 0 && toks.every((t) => sel.includes(t));
    onChange(on ? sel.filter((t) => !toks.includes(t)) : Array.from(new Set([...sel, ...toks])));
  };
  const head = (open: boolean, set: any, icon: string, label: string, n: number, toks: string[]) => (
    <div className="scope-group-head">
      <button className="lchips-label lchips-toggle" onClick={() => set((o: boolean) => !o)}>
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span> <Icon name={icon as any} size={13} /> {label} ({n})
      </button>
      {open && n > 0 && <button className="scope-all" onClick={() => toggleAll(toks)}>{toks.length && toks.every((t) => sel.includes(t)) ? "keine" : "alle"}</button>}
    </div>
  );
  const lessonToks = pairLessons.map((l: any) => "lesson:" + l.id);
  const listToks = pairLists.map((l: any) => l.id);
  const topicToks = topics.map((t) => "t:" + t);

  return (
    <div className="lchips-wrap">
      <div className="lchips">
        <button className={"lchip" + (isAll ? " on" : "")} onClick={() => onChange([])}>
          <Icon name="cards" size={14} /> Alle Wörter
        </button>
        {(smart || []).map((key) => {
          const sc = SMART[key]; if (!sc) return null;
          return (
            <button key={key} className={"lchip lchip-smart tone-" + sc.tone + (sel.includes(sc.id) ? " on" : "")}
              onClick={() => toggle(sc.id)} title={sc.help}>
              <Icon name={sc.icon} size={14} /> {sc.label} <span className="lchip-n">{smartCount(pairVocab, stats, key, mc)}</span>
            </button>
          );
        })}
      </div>
      {pairLessons.length > 0 && (
        <div className="lchips lchips-topics">
          {head(lessonsOpen, setLessonsOpen, "cards", "Lektionen", pairLessons.length, lessonToks)}
          {lessonsOpen && pairLessons.map((l: any) => (
            <button key={l.id} className={"lchip" + (sel.includes("lesson:" + l.id) ? " on" : "")} onClick={() => toggle("lesson:" + l.id)}>
              {l.name} <span className="lchip-n">{lessonCount(l)}</span>
            </button>
          ))}
        </div>
      )}
      {pairLists.length > 0 && (
        <div className="lchips lchips-topics">
          {head(listsOpen, setListsOpen, "list", "Listen", pairLists.length, listToks)}
          {listsOpen && pairLists.map((l) => (
            <button key={l.id} className={"lchip" + (sel.includes(l.id) ? " on" : "")} onClick={() => toggle(l.id)}>
              {l.name} <span className="lchip-n">{countFor(l.id)}</span>
            </button>
          ))}
        </div>
      )}
      {topics.length > 0 && (
        <div className="lchips lchips-topics">
          {head(topicsOpen, setTopicsOpen, "filter", "Themen", topics.length, topicToks)}
          {topicsOpen && topics.map((t) => (
            <button key={t} className={"lchip lchip-topic" + (sel.includes("t:" + t) ? " on" : "")} onClick={() => toggle("t:" + t)}>
              {t} <span className="lchip-n">{topicCount(t)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Modal to choose / create a target list (within `pair`). onPick(id, name). */
export function ListPicker({ open, title, subtitle, onPick, onClose, pair }) {
  const { lists, addList } = useStore();
  const pairLists = pair ? lists.filter((l) => l.pair === pair) : lists;
  const [choice, setChoice] = useState(pairLists[0] ? pairLists[0].id : "__new");
  const [newName, setNewName] = useState("");
  useEffect(() => { if (open) { setChoice(pairLists[0] ? pairLists[0].id : "__new"); setNewName(""); } }, [open]);
  if (!open) return null;

  const confirm = () => {
    if (choice === "__new") {
      const name = newName.trim() || "New list";
      const id = addList(name, pair);
      onPick(id, name);
    } else {
      const l = pairLists.find((x) => x.id === choice);
      onPick(choice, l ? l.name : "");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title || "Choose a list"}</div>
            {subtitle && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="picker-list">
          {pairLists.map((l) => (
            <label key={l.id} className={"picker-row" + (choice === l.id ? " on" : "")}>
              <input type="radio" name="lp" checked={choice === l.id} onChange={() => setChoice(l.id)} />
              <span className="grow">{l.name}</span>
            </label>
          ))}
          <label className={"picker-row" + (choice === "__new" ? " on" : "")}>
            <input type="radio" name="lp" checked={choice === "__new"} onChange={() => setChoice("__new")} />
            <Icon name="plus" size={15} />
            <input className="field" style={{ padding: "8px 11px" }} placeholder="New list name…"
              value={newName} onFocus={() => setChoice("__new")}
              onChange={(e) => { setNewName(e.target.value); setChoice("__new"); }} onKeyDown={(e) => e.key === "Enter" && confirm()} />
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm}><Icon name="check" size={15} /> Add here</button>
        </div>
      </div>
    </div>
  );
}
