/* Paste / clipboard quick-add (Phase 5). Parses pasted text into rows and
 * hands them to the shared ReviewModal. Includes a pair-aware "AI prompt"
 * the user can paste into their own chat to get a correctly-formatted list. */
import { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { useToast } from "../ui/Toast";
import { PAIRS, isLatinPair } from "../lib/pairs";

/* EN/FR line splitter: columns Fremd | Deutsch | Topic. Same delimiters as the
 * scan heuristic (tab / : | – — - / 2+ spaces), but topic-aware (3rd column). */
function splitForeign(text: string) {
  const out: any[] = [];
  (text || "").split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s.length < 2) return;
    if (/^(unit|lesson|lektion|page|seite|vokabel|words?|english|fran|deutsch|german)\b/i.test(s) && !/[-–—:|\t]/.test(s)) return;
    const p = s.split(/\s*[\t:|–—-]\s*|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    if (p.length >= 3) out.push({ fgn: p[0], de: p[1], topic: p.slice(2).join(" ") });
    else if (p.length === 2) out.push({ fgn: p[0], de: p[1] });
    else out.push({ fgn: p[0], de: "" });
  });
  return out;
}

/* Latin line splitter: columns Grundform | Lernform | Wortart | Deutsch | Topic.
 * Splits on tab / pipe / 2+ spaces — NOT comma, so "canis, canis, m." survives. */
function splitLatin(text: string) {
  const out: any[] = [];
  (text || "").split(/\r?\n/).forEach((line) => {
    const s = line.trim();
    if (!s || s.length < 2) return;
    if (/^(unit|lektion|lesson|seite|page|wort|latein|deutsch|grundform)\b/i.test(s) && !/[\t|]/.test(s)) return;
    const p = s.split(/\s*[\t|]\s*|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    if (p.length >= 5) out.push({ grundform: p[0], lernform: p[1], wortart: p[2], de: p[3], topic: p[4] });
    else if (p.length === 4) out.push({ grundform: p[0], lernform: p[1], wortart: p[2], de: p[3] });
    else if (p.length === 3) out.push({ grundform: p[0], lernform: p[1], de: p[2] });
    else if (p.length === 2) out.push({ grundform: p[0], de: p[1] });
    else out.push({ grundform: p[0] });
  });
  return out;
}

function rawLines(text: string, isLat: boolean) {
  return (text || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 2)
    .map((l) => isLat ? { grundform: l } : { fgn: l });
}

export function PasteModal({ open, pair, onParsed, onClose, initialText, draftHint }: { open: boolean; pair: string; onParsed: (rows: any[]) => void; onClose: () => void; initialText?: string; draftHint?: boolean }) {
  const toast = useToast();
  const isLat = isLatinPair(pair);
  const P = PAIRS[pair] || PAIRS["en-de"];
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (open) { setText(initialText || ""); setCopied(false); } }, [open, initialText]);
  if (!open) return null;

  const aiPrompt = isLat
    ? `Erstelle eine lateinische Vokabelliste zum Thema „…". Gib NUR eine Tabelle aus, Spalten getrennt durch | , eine Zeile pro Wort, in genau dieser Reihenfolge:\nGrundform | Lernform | Wortart | Deutsch | Topic\nLernform = Stammformen (Nomen: Nominativ, Genitiv, Genus; Verb: 4 Stammformen; Adjektiv: 3 Genus-Endungen). Wortart ∈ {Nomen, Verb, Adjektiv, Zahlwort, Adverb}. Deutsche Nomen mit Artikel (der/die/das). Keine Nummerierung, keine Überschrift, kein weiterer Text.`
    : `Erstelle eine Vokabelliste ${P.foreignLabel} ⇄ Deutsch zum Thema „…". Gib NUR eine Tabelle aus, Spalten getrennt durch | , eine Zeile pro Wort, in genau dieser Reihenfolge:\n${P.foreignLabel} | Deutsch | Topic\nDeutsche Nomen mit Artikel (der/die/das). Keine Nummerierung, keine Überschrift, kein weiterer Text.`;

  const copyPrompt = () => navigator.clipboard?.writeText(aiPrompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  const pasteClipboard = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setText(t); else toast("Zwischenablage ist leer", "x"); }
    catch { toast("Kein Zugriff auf die Zwischenablage — bitte manuell einfügen", "x"); }
  };

  const proceed = () => {
    if (!text.trim()) return;
    let rows = isLat ? splitLatin(text) : splitForeign(text);
    if (!rows.length) rows = rawLines(text, isLat); // never crash / never empty
    onParsed(rows);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: "94vw" }}>
        <div className="modal-head">
          <div className="modal-title">Einfügen <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>· {P.foreignLabel} ⇄ Deutsch</span></div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {draftHint && (
          <div className="tips-intro" style={{ marginBottom: 10, background: "var(--amber-bg)", color: "var(--amber-deep)" }}>
            <Icon name="camera" size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Foto-Text erkannt — <b>grober Entwurf</b>, bitte korrigieren. Tipp: „KI-Prompt kopieren", in dein KI-Chat geben, das Ergebnis hier wieder einfügen — dann „Weiter zum Prüfen".
          </div>
        )}
        <div className="tips-intro" style={{ marginBottom: 12 }}>
          Füge eine Wortliste ein — eine Zeile pro Wort, Spalten getrennt durch Tab, „|", „–" oder „:".
          {isLat ? " Latein: Grundform | Lernform | Wortart | Deutsch | Topic." : ` ${P.foreignLabel} | Deutsch | Topic.`}
        </div>

        <textarea className="field" style={{ minHeight: 150, resize: "vertical", fontFamily: "var(--mono)", fontSize: 13.5 }}
          placeholder={isLat ? "canis | canis, canis, m. | Nomen | der Hund | Tiere" : "dog | der Hund | Animals\ncat | die Katze | Animals"}
          value={text} onChange={(e) => setText(e.target.value)} />

        <div className="toolbelt" style={{ justifyContent: "flex-start", marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={pasteClipboard}><Icon name="download" size={14} /> Aus Zwischenablage</button>
          <button className="btn btn-ghost btn-sm" onClick={copyPrompt}><Icon name={copied ? "check" : "sparkle"} size={14} /> {copied ? "Prompt kopiert" : "KI-Prompt kopieren"}</button>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={proceed}><Icon name="arrowRight" size={15} /> Weiter zum Prüfen</button>
        </div>
      </div>
    </div>
  );
}
