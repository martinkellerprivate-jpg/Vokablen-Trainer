/* V7 — Anleitung popup: a "?" button next to Lerntipps that opens an
 * accordion guide. Content adapted from Vokabeltrainer_Anleitung.md and aligned
 * to the actually-shipped UI labels (English mode names, "Hint", the smart
 * quick-access chips, the focus/zoom button). Swiss orthography (ss). */
import { useState } from "react";
import { Icon } from "../ui/Icon";

type Section = { title: string; body: JSX.Element };

const SECTIONS: Section[] = [
  {
    title: "1. In 30 Sekunden starten",
    body: (
      <>
        <p>Die App hat zwei Ebenen: <b>Wörter</b> (deine Bibliothek — hier entstehen und wohnen die Vokabeln) und <b>Lektionen</b> (das, was du tatsächlich übst).</p>
        <p>Schnellster Weg: Sprache oben wählen (English / Français / Latein ⇄ Deutsch) → <b>„Grundwortschatz aktivieren"</b> → es entsteht eine fertige Lektion → im <b>Üben</b>-Tab auswählen und loslegen.</p>
      </>
    ),
  },
  {
    title: "2. Wörter — deine Bibliothek",
    body: (
      <>
        <p><b>Merke:</b> Listen sind die <i>Quelle</i> (wo Wörter gespeichert und geordnet sind), nicht direkt das, was du übst. Geübt wird über <b>Lektionen</b> (Punkt 3). So kannst du eine grosse Liste haben und daraus gezielte Lektionen bauen.</p>
        <p>So bringst du Wörter hinein:</p>
        <ul>
          <li><b>Manuell tippen</b> — Wort + Übersetzung direkt eingeben.</li>
          <li><b>Einfügen (Text):</b> eine Wortliste als Text einfügen → es öffnet sich der <b>Überprüfen</b>-Dialog → korrigieren → speichern. Das Format ist tolerant; nicht erkannte Zeilen kannst du im Dialog von Hand nachbessern.</li>
          <li><b>CSV / Datei:</b> eine CSV oder Datei hochladen → gleicher Überprüfen-Dialog.</li>
          <li><b>Scannen (Foto):</b> eine Vokabelliste aus dem Lehrbuch abfotografieren → die Texterkennung liest sie aus → Überprüfen-Dialog.</li>
          <li><b>Grundwortschatz aktivieren:</b> mitgelieferte Starterlisten (English, Français, Latein — nach Themen geordnet) mit einem Tap hinzufügen.</li>
        </ul>
        <p className="help-callout"><b>Was bedeutet „KI-Prompt kopieren"?</b> (Das wird oft missverstanden.) Die App übersetzt oder strukturiert <b>nicht selbst</b> mit KI. Der Button kopiert dir einen <b>fertigen Prompt</b>, passend zum gewählten Sprachpaar und zum Importformat der App. Diesen Prompt fügst du in <b>dein eigenes KI-Chat</b> ein (z. B. ChatGPT oder Claude) — entweder um deine Wörter übersetzen zu lassen oder um eine Wortliste zu einem Thema generieren zu lassen, genau im Format, das die App importieren kann. Die Antwort der KI kopierst du dann <b>zurück ins Einfügen-Feld</b> → Überprüfen → speichern. Kurz: der Button ist die Brücke zu deiner KI, das Ergebnis kommt import-fertig zurück.</p>
        <p>Im <b>Überprüfen</b>-Dialog (Einfügen, CSV und Scan): Zeilen prüfen und korrigieren, deutsche Nomen mit Artikel (der/die/das), dann speichern. Beim Abfragen wird die Schweizer Schreibweise (ss) immer akzeptiert.</p>
      </>
    ),
  },
  {
    title: "3. Lektionen — was du übst",
    body: (
      <>
        <p>Eine <b>Lektion</b> ist die Übungseinheit. Während Listen die Bibliothek sind, ist eine Lektion eine gezielte Auswahl daraus. Im <b>Üben</b>-Tab wählst du eine Lektion und übst sie.</p>
        <p>Eine Lektion erstellst du im <b>Lektionen</b>-Tab (oder direkt aus einer Liste / einem Thema) auf drei Arten:</p>
        <ul>
          <li><b>Ganze Liste</b> als Lektion — ein Tap. Sie <b>wächst automatisch mit</b>: fügst du der Liste später Wörter hinzu, sind sie auch in der Lektion.</li>
          <li><b>Thema</b> als Lektion — z. B. nur „Tiere" oder „Farben".</li>
          <li><b>Handauswahl</b> — im <b>Wörter</b>-Tab auf „Auswählen" tippen, einzelne Wörter ankreuzen → „Neue Lektion" oder „Zu Lektion". Diese Auswahl bleibt <b>fest</b>.</li>
        </ul>
        <p>Die ersten beiden Arten sind <b>dynamisch</b> (wachsen mit), die Handauswahl ist <b>fest</b>.</p>
        <p className="help-callout"><b>Schnellzugriffe „Fällige Wörter" und „Schwierige Wörter":</b> Das sind <b>keine</b> Lektionen, sondern dauerhafte Chips oben im <b>Üben</b>-Tab. „Fällige Wörter" sammelt, was heute zur Wiederholung ansteht; „Schwierige Wörter" sammelt, womit du dich schwertust. Beide aktualisieren sich automatisch — du musst sie nicht anlegen oder pflegen.</p>
      </>
    ),
  },
  {
    title: "4. Üben",
    body: (
      <>
        <p>Lektion (oder einen Schnellzugriff) wählen → <b>Modus</b>: <b>Type</b> (Tippen) / <b>Choose</b> (Auswählen) / <b>Recall</b> (Aufdecken) / <b>Memorize</b> (Merken) → <b>Richtung</b> umschalten (z. B. Deutsch → English) → antworten, <b>„Check"</b>, bei Bedarf <b>„Hint"</b>.</p>
        <p>Der <b>Fortschrittsbalken</b> unten in der Karte zeigt, wie weit du in der Lektion bist (Wiederholungen zählen dabei nicht). Mit dem <b>Vergrössern-Symbol</b> oben rechts an der Karte gehst du in den Fokus-Modus — die Karte wird gross, der Rest tritt zurück. Verlassen mit dem Schliessen-Symbol, <b>Esc</b> oder Tippen daneben.</p>
      </>
    ),
  },
  {
    title: "5. Latein richtig erfassen",
    body: (
      <>
        <p>Latein nutzt <b>Grundform / Lernform / Wortart</b> — z. B. „puella, puellae f" oder Verben als Stammformen „video, videre, vidi, visum".</p>
        <p><b>L2 / L3 umschaltbar:</b> In <b>L2</b> zeigt die Karte die volle Lernform und fragt nur die Grundform; in <b>L3</b> fragst du die <b>volle Lernform</b> ab (Schreibweise wird grosszügig bewertet, Reihenfolge / Abstände tolerant). Latein hat keine Audio-Ausgabe — dafür gibt es keine passende Stimme.</p>
      </>
    ),
  },
  {
    title: "6. Fortschritt, Statistik & Ziel",
    body: (
      <>
        <p>Oben siehst du <b>Streak</b> (Tages-Serie) und <b>Tagesziel</b>. Der <b>Statistik</b>-Tab zeigt deinen Verlauf. Die Smart-Kategorien (Fällig, Schwierig, Neu, In Arbeit) folgen automatisch deinem Lernstand — du musst nichts manuell pflegen.</p>
      </>
    ),
  },
  {
    title: "7. Aussehen & Einstellungen",
    body: (
      <>
        <p>Unter <b>Einstellungen</b>: Skin (Papier / Dunkel / Frisch), Kartenstil und Kartenschrift, Tagesziel und wie oft <b>Lerntipps</b> erscheinen.</p>
      </>
    ),
  },
  {
    title: "8. Konto & Synchronisierung",
    body: (
      <>
        <p>Ohne Anmeldung läuft alles <b>lokal</b> auf dem Gerät. Mit Anmeldung werden deine Daten über Geräte hinweg <b>synchronisiert</b>. Unter <b>„Konto & Daten"</b> kannst du alles exportieren oder dein Konto löschen.</p>
      </>
    ),
  },
];

export function HelpGuide() {
  const [open, setOpen] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <>
      <button className="tipbtn" onClick={() => setOpen(true)} title="Anleitung" aria-label="Anleitung">
        <Icon name="help" size={16} /> Anleitung
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 660 }}>
            <div className="modal-head">
              <div>
                <div className="modal-title"><Icon name="help" size={19} style={{ verticalAlign: "-3px", marginRight: 8 }} />Anleitung</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Tippe ein Thema an, um es aufzuklappen</div>
              </div>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setOpen(false)}><Icon name="x" size={16} /></button>
            </div>
            <div className="help-acc">
              {SECTIONS.map((s, i) => {
                const expanded = openIdx === i;
                return (
                  <div className={"help-acc-item" + (expanded ? " open" : "")} key={i}>
                    <button className="help-acc-head" aria-expanded={expanded} onClick={() => setOpenIdx(expanded ? null : i)}>
                      <span>{s.title}</span>
                      <Icon name="arrowRight" size={15} style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .18s ease" }} />
                    </button>
                    {expanded && <div className="help-acc-body">{s.body}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
