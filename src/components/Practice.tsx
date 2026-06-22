import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { toneColor, pct } from "../ui/Ring";
import { speak } from "../ui/speak";
import { scoreAnswer } from "../lib/scoring";
import { weightForWord, resolveLesson, resolveSmart } from "../lib/engine";
import { PAIRS, NATIVE, practiceable, hasTTS, isLatinPair } from "../lib/pairs";
import { latinHeadword, latinReveal, latinAnswerTarget, scoreLatinForm } from "../lib/latin";
import { TipPopup } from "./TipPopup";
import { LERN_TIPPS } from "./LearnTips";

/* ===================================================================
 * practice.jsx — the flashcard trainer.
 * =================================================================== */
export function Practice() {
  const store = useStore();
  const toast = useToast();
  const { vocab, stats, settings, recordAttempt, meta, lessons } = store;
  const pair = settings.pair;
  const P = PAIRS[pair] || PAIRS["en-de"];
  const foreign = P.foreign;                       // 'en' | 'fr'
  const dir = settings.direction;                  // f2n (foreign shown) | n2f
  const mode = settings.mode;                       // type | choice
  const srcKey = dir === "f2n" ? foreign : NATIVE;
  const tgtKey = dir === "f2n" ? NATIVE : foreign;
  const srcLang = srcKey, tgtLang = tgtKey;
  const labelOf = (key) => (key === NATIVE ? P.nativeLabel : P.foreignLabel);

  // ---- Latin (L2/L3) text accessors -------------------------------
  const isLat = isLatinPair(pair);
  const latinMode = settings.latinMode || "L2";
  // text shown for a given side (prompt / reveal). For Latin the foreign
  // side is built from the learning forms, not a plain string.
  const sideText = (w, key) => key === NATIVE ? w.de : (isLat ? latinHeadword(w) : w[key]);
  // the string the answer is scored against (Latin: grundform in L2, lernform in L3)
  const scoreTarget = (w, key) => key === NATIVE ? w.de : (isLat ? latinAnswerTarget(w, latinMode) : w[key]);
  // the string revealed on the back as the solution (Latin: always full lernform)
  const revealText = (w, key) => key === NATIVE ? w.de : (isLat ? latinReveal(w) : w[key]);
  // Latin lernform context line (shown under the prompt when Latin is the prompt)
  const latinContext = (w) => (isLat && w.lernform && latinHeadword(w) !== w.lernform) ? w.lernform : "";
  const latinL3Answer = isLat && tgtKey === foreign && latinMode === "L3";

  // ---- scope (V6): a chosen lesson OR a built-in smart quick-access -------
  const SMART_ACCESS = [
    { ref: "due", label: "Fällige Wörter", icon: "target" },
    { ref: "tricky", label: "Schwierige Wörter", icon: "flame" },
  ];
  const pairLessons = useMemo(() => lessons.filter((l) => l.pair === pair), [lessons, pair]);
  const parseSel = (sel) => { const i = (sel || "").indexOf(":"); return i < 0 ? { kind: "", ref: "" } : { kind: sel.slice(0, i), ref: sel.slice(i + 1) }; };
  const rawSel = parseSel(settings.practiceSel);
  const selValid = rawSel.kind === "smart"
    ? ["due", "tricky"].includes(rawSel.ref)
    : rawSel.kind === "lesson" && pairLessons.some((l) => l.id === rawSel.ref);
  // fall back to the first lesson of this pair, else the "due" quick-access
  const effective = selValid ? rawSel : (pairLessons[0] ? { kind: "lesson", ref: pairLessons[0].id } : { kind: "smart", ref: "due" });
  const selKey = effective.kind + ":" + effective.ref;
  const pickScope = (kind, ref) => store.setSettings({ practiceSel: kind + ":" + ref });
  // live resolution of the chosen scope (for chip counts + to seed a run)
  const resolveScopeWords = () => {
    const pv = vocab.filter((w) => w.pair === pair);
    const words = effective.kind === "smart"
      ? resolveSmart(effective.ref, pv, stats, settings.masteryCorrect)
      : resolveLesson(pairLessons.find((l) => l.id === effective.ref), vocab);
    return words.filter(practiceable);
  };

  const [current, setCurrent] = useState(null);
  const [face, setFace] = useState("front");   // front | back (only one in DOM)
  const [anim, setAnim] = useState("");        // '' | out | in
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [choices, setChoices] = useState([]);
  const [picked, setPicked] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [session, setSession] = useState([]); // recent verdicts
  const [tip, setTip] = useState(null);        // current study-tip popup (Phase 6)
  const [focus, setFocus] = useState(false);   // V2: zoom / focus card mode
  const inputRef = useRef(null);
  const recentRef = useRef([]);                // recently shown ids (spacing)
  const answeredRef = useRef(0);               // scored answers this session (tip cadence)

  // ---- run snapshot (V5/V6): freeze the word set when the scope or pair
  // changes, so a dynamic/smart scope (e.g. "Fällige Wörter") doesn't shrink
  // mid-run and so the progress bar is stable. Also the single source of the
  // B1 rebuild: changing pair/scope re-freezes AND resets the session.
  const runWordsRef = useRef([]);
  const [doneIds, setDoneIds] = useState(() => new Set()); // distinct ids "done" this run (V5 progress)
  const markDone = useCallback((id) => setDoneIds((prev) => prev.has(id) ? prev : new Set(prev).add(id)), []);
  const [runId, setRunId] = useState(0);
  useEffect(() => {
    runWordsRef.current = resolveScopeWords().map((w) => w.id);
    setDoneIds(new Set());
    setRunId((n) => n + 1);
    setCurrent(null); setFace("front"); setAnim(""); setResult(null); setSession([]); setTip(null);
  }, [pair, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useMemo(() => {
    const set = new Set(runWordsRef.current);
    return vocab.filter((w) => set.has(w.id) && practiceable(w));
  }, [vocab, runId]);

  // Show a single study tip at a natural pause, every N scored cards.
  const TIP_EVERY = { off: 0, occasional: 12, frequent: 6 };
  const maybeTip = useCallback(() => {
    const every = TIP_EVERY[settings.tipsFrequency || "occasional"] || 0;
    answeredRef.current += 1;
    if (!every || answeredRef.current % every !== 0) { setTip(null); return; } // clear any lingering tip
    let idx = 0;
    try { idx = (parseInt(localStorage.getItem("vt_v1_tipidx") || "-1", 10) + 1) % LERN_TIPPS.length; } catch (e) {}
    try { localStorage.setItem("vt_v1_tipidx", String(idx)); } catch (e) {}
    setTip(LERN_TIPPS[idx]);
  }, [settings.tipsFrequency]);

  // Bulletproof flip: render a single face, animate edge-on, swap, animate back.
  const flip = useCallback((toFace, swapFn?) => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { if (swapFn) swapFn(); setFace(toFace); return; }
    setAnim("out");
    setTimeout(() => {
      if (swapFn) swapFn();
      setFace(toFace);
      setAnim("in");
      setTimeout(() => setAnim(""), 260);
    }, 200);
  }, []);

  const pickNext = useCallback((excludeId) => {
    if (!pool.length) { setCurrent(null); return; }
    const newToday = meta.newToday || 0;
    const capReached = newToday >= settings.newPerDay;
    const hasReviews = pool.some((p) => stats[p.id] && stats[p.id].seen);
    const recent = recentRef.current;
    const weights = pool.map((w) => {
      const st = stats[w.id];
      const isNewW = !st || !st.seen;
      let wt = weightForWord(st, { missWeight: settings.missWeight, masteryCorrect: settings.masteryCorrect });
      if (isNewW && capReached && hasReviews) wt = 0;            // hold new words for tomorrow
      if (recent.includes(w.id)) wt *= 0.0008;                   // spacing: avoid quick repeats
      if (w.id === excludeId && pool.length > 1) wt *= 0.02;
      return wt;
    });
    let total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) { for (let i = 0; i < weights.length; i++) weights[i] = 1; total = weights.length; }
    let r = Math.random() * total, idx = 0;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
    const w = pool[idx];
    setCurrent(w);
    recentRef.current = [w.id, ...recent].slice(0, Math.max(1, settings.spacingGap));
    setInput(""); setResult(null); setHintUsed(false); setPicked(null);
    // build multiple-choice options
    const nOpts = Math.max(2, Math.min(6, settings.choicesCount || 4));
    const others = pool.filter((o) => o.id !== w.id);
    const distractors = [];
    const bag = [...others].sort(() => Math.random() - 0.5);
    for (const o of bag) {
      if (distractors.length >= nOpts - 1) break;
      if (!distractors.some((d) => scoreTarget(d, tgtKey) === scoreTarget(o, tgtKey)) && scoreTarget(o, tgtKey) !== scoreTarget(w, tgtKey))
        distractors.push(o);
    }
    setChoices([w, ...distractors].sort(() => Math.random() - 0.5));
    setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    if (settings.autoAudio && hasTTS(srcKey)) setTimeout(() => speak(sideText(w, srcKey), srcKey), 130);
  }, [pool, stats, tgtKey, srcKey, meta.newToday, settings.newPerDay, settings.missWeight, settings.masteryCorrect, settings.spacingGap, settings.choicesCount, settings.autoAudio]);

  // First card whenever the (frozen) pool appears, or self-heal if `current`
  // became stale (e.g. an async cloud sync swapped vocab under the initial
  // pick). The freeze effect above already did the B1 reset, so Practice never
  // stays blank — on mount or on any pair/scope change.
  useEffect(() => {
    if (face === "back" || anim) return;        // never interrupt a result/flip
    if (pool.length && (!current || !pool.some((w) => w.id === current.id))) pickNext(null);
  }, [pool, current, pickNext, face, anim]);

  const finish = useCallback((res) => {
    const st = stats[current.id];
    const isNew = !st || !st.seen;
    setResult(res);
    recordAttempt(current.id, res.score, res.verdict, isNew, res.errorType ?? null);
    if (res.verdict === "correct") markDone(current.id);   // V5: "done" once correct
    setSession((s) => [...s, res.verdict].slice(-12));
    maybeTip();
    flip("back");
  }, [current, recordAttempt, flip, stats, maybeTip, markDone]);

  const answerOpts = () => ({ lenientCase: settings.lenientCase, strictAccents: settings.strictAccents, articleMode: settings.articleMode, acceptPartial: settings.acceptPartial });

  const check = useCallback(() => {
    if (!current || face === "back" || anim) return;
    if (mode === "type" && !input.trim()) return;
    let res = latinL3Answer
      ? scoreLatinForm(input, current.lernform || "", answerOpts())
      : scoreAnswer(input, scoreTarget(current, tgtKey), answerOpts());
    if (hintUsed && res.verdict === "correct") {
      res = { ...res, verdict: "almost", score: Math.min(res.score, 0.85), note: "Correct — with a hint" };
    }
    finish(res);
  }, [current, face, anim, input, mode, tgtKey, hintUsed, finish, settings]);

  const choose = useCallback((opt) => {
    if (!current || face === "back" || anim) return;
    setPicked(opt.id);
    const correct = scoreTarget(opt, tgtKey) === scoreTarget(current, tgtKey);
    let res = scoreAnswer(scoreTarget(opt, tgtKey), scoreTarget(current, tgtKey), answerOpts());
    if (!correct) res = { ...res, score: 0, verdict: "wrong" };
    if (hintUsed && res.verdict === "correct")
      res = { ...res, verdict: "almost", score: 0.85, note: "Correct — with a hint" };
    finish(res);
  }, [current, face, anim, tgtKey, hintUsed, finish, settings]);

  const next = useCallback(() => { flip("front", () => pickNext(current && current.id)); }, [pickNext, current, flip]);

  // Recall / Memorize: reveal the answer without scoring yet
  const reveal = useCallback(() => {
    if (!current || face === "back" || anim) return;
    if (mode === "memorize") markDone(current.id);   // V5: Memorize counts a card as "seen"
    flip("back");
  }, [current, face, anim, flip, mode, markDone]);

  // Recall: self-graded (got it / missed it)
  const grade = useCallback((correct) => {
    if (!current || anim) return;
    const st = stats[current.id];
    const isNew = !st || !st.seen;
    recordAttempt(current.id, correct ? 1 : 0, correct ? "correct" : "wrong", isNew);
    if (correct) markDone(current.id);   // V5: Recall "Got it" counts as done
    setSession((s) => [...s, correct ? "correct" : "wrong"].slice(-12));
    maybeTip();
    flip("front", () => pickNext(current.id));
  }, [current, anim, stats, recordAttempt, flip, pickNext, maybeTip, markDone]);

  const useHint = useCallback(() => {
    if (!current || face === "back" || anim) return;
    setHintUsed(true);
    if (mode === "type") {
      const tgt = scoreTarget(current, tgtKey);
      const first = tgt.replace(/^(der|die|das)\s+/i, "")[0] || "";
      const art = (tgt.match(/^(der|die|das)\s+/i) || [""])[0];
      setInput(art + first);
      inputRef.current && inputRef.current.focus();
    } else {
      // remove one wrong choice
      setChoices((cs) => {
        const wrong = cs.find((c) => scoreTarget(c, tgtKey) !== scoreTarget(current, tgtKey));
        return wrong ? cs.filter((c) => c.id !== wrong.id) : cs;
      });
    }
  }, [current, face, anim, mode, tgtKey]);

  const playAudio = useCallback((text, lang) => {
    setPlaying(true);
    speak(text, lang);
    setTimeout(() => setPlaying(false), 900);
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" && e.target !== inputRef.current) return;
      if (anim) return;
      if (face === "back") {
        if (result || mode === "memorize") { if (e.key === "Enter") { e.preventDefault(); next(); } }
        else if (mode === "recall") {
          const k = e.key.toLowerCase();
          if (k === "j" || k === "2") { e.preventDefault(); grade(true); }
          else if (k === "f" || k === "1") { e.preventDefault(); grade(false); }
        }
        return;
      }
      if (mode === "type") {
        if (e.key === "Enter") { e.preventDefault(); check(); }
      } else if (mode === "choice") {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= choices.length) { e.preventDefault(); choose(choices[n - 1]); }
      } else {
        if (e.key === "Enter") { e.preventDefault(); reveal(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [face, anim, mode, result, choices, check, choose, next, reveal, grade]);

  // V2: leave focus mode on Escape (iOS can't force rotation — we only react).
  useEffect(() => {
    if (!focus) return;
    const onEsc = (e) => { if (e.key === "Escape") setFocus(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [focus]);

  // ---- scope bar (V6): smart quick-access chips + lesson selector ----
  const pairVocabAll = vocab.filter((w) => w.pair === pair);
  const smartCountOf = (ref) => resolveSmart(ref, pairVocabAll, stats, settings.masteryCorrect).filter(practiceable).length;
  const lessonCountOf = (l) => resolveLesson(l, vocab).filter(practiceable).length;
  const smartChipsEl = (
    <div className="lchips smart-chips p-smart">
      {SMART_ACCESS.map((s) => (
        <button key={s.ref} title="Schnellzugriff"
          className={"lchip lchip-smart tone-" + (s.ref === "due" ? "amber" : "red") + (effective.kind === "smart" && effective.ref === s.ref ? " on" : "")}
          onClick={() => pickScope("smart", s.ref)}>
          <Icon name={s.icon} size={14} /> {s.label} <span className="lchip-n">{smartCountOf(s.ref)}</span>
        </button>
      ))}
    </div>
  );
  const lessonSelectorEl = pairLessons.length > 0 ? (
    <div className="lchips lesson-selector p-lessonsel">
      <span className="lchips-label"><Icon name="cards" size={13} /> Lektionen</span>
      {pairLessons.map((l) => (
        <button key={l.id} className={"lchip" + (effective.kind === "lesson" && effective.ref === l.id ? " on" : "")} onClick={() => pickScope("lesson", l.id)}>
          {l.name} <span className="lchip-n">{lessonCountOf(l)}</span>
        </button>
      ))}
    </div>
  ) : null;
  const scopeBar = (<div className="lchips-wrap scope-bar">{smartChipsEl}{lessonSelectorEl}</div>);

  if (!pool.length) {
    return (
      <div className="practice-wrap">
        {scopeBar}
        <div className="empty">
          <div className="big">Hier gibt es nichts zu üben</div>
          <div>{pairLessons.length ? "Wähle oben eine andere Lektion oder einen Schnellzugriff." : "Erstelle im Lessons-Tab eine Lektion oder füge im Word-List-Tab Wörter hinzu."}</div>
        </div>
      </div>
    );
  }
  if (!current) return null;

  const verdictMeta = {
    correct: { tone: "green", label: "Correct!", icon: "check" },
    almost: { tone: "amber", label: "Almost there", icon: "sparkle" },
    wrong: { tone: "red", label: "Not quite", icon: "x" },
  };

  // V5: run progress — distinct words "done" out of the frozen run snapshot.
  const runTotal = runWordsRef.current.length;
  const runDone = runWordsRef.current.filter((id) => doneIds.has(id)).length;

  return (
    <div className={"practice-wrap" + (focus ? " focus-on" : "")}
      onClick={focus ? (e) => { if (e.target === e.currentTarget) setFocus(false); } : undefined}>
      {focus && <div className="focus-rotate-hint">Drehe dein Gerät quer für mehr Platz</div>}
      {smartChipsEl}
      {lessonSelectorEl}
      {/* controls */}
      <div className="practice-controls p-controls">
        <div className="dir-pill">
          <span className={"lang-tag active"}>{labelOf(srcKey)}</span>
          <button className="swap" title="Swap direction"
            onClick={() => { store.setSettings({ direction: dir === "f2n" ? "n2f" : "f2n" }); setCurrent(null); }}>
            <Icon name="swap" size={16} />
          </button>
          <span className="lang-tag">{labelOf(tgtKey)}</span>
        </div>
        <div className="seg seg-modes" role="group" aria-label="Answer mode">
          <button aria-pressed={mode === "type"} onClick={() => { store.setSettings({ mode: "type" }); }}>
            <Icon name="edit" size={15} /> Type
          </button>
          <button aria-pressed={mode === "choice"} onClick={() => { store.setSettings({ mode: "choice" }); }}>
            <Icon name="list" size={15} /> Choose
          </button>
          <button aria-pressed={mode === "recall"} onClick={() => { store.setSettings({ mode: "recall" }); }}>
            <Icon name="refresh" size={15} /> Recall
          </button>
          <button aria-pressed={mode === "memorize"} onClick={() => { store.setSettings({ mode: "memorize" }); }}>
            <Icon name="cards" size={15} /> Memorize
          </button>
        </div>
      </div>

      {/* card */}
      <div className="card-scene p-card">
        <button className="card-expand" title={focus ? "Fokus verlassen (Esc)" : "Karte vergrössern"}
          onClick={() => setFocus((f) => !f)}>
          <Icon name={focus ? "x" : "expand"} size={16} />
        </button>
        <div className={"flashcard" + (anim ? " " + anim : "")} data-card-style={settings.cardStyle || "ruled"} data-card-font={settings.cardFont || "serif"}>
          {face === "front" ? (
          /* FRONT */
          <div className="card-face" onClick={(mode === "recall" || mode === "memorize") ? reveal : undefined}
            style={(mode === "recall" || mode === "memorize") ? { cursor: "pointer" } : undefined}>
            <span className="ruled-margin" />
            <div className="card-top">
              <span className="topic-chip">{current.topic || "Vocabulary"}</span>
              <span className="badge slate"><span className="dot" />{srcKey === NATIVE ? `DE \u2192 ${P.short}` : `${P.short} \u2192 DE`}</span>
            </div>
            <div className="card-center">
              <div className="prompt-word">{sideText(current, srcKey)}</div>
              {srcKey !== NATIVE && latinContext(current) && (
                <div className="faint" style={{ fontSize: 14, marginTop: -6 }}>{latinContext(current)}</div>
              )}
              {hasTTS(srcLang) && (
              <button className={"audio-btn" + (playing ? " playing" : "")} title="Hear it"
                onClick={(e) => { e.stopPropagation(); playAudio(sideText(current, srcKey), srcLang); }}>
                <Icon name="volume" size={20} />
              </button>
              )}
              <div className="prompt-hint">{mode === "recall" ? "Recall the answer, then flip" : mode === "memorize" ? "Tap the card to reveal" : (latinL3Answer ? "Alle Stammformen eingeben" : `Translate to ${labelOf(tgtKey)}`)}</div>
            </div>
          </div>
          ) : (
          /* BACK */
          <div className="card-face">
            <span className="ruled-margin" />
            {result && (
              <>
                <div className="card-top">
                  <div className="result-head">
                    <span className="result-emoji" style={{ background: `var(--${verdictMeta[result.verdict].tone}-bg)`, color: toneColor(verdictMeta[result.verdict].tone) }}>
                      <Icon name={verdictMeta[result.verdict].icon} size={20} />
                    </span>
                    {verdictMeta[result.verdict].label}
                  </div>
                  {hasTTS(tgtLang) && (
                  <button className="audio-btn" style={{ width: 38, height: 38 }} title="Hear it"
                    onClick={() => playAudio(sideText(current, tgtKey), tgtLang)}>
                    <Icon name="volume" size={17} />
                  </button>
                  )}
                </div>
                <div className="card-center" style={{ gap: 18 }}>
                  <div>
                    <div className="diff-label">Answer</div>
                    <div className="diff-line">
                      {result.targetDiff.map((c, i) => <span key={i} className={"ch " + c.status}>{c.ch}</span>)}
                    </div>
                    {isLat && tgtKey !== NATIVE && latinContext(current) && (
                      <div className="faint" style={{ fontSize: 14, textAlign: "center", marginTop: 6 }}>
                        Lernform: {current.lernform}
                      </div>
                    )}
                  </div>
                  {result.verdict !== "correct" && input.trim() && (
                    <div>
                      <div className="diff-label">You wrote</div>
                      <div className="diff-line" style={{ fontSize: "clamp(18px,3.5vw,24px)", opacity: .85 }}>
                        {result.userDiff.map((c, i) => <span key={i} className={"ch " + c.status}>{c.ch}</span>)}
                      </div>
                    </div>
                  )}
                  {result.note && (
                    <div className="note-pill" style={{ background: `var(--${verdictMeta[result.verdict].tone}-bg)`, color: toneColor(verdictMeta[result.verdict].tone) }}>
                      {result.note}
                    </div>
                  )}
                </div>
              </>
            )}
            {!result && (mode === "recall" || mode === "memorize") && (
              <>
                <div className="card-top">
                  <span className="topic-chip">{current.topic || "Vocabulary"}</span>
                  {hasTTS(tgtLang) && (
                  <button className="audio-btn" style={{ width: 38, height: 38 }} title="Hear it"
                    onClick={(e) => { e.stopPropagation(); playAudio(sideText(current, tgtKey), tgtLang); }}>
                    <Icon name="volume" size={17} />
                  </button>
                  )}
                </div>
                <div className="card-center" style={{ gap: 10 }}>
                  <div className="diff-label">{labelOf(tgtKey)}</div>
                  <div className="prompt-word">{revealText(current, tgtKey)}</div>
                  <div className="faint" style={{ fontSize: 14 }}>{sideText(current, srcKey)}</div>
                </div>
              </>
            )}
          </div>
          )}
          {runTotal > 0 && (
            <div className="card-progress" title={`${runDone} von ${runTotal} geschafft`} aria-hidden="true">
              <i style={{ width: pct(runDone / runTotal) + "%" }} />
            </div>
          )}
        </div>
      </div>

      {/* answer zone */}
      <div className="answer-zone p-answer">
        {face === "front" ? (
          mode === "type" ? (
            <>
              <div className="answer-row">
                <input ref={inputRef} className="field" placeholder={`Type the ${labelOf(tgtKey)} word…`}
                  value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off"
                  autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                <button className="btn btn-primary" onClick={check} disabled={!input.trim()}>
                  Check <Icon name="arrowRight" size={16} />
                </button>
              </div>
              <div className="toolbelt">
                <button className="btn btn-ghost btn-sm" onClick={useHint} disabled={hintUsed}>
                  <Icon name="hint" size={15} /> {hintUsed ? "Hint shown" : "Hint"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => finish(latinL3Answer ? scoreLatinForm("", current.lernform || "", answerOpts()) : scoreAnswer("", scoreTarget(current, tgtKey), answerOpts()))}>
                  Skip / I don't know
                </button>
              </div>
            </>
          ) : mode === "choice" ? (
            <>
              <div className="choices">
                {choices.map((opt, i) => (
                  <button key={opt.id} className="choice" onClick={() => choose(opt)}>
                    <span className="key">{i + 1}</span>{scoreTarget(opt, tgtKey)}
                  </button>
                ))}
              </div>
              <div className="toolbelt">
                <button className="btn btn-ghost btn-sm" onClick={useHint} disabled={hintUsed || choices.length <= 2}>
                  <Icon name="hint" size={15} /> Remove a wrong one
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="answer-row" style={{ justifyContent: "center" }}>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={reveal}>
                  Show answer <Icon name="arrowRight" size={16} />
                </button>
              </div>
              <div className="toolbelt">
                {hasTTS(srcLang) && (
                <button className="btn btn-ghost btn-sm" onClick={() => playAudio(sideText(current, srcKey), srcLang)}>
                  <Icon name="volume" size={15} /> Hear it
                </button>
                )}
                <span className="faint" style={{ fontSize: 12.5, alignSelf: "center" }}>
                  {mode === "recall" ? "Picture the answer, then check yourself" : "Just flipping through — nothing is scored"}
                </span>
              </div>
            </>
          )
        ) : result ? (
          <>
            <div className="score-bar"><i style={{ width: pct(result.score) + "%", background: toneColor(verdictMeta[result.verdict].tone) }} /></div>
            <div className="answer-row" style={{ justifyContent: "center" }}>
              <button className="btn btn-amber" style={{ flex: 1, justifyContent: "center" }} onClick={next} autoFocus>
                Next card <Icon name="arrowRight" size={16} />
              </button>
            </div>
            <div className="toolbelt">
              <span className="faint" style={{ fontSize: 12.5, alignSelf: "center" }}>Press <b>Enter</b> for the next card</span>
            </div>
          </>
        ) : mode === "recall" ? (
          <>
            <div className="answer-row">
              <button className="btn grade-miss" style={{ flex: 1, justifyContent: "center" }} onClick={() => grade(false)}>
                <Icon name="x" size={16} /> Missed it
              </button>
              <button className="btn grade-got" style={{ flex: 1, justifyContent: "center" }} onClick={() => grade(true)}>
                <Icon name="check" size={16} /> Got it
              </button>
            </div>
            <div className="toolbelt">
              <span className="faint" style={{ fontSize: 12.5, alignSelf: "center" }}>Be honest — it makes your review smarter</span>
            </div>
          </>
        ) : (
          <>
            <div className="answer-row" style={{ justifyContent: "center" }}>
              <button className="btn btn-amber" style={{ flex: 1, justifyContent: "center" }} onClick={next} autoFocus>
                Next card <Icon name="arrowRight" size={16} />
              </button>
            </div>
            <div className="toolbelt">
              <span className="faint" style={{ fontSize: 12.5, alignSelf: "center" }}>Press <b>Enter</b> to keep flipping</span>
            </div>
          </>
        )}
      </div>

      {/* session strip */}
      <div className="session-strip p-session">
        <span>This session: <b>{session.length}</b></span>
        <div className="dotrow">
          {session.map((v, i) => <i key={i} className={v === "correct" ? "c" : v === "almost" ? "a" : "w"} />)}
          {session.length === 0 && <span className="faint" style={{ fontSize: 12.5 }}>your streak of answers shows here</span>}
        </div>
      </div>

      {/* sporadic study tip at a natural pause (Phase 6) */}
      <TipPopup tip={tip} onClose={() => setTip(null)} />
    </div>
  );
}
