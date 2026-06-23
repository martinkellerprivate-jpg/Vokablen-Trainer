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
        <p><b>Auswahl:</b> oben wählst du <b>Lektionen</b>, <b>Listen</b> oder (ausklappbar) <b>Themen</b> — oder einen Schnellzugriff (<b>Heute dran</b>, <b>Fällige</b>, <b>Wackeln noch</b>, <b>Bald fällig</b>). <b>Heute dran</b> ist der empfohlene Startpunkt: die App stellt jeden Tag frisch zusammen, was heute am wichtigsten ist. Über den Knopf <b>7-Tage-Ausblick</b> siehst du, wie viel an den nächsten Tagen ansteht.</p>
        <p>Auf der Karte zeigen die <b>Punkte oben</b> („Beherrschung je Wort“) für jedes Wort der Auswahl eine Farbe (siehe Stufen unten), der <b>Balken unten</b> fasst zusammen, wie viele schon <b>sitzen</b>. Mit dem <b>Vergrössern-Symbol</b> oben rechts gehst du in den Fokus-Modus — Verlassen mit dem Schliessen-Symbol, <b>Esc</b> oder Tippen daneben.</p>
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
        <p>Oben im Kopf siehst du dein <b>Tagesziel</b>. Die <b>Tage in Folge</b> (deine Serie) findest du im <b>Statistik</b>-Tab.</p>
        <p>Die Statistik zeigt eine <b>Verteilungslinie</b>, wie deine Wörter sitzen, plus optionale Fokus-Listen („Worauf du dich konzentrieren kannst“). In der Wort-Tabelle steht je Wort die <b>Stufe</b>, ein <b>Hält-Kreis</b> (voll ≈ ein Monat) und deine Trefferquote. <b>Tippe eine Zeile</b> an für das Detail-Popup mit allen Gedächtnis-Werten des Worts.</p>
        <p><b>Die fünf Stufen:</b> <b>neu / frisch</b> (blau, gerade gelernt) · <b>wackelt noch</b> (rot, kommt bald zurück) · <b>sitzt fast</b> (orange) · <b>sitzt</b> (grün, hält lange) · <b>noch nicht geübt</b> (grau). Zusätzlich <b>hartnäckig</b>: oft vergessen trotz Übung — da hilft eine Eselsbrücke.</p>
      </>
    ),
  },
  {
    title: "7. Aussehen & Einstellungen",
    body: (
      <>
        <p>Unter <b>Einstellungen</b>: Skin (Papier / Dunkel / Frisch), Kartenstil und Kartenschrift, Tagesziel und wie oft <b>Lerntipps</b> erscheinen.</p>
        <p>Ganz unten gibt es <b>„Erweiterte Einstellungen“</b> (eingeklappt, optional): Lerntempo und alle Schwellen mit Erklärung und „Auf Standard“-Knopf, dazu die <b>Auto-Anpassung</b> (sammelt einen Lern-Verlauf für eine spätere Feinjustierung; standardmässig aus) und ein <b>FSRS-Werte</b>-Fenster zum Nachsehen. Für normales Lernen brauchst du nichts davon.</p>
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
  {
    title: "9. Wie die App dir hilft zu behalten",
    body: (
      <>
        <p>Du musst nichts davon einstellen — die App macht das automatisch. Drei Prinzipien, die nachweislich am besten beim Behalten helfen:</p>
        <ul>
          <li><b>Verteilt statt auf einmal (Timing):</b> Ein Wort kommt nicht am Stück, sondern über mehrere Tage verteilt zurück — möglichst kurz bevor du es vergisst. Der Schnellzugriff <b>„Fällige Wörter"</b> sammelt genau das, was heute dran ist. Kurze tägliche Einheiten schlagen einen langen Block am Wochenende.</li>
          <li><b>Schwieriges öfter:</b> Wörter, die du falsch hattest oder nur zögerlich beantwortest, bringt die App häufiger zurück; sichere Wörter seltener. <b>„Schwierige Wörter"</b> bündelt deine Wackelkandidaten zum gezielten Üben.</li>
          <li><b>Mischen (Interleaving):</b> Innerhalb einer Übung werden Wörter und Themen gemischt statt blockweise abgefragt. Das fühlt sich etwas schwerer an, festigt aber spürbar besser.</li>
        </ul>
        <p>Dazu der wichtigste Hebel, den <i>du</i> in der Hand hast: <b>erst selbst abrufen, dann nachsehen</b>. Genau dieses Anstrengen beim Erinnern (Modus <b>Type</b> oder <b>Recall</b>) verankert ein Wort fester als blosses Wiederlesen.</p>
      </>
    ),
  },
  {
    title: "10. Das Gedächtnis-Modell (FSRS) — kurz erklärt",
    body: (
      <>
        <p>Im Hintergrund rechnet die App mit einem bewährten Gedächtnis-Modell namens <b>FSRS</b>. Du musst es nicht verstehen — aber falls dich interessiert, <i>warum</i> ein Wort wann zurückkommt:</p>
        <p>Stell dir vor, jedes gelernte Wort verblasst langsam wie Schrift, die in der Sonne ausbleicht — das ist die <b>Vergessenskurve</b>. Jede richtige Wiederholung „malt es nach“, und danach hält es <b>länger</b> als vorher. Das Modell schätzt für jedes Wort drei Dinge:</p>
        <ul>
          <li><b>Wie lange es hält</b> (Stabilität): die Zahl im <b>Hält-Kreis</b> — z. B. „hält ~14 Tage“. Je öfter richtig, desto grösser.</li>
          <li><b>Wie zäh es ist</b> (Schwierigkeit): manche Wörter sind einfach störrisch — die werden bei Bedarf <b>hartnäckig</b> markiert.</li>
          <li><b>Wie sicher du es jetzt noch abrufen kannst</b> — sinkt das unter dein Ziel, wird das Wort <b>fällig</b> und kommt zurück.</li>
        </ul>
        <p>Daraus ergeben sich die <b>fünf Farben/Stufen</b> (Abschnitt 6), die <b>Fälligen</b>, der <b>7-Tage-Ausblick</b>, <b>Heute dran</b>, der <b>Hält-Kreis</b> und das <b>Wort-Popup</b>. Wer ganz genau hinschauen will, findet die Modell-Werte unter <b>Einstellungen → Erweitert → FSRS-Werte</b>.</p>
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
