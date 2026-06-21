import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { speak } from "../ui/speak";
import { translateWord } from "../lib/translate";
import { classifyWord, CATEGORY } from "../lib/engine";
import { PAIRS, practiceable, isLatinPair } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";
import { isConfigured } from "../lib/supabase";
import { useAuth } from "../sync/auth";
import { publishList } from "../sync/share";
import { ScanModal } from "./ScanModal";
import { ListPicker } from "./ListSelector";
import { ShareModal } from "./ShareModal";
import { ReviewModal } from "./ReviewModal";
import { PasteModal } from "./PasteModal";
import { useImport } from "./importContext";

const WORTARTEN = ["Nomen", "Verb", "Adjektiv", "Zahlwort", "Adverb"];

/* ===================================================================
 * wordlist.jsx — manage vocabulary & lists (lessons), scoped to the
 * active language pair (English⇄German or Français⇄German).
 * =================================================================== */
const findKey = (obj, re) => Object.keys(obj).find((k) => re.test(k));

export function WordList() {
  const store = useStore();
  const toast = useToast();
  const auth = useAuth();
  const { openImport } = useImport();
  const { vocab, stats, lists, settings } = store;
  const pair = settings.pair;
  const P = PAIRS[pair] || PAIRS["en-de"];
  const foreign = P.foreign;
  const isLat = isLatinPair(pair);
  // display string for the foreign column (Latin = grundform headword)
  const fgnOf = (w) => isLat ? latinHeadword(w) : (w[foreign] || "");

  const [activeList, setActiveList] = useState("__all");   // '__all' | listId
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ fgn: "", de: "", topic: "", lists: [], lernform: "", wortart: "Nomen" });
  const [adding, setAdding] = useState({ fgn: "", de: "", topic: "", listId: "", lernform: "", wortart: "Nomen" });
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [editingListId, setEditingListId] = useState(null);
  const [listName, setListName] = useState("");
  const [shareToken, setShareToken] = useState(null);
  const [shareName, setShareName] = useState("");
  const [reviewRows, setReviewRows] = useState(null);   // P5: shared review screen
  const [pasteOpen, setPasteOpen] = useState(false);
  const fileRef = useRef(null);
  const canShare = isConfigured && !!auth.user;

  const pairLists = useMemo(() => lists.filter((l) => l.pair === pair), [lists, pair]);
  const pairVocab = useMemo(() => vocab.filter((w) => w.pair === pair), [vocab, pair]);

  useEffect(() => { setActiveList("__all"); }, [pair]);
  useEffect(() => {
    setAdding((a) => ({ ...a, listId: (activeList !== "__all" ? activeList : (pairLists[0] && pairLists[0].id)) || "" }));
  }, [activeList, pairLists]);
  useEffect(() => { if (activeList !== "__all" && !lists.some((l) => l.id === activeList)) setActiveList("__all"); }, [lists, activeList]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return pairVocab.filter((w) =>
      (activeList === "__all" || (w.lists || []).includes(activeList)) &&
      (!q || fgnOf(w).toLowerCase().includes(q) || (w.lernform || "").toLowerCase().includes(q) || (w.de || "").toLowerCase().includes(q)));
  }, [pairVocab, query, activeList, foreign, isLat]);

  const listNameOf = (id) => { const l = lists.find((x) => x.id === id); return l ? l.name : ""; };

  /* ---- add a word (auto-complete the missing side) ---- */
  const addWord = useCallback(async () => {
    const topic = adding.topic.trim() || "Custom", listId = adding.listId;
    if (isLat) {
      // Latin: no auto-translation; store the learning forms directly.
      const grundform = adding.fgn.trim();
      const lernform = adding.lernform.trim();
      const de = adding.de.trim();
      if (!grundform && !lernform && !de) return;
      store.addWord({ grundform, lernform, wortart: adding.wortart, de, topic, pair, lists: listId ? [listId] : [] });
      setAdding((a) => ({ ...a, fgn: "", de: "", topic: "", lernform: "" }));
      return;
    }
    let fgn = adding.fgn.trim(), de = adding.de.trim();
    if (!fgn && !de) return;
    let review = false;
    if (fgn && !de) {
      setBusy(true);
      const r = await translateWord(fgn, foreign, "de"); de = r.text; review = true;
      toast(r.source === "none" ? "Couldn't translate — please fill it in" : `Auto-filled “${de}” — please review`, r.source === "none" ? "x" : "sparkle");
      setBusy(false);
    } else if (de && !fgn) {
      setBusy(true);
      const r = await translateWord(de, "de", foreign); fgn = r.text; review = true;
      toast(r.source === "none" ? "Couldn't translate — please fill it in" : `Auto-filled “${fgn}” — please review`, r.source === "none" ? "x" : "sparkle");
      setBusy(false);
    }
    store.addWord({ [foreign]: fgn, de, topic, review, pair, lists: listId ? [listId] : [] });
    setAdding((a) => ({ ...a, fgn: "", de: "", topic: "" }));
  }, [adding, store, toast, foreign, pair, isLat]);

  const startEdit = (w) => { setEditingId(w.id); setDraft({ fgn: isLat ? (w.grundform || "") : (w[foreign] || ""), de: w.de, topic: w.topic || "", lists: w.lists || [], lernform: w.lernform || "", wortart: w.wortart || "Nomen" }); };
  const saveEdit = (id) => {
    const patch = isLat
      ? { grundform: draft.fgn.trim(), lernform: draft.lernform.trim(), wortart: draft.wortart, de: draft.de.trim(), topic: draft.topic.trim(), lists: draft.lists, review: false }
      : { [foreign]: draft.fgn.trim(), de: draft.de.trim(), topic: draft.topic.trim(), lists: draft.lists, review: false };
    store.updateWord(id, patch); setEditingId(null);
  };
  const toggleDraftList = (lid) => setDraft((d) => ({ ...d, lists: d.lists.includes(lid) ? d.lists.filter((x) => x !== lid) : [...d.lists, lid] }));

  /* ---- list management ---- */
  const newList = () => { const id = store.addList("Lesson " + (pairLists.length + 1), pair); setActiveList(id); setEditingListId(id); setListName("Lesson " + (pairLists.length + 1)); };
  const commitRename = () => { if (editingListId) store.renameList(editingListId, listName.trim() || "Untitled"); setEditingListId(null); };
  const deleteActiveList = () => {
    const l = lists.find((x) => x.id === activeList); if (!l) return;
    if (confirm(`Delete the list “${l.name}”? The words stay in your collection but leave this list.`)) { store.deleteList(activeList); setActiveList("__all"); toast("List deleted", "trash"); }
  };

  /* ---- share the active list (copy-on-import snapshot) ---- */
  const shareActiveList = async () => {
    const l = lists.find((x) => x.id === activeList); if (!l) return;
    const members = pairVocab.filter((w) => (w.lists || []).includes(activeList));
    if (!members.length) { toast("Diese Liste hat noch keine Wörter", "x"); return; }
    const words = members.map((w) => isLat
      ? { grundform: w.grundform || "", lernform: w.lernform || "", wortart: w.wortart || "", de: w.de || "", topic: w.topic || "" }
      : { [foreign]: w[foreign] || "", de: w.de || "", topic: w.topic || "" });
    try {
      const token = await publishList({ name: l.name, pair, words });
      setShareName(l.name); setShareToken(token);
    } catch (e) { toast("Teilen fehlgeschlagen — bist du angemeldet?", "x"); }
  };

  /* ---- commit an import / scan into a chosen list ---- */
  const commitImport = useCallback(async (pairs, listId, name) => {
    setBusy(true);
    let filled = 0;
    const result = [];
    if (isLat) {
      // Latin: dedup on grundform|de, no auto-translation.
      for (const r of pairs) {
        const grundform = (r.grundform || r.fgn || "").trim();
        const lernform = (r.lernform || "").trim();
        const wortart = (r.wortart || "").trim();
        const de = (r.de || "").trim();
        const topic = (r.topic || "").trim() || "Imported";
        if (grundform || lernform || de) result.push({ grundform, lernform, wortart, de, topic, review: false, pair, lists: [listId] });
      }
      const key = (w) => ((w.grundform || "") + "|" + (w.de || "")).toLowerCase();
      const existing = new Set(pairVocab.map(key));
      const fresh = result.filter((w) => !existing.has(key(w)));
      store.addWords(fresh);
      setActiveList(listId);
      setBusy(false);
      toast(`Added ${fresh.length} word${fresh.length === 1 ? "" : "s"} to “${name}”`, "check");
      return;
    }
    for (const r of pairs) {
      let fgn = (r.fgn || "").trim(), de = (r.de || "").trim();
      const topic = (r.topic || "").trim() || "Imported"; let review = false;
      if (fgn && !de) { const tr = await translateWord(fgn, foreign, "de"); de = tr.text; review = true; if (tr.text) filled++; }
      else if (de && !fgn) { const tr = await translateWord(de, "de", foreign); fgn = tr.text; review = true; if (tr.text) filled++; }
      if (fgn || de) result.push({ [foreign]: fgn, de, topic, review, pair, lists: [listId] });
    }
    const existing = new Set(pairVocab.map((w) => ((w[foreign] || "") + "|" + w.de).toLowerCase()));
    const fresh = result.filter((w) => !existing.has(((w[foreign] || "") + "|" + w.de).toLowerCase()));
    store.addWords(fresh);
    setActiveList(listId);
    setBusy(false);
    toast(`Added ${fresh.length} word${fresh.length === 1 ? "" : "s"}${filled ? ` · ${filled} auto-filled` : ""} to “${name}”`, "check");
  }, [pairVocab, store, toast, foreign, pair, isLat]);

  /* ---- excel ---- */
  const onImportFile = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const parsed = [];
      for (const row of rows) {
        const deK = findKey(row, /germ|deut|^de$/i);
        const tpK = findKey(row, /top|thema|categ|subject|sujet/i);
        if (isLat) {
          // Latin schema: Grundform | Lernform | Wortart | Deutsch | Topic
          const gfK = findKey(row, /grundform|grund|^la$|latein|lat/i);
          const lfK = findKey(row, /lernform|stammform|formen/i);
          const waK = findKey(row, /wortart|wort.?art|^art$|pos/i);
          const grundform = (gfK ? String(row[gfK]) : "").trim();
          const lernform = (lfK ? String(row[lfK]) : "").trim();
          const wortart = (waK ? String(row[waK]) : "").trim();
          const de = (deK ? String(row[deK]) : "").trim();
          const topic = (tpK ? String(row[tpK]) : "").trim();
          if (grundform || lernform || de) parsed.push({ grundform, lernform, wortart, de, topic });
          continue;
        }
        const fgnK = findKey(row, /eng|fran|fren|^fr$|^en$/i) || Object.keys(row).find((k) => k !== deK && k !== tpK);
        const fgn = (fgnK ? String(row[fgnK]) : "").trim();
        const de = (deK ? String(row[deK]) : "").trim();
        const topic = (tpK ? String(row[tpK]) : "").trim();
        if (fgn || de) parsed.push({ fgn, de, topic });
      }
      setBusy(false);
      if (!parsed.length) { toast("No words found in that file", "x"); return; }
      setReviewRows(parsed);          // P5: review before import
    } catch (e) { setBusy(false); toast("Couldn't read that file", "x"); }
  }, [toast, isLat]);

  const exampleRows = isLat
    ? [["canis", "canis, canis, m.", "Nomen", "der Hund", "Tiere"], ["video", "video, videre, vidi, visum", "Verb", "sehen", "Verben"], ["ruber", "ruber, rubra, rubrum", "Adjektiv", "rot", "Farben"]]
    : pair === "fr-de"
    ? [["le chien", "der Hund", "Animaux"], ["rouge", "", "Couleurs"], ["", "das Buch", "École"]]
    : [["dog", "der Hund", "Animals"], ["red", "", "Colours"], ["", "das Buch", "School"]];
  const downloadTemplate = () => {
    const head = isLat ? ["Grundform", "Lernform", "Wortart", "Deutsch", "Topic"] : [P.foreignLabel, "Deutsch", "Topic"];
    const ws = XLSX.utils.aoa_to_sheet([head, ...exampleRows]);
    ws["!cols"] = isLat ? [{ wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 14 }] : [{ wch: 18 }, { wch: 20 }, { wch: 14 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Vocabulary"); XLSX.writeFile(wb, "vocabulary-template.xlsx");
    toast("Template downloaded — fill it and import", "download");
  };
  const exportList = () => {
    const src = activeList === "__all" ? pairVocab : filtered;
    if (isLat) {
      const ws = XLSX.utils.aoa_to_sheet([["Grundform", "Lernform", "Wortart", "Deutsch", "Topic"], ...src.map((w) => [w.grundform || "", w.lernform || "", w.wortart || "", w.de, w.topic || ""])]);
      ws["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 14 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Vocabulary"); XLSX.writeFile(wb, "my-vocabulary.xlsx");
      toast("Exported your word list", "download");
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet([[P.foreignLabel, "Deutsch", "Topic"], ...src.map((w) => [w[foreign] || "", w.de, w.topic || ""])]);
    ws["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 14 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Vocabulary"); XLSX.writeFile(wb, "my-vocabulary.xlsx");
    toast("Exported your word list", "download");
  };

  const catBadge = (w) => {
    if (!practiceable(w)) return <span className="badge red"><span className="dot" />Needs translation</span>;
    const c = CATEGORY[classifyWord(stats[w.id], settings.masteryCorrect)];
    return <span className={"badge " + c.tone}><span className="dot" />{c.label}</span>;
  };

  return (
    <div>
      {/* list bar */}
      <div className="listbar">
        <button className={"ltab" + (activeList === "__all" ? " on" : "")} onClick={() => setActiveList("__all")}>
          All words <span className="ltab-n">{pairVocab.length}</span>
        </button>
        {pairLists.map((l) => (
          <button key={l.id} className={"ltab" + (activeList === l.id ? " on" : "")} onClick={() => setActiveList(l.id)}>
            {l.name} <span className="ltab-n">{pairVocab.filter((w) => (w.lists || []).includes(l.id)).length}</span>
          </button>
        ))}
        <button className="ltab ltab-new" onClick={newList}><Icon name="plus" size={14} /> New list</button>
      </div>

      {/* active list header */}
      {activeList !== "__all" && (
        <div className="listhead">
          {editingListId === activeList ? (
            <input className="mini-input" style={{ maxWidth: 260, fontFamily: "var(--serif)", fontSize: 18 }} autoFocus
              value={listName} onChange={(e) => setListName(e.target.value)} onBlur={commitRename}
              onKeyDown={(e) => e.key === "Enter" && commitRename()} />
          ) : (
            <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {listNameOf(activeList)}
              <button className="icon-btn" style={{ width: 30, height: 30 }} title="Rename"
                onClick={() => { setEditingListId(activeList); setListName(listNameOf(activeList)); }}><Icon name="edit" size={14} /></button>
            </div>
          )}
          <div className="grow" />
          {canShare && <button className="btn btn-ghost btn-sm" onClick={shareActiveList}><Icon name="upload" size={14} /> Teilen</button>}
          <button className="btn btn-ghost btn-sm" onClick={deleteActiveList}><Icon name="trash" size={14} /> Delete list</button>
        </div>
      )}

      {/* toolbar */}
      <div className="bar">
        <div className="search">
          <Icon name="search" size={17} />
          <input className="field" placeholder="Search words…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className="btn btn-sm btn-amber" onClick={() => setScanOpen(true)}><Icon name="camera" size={15} /> Scan photo</button>
        <button className="btn btn-sm" onClick={() => setPasteOpen(true)}><Icon name="list" size={15} /> Einfügen</button>
        <button className="btn btn-sm" onClick={() => fileRef.current.click()} disabled={busy}><Icon name="upload" size={15} /> Import</button>
        <button className="btn btn-sm" onClick={downloadTemplate}><Icon name="download" size={15} /> Template</button>
        <button className="btn btn-sm" onClick={exportList}><Icon name="download" size={15} /> Export</button>
        {isConfigured && <button className="btn btn-sm" onClick={() => openImport()}><Icon name="download" size={15} /> Liste importieren</button>}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
          onChange={(e) => { onImportFile(e.target.files[0]); e.target.value = ""; }} />
      </div>

      {/* add row */}
      <div className="panel" style={{ padding: 14, marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          {isLat ? (
            <>
              <input className="field" style={{ width: 130 }} placeholder="Grundform" value={adding.fgn}
                onChange={(e) => setAdding({ ...adding, fgn: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addWord()} />
              <input className="field grow" style={{ minWidth: 180 }} placeholder="Lernform (z. B. canis, canis, m.)" value={adding.lernform}
                onChange={(e) => setAdding({ ...adding, lernform: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addWord()} />
              <select className="field" style={{ width: "auto", minWidth: 110 }} value={adding.wortart} onChange={(e) => setAdding({ ...adding, wortart: e.target.value })}>
                {WORTARTEN.map((wa) => <option key={wa} value={wa}>{wa}</option>)}
              </select>
              <input className="field grow" style={{ minWidth: 130 }} placeholder="Deutsch (der/die/das)" value={adding.de}
                onChange={(e) => setAdding({ ...adding, de: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addWord()} />
            </>
          ) : (
            <>
              <input className="field grow" style={{ minWidth: 140 }} placeholder={`${P.foreignLabel} word`} value={adding.fgn}
                onChange={(e) => setAdding({ ...adding, fgn: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addWord()} />
              <Icon name="arrowRight" size={18} style={{ color: "var(--ink-faint)" }} />
              <input className="field grow" style={{ minWidth: 140 }} placeholder="Deutsch (der/die/das)" value={adding.de}
                onChange={(e) => setAdding({ ...adding, de: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addWord()} />
            </>
          )}
          <input className="field" style={{ width: 110 }} placeholder="Topic" value={adding.topic}
            onChange={(e) => setAdding({ ...adding, topic: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addWord()} />
          <select className="field" style={{ width: "auto", minWidth: 120 }} value={adding.listId} onChange={(e) => setAdding({ ...adding, listId: e.target.value })}>
            {pairLists.length === 0 && <option value="">— new list on add —</option>}
            {pairLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addWord} disabled={busy || (!adding.fgn.trim() && !adding.de.trim() && !adding.lernform.trim())}>
            {busy ? <Icon name="refresh" size={15} /> : <Icon name="plus" size={15} />} Add
          </button>
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 9, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="sparkle" size={13} /> {isLat ? "Latein: Grundform + volle Lernform (Stammformen) + Wortart eingeben." : "Fill in just one language — the app translates the other and flags it for your review."}
        </div>
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className="muted" style={{ fontSize: 13.5 }}><b style={{ color: "var(--ink)" }}>{filtered.length}</b> word{filtered.length === 1 ? "" : "s"}{activeList !== "__all" ? ` in “${listNameOf(activeList)}”` : ""}</span>
      </div>

      {/* table */}
      <div className="table-wrap">
        <table className="vt">
          <thead>
            <tr>
              <th style={{ width: "24%" }}>{P.foreignLabel}</th>
              <th style={{ width: "24%" }}>Deutsch</th>
              <th style={{ width: "22%" }}>Lists</th>
              <th style={{ width: "18%" }}>Status</th>
              <th style={{ width: "12%" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => editingId === w.id ? (
              <tr key={w.id}>
                <td>
                  <input className="mini-input" placeholder={isLat ? "Grundform" : undefined} value={draft.fgn} onChange={(e) => setDraft({ ...draft, fgn: e.target.value })} />
                  {isLat && (
                    <>
                      <input className="mini-input" style={{ marginTop: 6 }} placeholder="Lernform" value={draft.lernform} onChange={(e) => setDraft({ ...draft, lernform: e.target.value })} />
                      <select className="mini-input" style={{ marginTop: 6 }} value={draft.wortart} onChange={(e) => setDraft({ ...draft, wortart: e.target.value })}>
                        {WORTARTEN.map((wa) => <option key={wa} value={wa}>{wa}</option>)}
                      </select>
                    </>
                  )}
                </td>
                <td><input className="mini-input" value={draft.de} onChange={(e) => setDraft({ ...draft, de: e.target.value })} /></td>
                <td colSpan={2}>
                  <div className="chk-wrap">
                    {pairLists.map((l) => (
                      <label key={l.id} className={"chk" + (draft.lists.includes(l.id) ? " on" : "")} onClick={() => toggleDraftList(l.id)}>
                        {draft.lists.includes(l.id) && <Icon name="check" size={12} />}{l.name}
                      </label>
                    ))}
                  </div>
                  <input className="mini-input" style={{ marginTop: 8, maxWidth: 160 }} placeholder="Topic" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
                </td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(w.id)}><Icon name="check" size={14} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={w.id}>
                <td className="cell-en">{fgnOf(w) || <span className="faint">—</span>}
                  {isLat && w.lernform && <div className="faint" style={{ fontSize: 12, fontStyle: "italic" }}>{w.lernform}</div>}
                  {(w.topic || (isLat && w.wortart)) && <div className="faint" style={{ fontSize: 11.5 }}>{[isLat ? w.wortart : null, w.topic].filter(Boolean).join(" · ")}</div>}
                  {w.review && <span className="badge amber" style={{ marginTop: 4 }}><span className="dot" />Review</span>}
                </td>
                <td className="cell-de">{w.de || <span className="faint">—</span>}</td>
                <td>
                  <div className="list-chips">
                    {(w.lists || []).length ? (w.lists || []).map((lid) => <span key={lid} className="mini-chip">{listNameOf(lid)}</span>) : <span className="faint">—</span>}
                  </div>
                </td>
                <td>{catBadge(w)}</td>
                <td>
                  <div className="row-actions">
                    <button className="icon-btn" style={{ width: 32, height: 32 }} title="Hear" onClick={() => speak(w.de, "de")}><Icon name="volume" size={15} /></button>
                    <button className="icon-btn" style={{ width: 32, height: 32 }} title="Edit" onClick={() => startEdit(w)}><Icon name="edit" size={15} /></button>
                    <button className="icon-btn" style={{ width: 32, height: 32 }} title="Delete" onClick={() => store.deleteWord(w.id)}><Icon name="trash" size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="empty"><div className="big">No words here yet</div><div>Add one above, scan a photo, or import a file.</div></div>}
      </div>

      <ScanModal open={scanOpen} pair={pair} onClose={() => setScanOpen(false)}
        onImport={(pairs) => { setScanOpen(false); setReviewRows(pairs); }} />
      <PasteModal open={pasteOpen} pair={pair} onClose={() => setPasteOpen(false)}
        onParsed={(rows) => { setPasteOpen(false); setReviewRows(rows); }} />
      <ReviewModal open={!!reviewRows} rows={reviewRows} pair={pair}
        onClose={() => setReviewRows(null)}
        onConfirm={(rows) => { setReviewRows(null); setPendingImport(rows); }} />
      <ListPicker open={!!pendingImport} pair={pair} title="In welche Liste?"
        subtitle={pendingImport ? `${pendingImport.length} Wort${pendingImport.length === 1 ? "" : "er"} bereit zum Import` : ""}
        onClose={() => setPendingImport(null)}
        onPick={(id, name) => { const p = pendingImport; setPendingImport(null); commitImport(p, id, name); }} />
      <ShareModal open={!!shareToken} token={shareToken} listName={shareName} onClose={() => setShareToken(null)} />
    </div>
  );
}
