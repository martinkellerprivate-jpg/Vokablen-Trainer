/* Import a shared list by code or link → own copy (copy-on-import). */
import { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { PAIRS, fk, isLatinPair } from "../lib/pairs";
import { fetchShared, parseCode, type SharePayload } from "../sync/share";

export function ImportShareModal({ open, initialToken, onClose }: { open: boolean; initialToken: string | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPayload(null); setError(""); setCode(initialToken || "");
      if (initialToken) load(initialToken);
    }
  }, [open, initialToken]);

  if (!open) return null;

  async function load(raw: string) {
    setBusy(true); setError(""); setPayload(null);
    try {
      const p = await fetchShared(parseCode(raw));
      if (!p || !p.words) setError("Liste nicht gefunden — Code prüfen.");
      else setPayload(p);
    } catch (e: any) {
      setError(e?.message === "not-configured" ? "Sharing ist nicht verfügbar." : "Konnte die Liste nicht laden.");
    }
    setBusy(false);
  }

  function doImport() {
    if (!payload) return;
    const pair = payload.pair;
    if (store.settings.pair !== pair) store.setSettings({ pair, selectedLists: [], statLists: [] });
    const listId = store.addList(payload.name || "Geteilte Liste", pair);
    const isLat = isLatinPair(pair);
    const key = (w: any) => (isLat ? ((w.grundform || "") + "|" + (w.de || "")) : ((w[fk(pair)] || "") + "|" + (w.de || ""))).toLowerCase();
    const existing = new Set(store.vocab.filter((w: any) => w.pair === pair).map(key));
    const fresh = payload.words
      .filter((w) => !existing.has(key(w)))
      .map((w) => ({ ...w, pair, lists: [listId], review: false, source: "import" }));
    store.addWords(fresh);
    toast(`„${payload.name}" importiert · ${fresh.length} Wort${fresh.length === 1 ? "" : "er"}`, "check");
    onClose();
  }

  const pairLabel = payload ? (PAIRS[payload.pair]?.foreignLabel + " ⇄ Deutsch") : "";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <div className="modal-title">Liste importieren</div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="field" placeholder="Code (VT-…) oder Link einfügen" value={code}
              onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(code)} />
            <button className="btn" onClick={() => load(code)} disabled={busy || !code.trim()}>
              {busy ? <Icon name="refresh" size={15} /> : <Icon name="search" size={15} />}
            </button>
          </div>
          {error && <div className="badge red" style={{ alignSelf: "flex-start" }}><span className="dot" />{error}</div>}

          {payload && (
            <div className="panel" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{payload.name}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>{pairLabel} · {payload.words.length} Wört{payload.words.length === 1 ? "" : "er"}</div>
              <div className="faint" style={{ fontSize: 12, marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                <Icon name="sparkle" size={13} /> Du bekommst eine eigene Kopie; bereits vorhandene Wörter werden übersprungen.
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={doImport} disabled={!payload}>
            <Icon name="download" size={15} /> {payload ? `${payload.words.length} Wörter importieren` : "Importieren"}
          </button>
        </div>
      </div>
    </div>
  );
}
