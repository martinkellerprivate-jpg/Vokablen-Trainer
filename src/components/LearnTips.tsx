import { useState } from "react";
import { Icon } from "../ui/Icon";

/* ===================================================================
 * tips.jsx — "Lerntipps" button + popup with research-based study
 * tips in German, aimed at a talented 13-year-old learner.
 * =================================================================== */
export const LERN_TIPPS = [
  { h: "Lieber täglich kurz als selten lang",
    b: "10–15 Minuten jeden Tag bringen mehr als eine Stunde am Wochenende. In den Pausen zwischen den Einheiten festigt dein Gehirn die Wörter ganz von selbst." },
  { h: "Erst selbst überlegen, dann umdrehen",
    b: "Tippe deine Antwort wirklich ein, bevor du die Lösung ansiehst. Genau dieses Anstrengen beim Erinnern macht ein Wort fest – nicht das bloße Anschauen." },
  { h: "Ein Wort braucht viele Begegnungen",
    b: "Fast niemand kann ein Wort nach einmal Sehen. Dass dir ein Wort über mehrere Tage immer wieder begegnet, ist normal – und genau so soll es sein." },
  { h: "Mach deine Fehler zu Freunden",
    b: "Wörter, die du falsch hattest, sind die wertvollsten. Übe gezielt die Liste „Tricky words“ – dort sammelt die App genau diese schwierigen Wörter." },
  { h: "Wenig Neues, dafür richtig",
    b: "8–12 neue Wörter pro Tag reichen völlig. Lieber wenige Wörter wirklich können als fünfzig nur halb." },
  { h: "Misch die Themen",
    b: "Übe Tiere, Farben und Verben durcheinander statt blockweise. Das fühlt sich schwerer an, trainiert dein Gedächtnis aber spürbar besser." },
  { h: "Nutze Augen und Ohren",
    b: "Hör dir das Wort mit dem Lautsprecher-Knopf an und sprich es leise mit. Je mehr Sinne mitmachen, desto besser bleibt es haften." },
  { h: "Lern das Wort im Zusammenhang",
    b: "Bau ein neues Wort in einen kleinen Satz oder ein Bild im Kopf ein. „The dog barks“ merkt man sich besser als „dog“ allein." },
  { h: "Übe in beide Richtungen",
    b: "Erst Englisch→Deutsch, dann Deutsch→Englisch. Ein Wort kannst du erst richtig, wenn es in beide Richtungen klappt." },
  { h: "Schlaf macht das Lernen fertig",
    b: "Was du abends übst, festigt sich im Schlaf. Eine kurze Wiederholung kurz vor dem Schlafengehen wirkt oft besonders gut." },
  { h: "Dranbleiben schlägt alles",
    b: "Deine Tages-Serie (die Flamme oben) zählt mehr als ein einzelner Mega-Tag. Regelmäßigkeit ist deine Superkraft." },
];

export function LearnTips() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="tipbtn" onClick={() => setOpen(true)} title="Lerntipps">
        <Icon name="hint" size={16} /> Lerntipps
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <div>
                <div className="modal-title"><Icon name="hint" size={19} style={{ verticalAlign: "-3px", marginRight: 8 }} />Lerntipps</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Die wirksamsten Methoden – wissenschaftlich belegt</div>
              </div>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setOpen(false)}><Icon name="x" size={16} /></button>
            </div>
            <div className="tips-intro">
              Hallo Lilly-Anne! Du lernst schnell – mit diesen Tricks holst du aus jeder Übungsminute das Maximum heraus.
            </div>
            <div className="tips-list">
              {LERN_TIPPS.map((t, i) => (
                <div className="tip" key={i}>
                  <div className="tip-num">{i + 1}</div>
                  <div>
                    <div className="tip-h">{t.h}</div>
                    <div className="tip-b">{t.b}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="tips-foot">
              Die Wissenschaft dahinter: <b>verteiltes Lernen</b> (Spacing), <b>aktives Abrufen</b> (Active Recall) und <b>Mischen</b> (Interleaving) gehören zu den am besten belegten Lernmethoden überhaupt. Genau darauf sind auch die Standard-Einstellungen dieser App eingestellt.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
