import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { toneColor, pct } from "../ui/Ring";
import { speak } from "../ui/speak";
import { scoreAnswer } from "../lib/scoring";
import { resolveLesson, resolveSmart, lessonProfile, resolveToday, sevenDayOutlook } from "../lib/engine";
import { buildQueue, pick, record, outcomeOf, pendingGrades, progress, remaining } from "../lib/runqueue";
import { retrievabilityOf, isDueCard, retentionFor, initialCard, deriveProfile, STUFE, STUFE_ORDER, deriveRating, gradeFromCard, getCfg } from "../lib/fsrs";
import { PAIRS, NATIVE, practiceable, hasTTS, isLatinPair } from "../lib/pairs";
import { latinHeadword, latinReveal, latinAnswerTarget, scoreLatinForm } from "../lib/latin";
import { TipPopup } from "./TipPopup";
import { LERN_TIPPS } from "./LearnTips";

/* ===================================================================
 * practice.jsx — the flashcard trainer.
 * =================================================================== */
const toneVarP = (t) => t === "green" ? "var(--green)" : t === "amber" ? "var(--amber)" : t === "red" ? "var(--red)" : t === "blue" ? "var(--blue)" : "var(--ink-faint)";

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
  // V14: FSRS-based quick-access chips (one axis each). „Wackeln noch" = stufe
  // 'sitzt_schlecht' (S), replaces the old classifyWord-„Schwierige". Leeches (D)
  // live only in Stats, not here.
  const SMART_ACCESS = [
    { ref: "heute", label: "Heute dran", icon: "calendar", tone: "green" },   // V17 default learning path
    { ref: "due", label: "Fällige Wörter", icon: "target", tone: "amber" },
    { ref: "wackeln", label: "Wackeln noch", icon: "flame", tone: "red" },
    { ref: "baldfaellig", label: "Bald fällig", icon: "clock", tone: "amber" },
  ];
  // visible chips above; the Stats insight lists (leech/frischfragil/kurzvorsitzt) are
  // also valid practice scopes (started via „üben") but have no chip here.
  const SMART_REFS = ["heute", "due", "wackeln", "baldfaellig", "leech", "frischfragil", "kurzvorsitzt"];
  const pairLessons = useMemo(() => lessons.filter((l) => l.pair === pair), [lessons, pair]);
  const pairLists = useMemo(() => (store.lists || []).filter((l: any) => l.pair === pair), [store.lists, pair]);
  const pairTopics = useMemo(() => Array.from(new Set(vocab.filter((w: any) => w.pair === pair).map((w: any) => w.topic).filter(Boolean))).sort() as string[], [vocab, pair]);
  // F-NAV-2: multiselect is EPHEMERAL UI state — NOT persisted, NOT synced (FIX C:
  // practiceSel stays a single token; 2+ scopes drive a deduped union at runtime only).
  const [multiSel, setMultiSel] = useState<string[]>([]);
  useEffect(() => { setMultiSel([]); }, [pair]);   // pair switch resets a pair-foreign multiselect
  const parseSel = (sel) => { const i = (sel || "").indexOf(":"); return i < 0 ? { kind: "", ref: "" } : { kind: sel.slice(0, i), ref: sel.slice(i + 1) }; };
  const rawSel = parseSel(settings.practiceSel);
  const selValid = rawSel.kind === "smart" ? SMART_REFS.includes(rawSel.ref)
    : rawSel.kind === "lesson" ? pairLessons.some((l) => l.id === rawSel.ref)
    : rawSel.kind === "list" ? pairLists.some((l: any) => l.id === rawSel.ref)
    : rawSel.kind === "topic" ? pairTopics.includes(rawSel.ref)
    : false;
  // V17: default learning path = "Heute dran"
  const effective = selValid ? rawSel : { kind: "smart", ref: "heute" };
  const tokValid = (tok: string) => { const i = tok.indexOf(":"); const k = tok.slice(0, i), r = tok.slice(i + 1); return k === "lesson" ? pairLessons.some((l) => l.id === r) : k === "list" ? pairLists.some((l: any) => l.id === r) : k === "topic" ? pairTopics.includes(r) : false; };
  const validMulti = multiSel.filter(tokValid);
  const scopeTokens = validMulti.length ? validMulti : [effective.kind + ":" + effective.ref];
  const selKey = scopeTokens.join("|");
  // single pick: clear any multiselect + persist the single token (synced, backward-compatible)
  const pickScope = (kind, ref) => { setMultiSel([]); store.setSettings({ practiceSel: kind + ":" + ref }); };
  // multiselect toggle: a single remaining token mirrors to practiceSel (persistence);
  // 2+ stay ephemeral (not synced).
  const toggleScope = (tok: string) => {
    const next = multiSel.includes(tok) ? multiSel.filter((x) => x !== tok) : [...multiSel, tok];
    setMultiSel(next);
    if (next.length === 1) store.setSettings({ practiceSel: next[0] });   // mirror single (persist); never in a render-phase updater
  };
  const isActiveTok = (tok: string) => validMulti.length ? validMulti.includes(tok) : (effective.kind + ":" + effective.ref === tok);
  const wordsForToken = (tok: string): any[] => {
    const i = tok.indexOf(":"); const kind = tok.slice(0, i), ref = tok.slice(i + 1);
    const pv = vocab.filter((w) => w.pair === pair);
    if (kind === "smart") {
      const ret = retentionFor(settings);
      if (ref === "heute") return resolveToday(pv, stats, lessons, ret, settings.dailyGoal, settings.newPerDay);   // V17
      const opts: any = { retention: ret };
      if (ref === "due") opts.cap = settings.dailyGoal;
      return resolveSmart(ref, pv, stats, settings.masteryCorrect, opts).filter(practiceable);
    }
    if (kind === "list") return pv.filter((w) => (w.lists || []).includes(ref)).filter(practiceable);
    if (kind === "topic") return pv.filter((w) => w.topic === ref).filter(practiceable);
    return resolveLesson(pairLessons.find((l) => l.id === ref), vocab).filter(practiceable);
  };
  // live resolution of the chosen scope(s) — deduped union over scopeTokens (one pair).
  const resolveScopeWords = () => {
    const seen = new Set<string>(); const out: any[] = [];
    for (const tok of scopeTokens) for (const w of wordsForToken(tok)) if (!seen.has(w.id)) { seen.add(w.id); out.push(w); }
    return out;
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
  const [lessonsOpen, setLessonsOpen] = useState(true);  // F-NAV-2: Practice default = Lektionen offen
  const [listsOpen, setListsOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false); // F-NAV: collapsible topics
  const [outlookOpen, setOutlookOpen] = useState(false); // F-7TAGE: outlook popover
  const [enoughAck, setEnoughAck] = useState(false);   // F-CARD-UI: "genug für heute" dismissed
  const hiddenAtRef = useRef(0);                        // F-CARD-UI: stale-session detection
  const inputRef = useRef(null);
  const recentRef = useRef([]);                // recently shown ids (spacing)
  const answeredRef = useRef(0);               // scored answers this session (tip cadence)

  // ---- run snapshot (V5/V6/V8 + V-ENGINE): freeze the word set when scope/pair
  // changes, then build ONE weighted-pool queue over the frozen ids. Each word is
  // FSRS-graded exactly once per session (at graduation / session-end flush).
  const runWordsRef = useRef([]);
  const runRef = useRef(null);          // V8 RunState
  const gradedRef = useRef(new Set());  // V8 ids already FSRS-graded this run (once-only)
  const baseCardRef = useRef({});       // V8 pre-session FSRS baseline per word (grade from this)
  const growthRef = useRef([]);         // V14 stability jumps this run (ephemeral, for the end-card)
  const shownAtRef = useRef(0);         // V8 when the current card was shown
  const flushRef = useRef(() => {});    // V8 latest session-end flush
  const [doneIds, setDoneIds] = useState(() => new Set()); // V5: mastered ids this run
  const markDone = useCallback((id) => setDoneIds((prev) => prev.has(id) ? prev : new Set(prev).add(id)), []);
  const [runId, setRunId] = useState(0);

  const beginRun = (ids, forceAll = false) => {
    flushRef.current();                 // grade unfinished words from the previous run first
    runWordsRef.current = ids;
    const retention = retentionFor(settings);
    const now = Date.now();
    const meta2 = {};
    const bases = {};
    for (const id of ids) {
      const st = stats[id];
      const r = retrievabilityOf(st, retention, now);
      const hasCard = !!(st && st.fsrs);
      // V-ENGINE: pool/goal come from the stufe (one source) + due (auffrisch-topf).
      meta2[id] = { stufe: deriveProfile(st?.fsrs, retention, now).stufe, retrievability: r, due: hasCard ? isDueCard(st, now, retention) : true };
      bases[id] = initialCard(st);   // frozen pre-session FSRS baseline (FIX 1)
    }
    baseCardRef.current = bases;
    growthRef.current = [];
    runRef.current = buildQueue(ids, meta2, getCfg(), Math.random, forceAll);
    gradedRef.current = new Set();
    setDoneIds(new Set());
    setEnoughAck(false);
    setRunId((n) => n + 1);
    setCurrent(null); setFace("front"); setAnim(""); setResult(null); setSession([]); setTip(null);
  };
  const startRun = () => beginRun(resolveScopeWords().map((w) => w.id));
  // F-CARD-UI: leave the round any time — no dialog (FSRS is saved after each answer).
  const leaveRun = () => { flushRef.current(); store.setSettings({ practiceSel: "smart:heute" }); };
  // V10: re-drill only the words that were wrong/needed a hint this round.
  const startRoundRetry = () => {
    const st = runRef.current; if (!st) return;
    const failed = Object.values(st.words).filter((w: any) => w.failedOnce || w.usedHint).map((w: any) => w.id);
    if (failed.length) beginRun(failed);
  };
  useEffect(() => { startRun(); }, [pair, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useMemo(() => {
    const set = new Set(runWordsRef.current);
    return vocab.filter((w) => set.has(w.id) && practiceable(w));
  }, [vocab, runId]);
  const poolById = useMemo(() => { const m = {}; for (const w of pool) m[w.id] = w; return m; }, [pool]);
  // B1: multiple-choice distractors come from the WHOLE pair vocabulary, not the
  // (possibly tiny) run scope — so a 1-word scope still yields full options.
  const distractorPool = useMemo(() => vocab.filter((w) => w.pair === pair && practiceable(w)), [vocab, pair]);

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

  const pickNext = useCallback(() => {
    const st = runRef.current;
    const id = st ? pick(st, getCfg()) : null;
    const w = id ? poolById[id] : null;
    if (!w) { setCurrent(null); return; }              // run complete (all mastered)
    setCurrent(w);
    shownAtRef.current = Date.now();
    setInput(""); setResult(null); setHintUsed(false); setPicked(null);
    // build multiple-choice options
    const nOpts = Math.max(2, Math.min(6, settings.choicesCount || 4));
    const others = distractorPool.filter((o) => o.id !== w.id);   // B1: full pair vocab
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
  }, [poolById, distractorPool, tgtKey, srcKey, settings.choicesCount, settings.autoAudio]);

  // V8: record the current word's resolution into the runqueue; fire ONE FSRS
  // grade at graduation. Memorize = pure exposition → seen, never graded.
  const resolveWord = useCallback((rawCorrect, usedHint) => {
    const st = runRef.current;
    if (!st || !st.current) return;
    const id = st.current;
    const w = st.words[id];
    if (w) w.mode = mode;
    if (mode === "memorize") {
      if (w) { w.attempts++; w.mastered = true; w.graded = true; }   // seen; no grade
      st.lastId = id; st.current = null;
      markDone(id);
      return;
    }
    const elapsed = Date.now() - (shownAtRef.current || Date.now());
    const { graduated } = record(st, { correct: !!rawCorrect, usedHint: !!usedHint, elapsedMs: elapsed });
    if (graduated) {
      markDone(id);
      if (!gradedRef.current.has(id)) {
        gradedRef.current.add(id);
        st.words[id].graded = true;
        const outcome = outcomeOf(st.words[id]);
        store.gradeWord(id, outcome, mode, baseCardRef.current[id]);
        // V14: collect the stability jump for the bundled end-card nugget (ephemeral).
        const base = baseCardRef.current[id];
        const rating = deriveRating(outcome, mode);
        if (rating !== "no-grade" && base) {
          const after = gradeFromCard(base, rating as number, retentionFor(settings));
          if ((after.stability || 0) > (base.stability || 0) + 0.1) growthRef.current.push({ id, before: base.stability || 0, after: after.stability || 0 });
        }
      }
    }
  }, [mode, markDone, store]);

  // V8: session-end flush — grade started-but-ungraded words once. Fires on
  // unmount, scope/pair change (via startRun), AND mobile backgrounding.
  flushRef.current = () => {
    const st = runRef.current;
    if (!st) return;
    for (const w of pendingGrades(st)) {
      if (gradedRef.current.has(w.id)) continue;
      gradedRef.current.add(w.id); w.graded = true;
      store.gradeWord(w.id, outcomeOf(w), w.mode || mode, baseCardRef.current[w.id]);
    }
  };
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") { flushRef.current(); hiddenAtRef.current = Date.now(); }
      else if (document.visibilityState === "visible" && hiddenAtRef.current) {
        // F-CARD-UI: stale session → rebuild the pool fresh (no dialog, nothing lost;
        // FSRS was already flushed on hide).
        const staleMs = (getCfg().STALE_MIN || 45) * 60000;
        if (Date.now() - hiddenAtRef.current > staleMs) startRun();
        hiddenAtRef.current = 0;
      }
    };
    const onHide = () => { flushRef.current(); hiddenAtRef.current = Date.now(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      flushRef.current();   // unmount = session end
    };
  }, []);

  // First card whenever the (frozen) pool appears, or self-heal if `current`
  // became stale (e.g. an async cloud sync swapped vocab under the initial
  // pick). The freeze effect above already did the B1 reset, so Practice never
  // stays blank — on mount or on any pair/scope change.
  useEffect(() => {
    if (face === "back" || anim) return;        // never interrupt a result/flip
    const st = runRef.current; if (!st) return;
    const stale = current && !poolById[current.id];
    if ((!current || stale) && remaining(st) > 0) pickNext();
  }, [runId, current, poolById, pickNext, face, anim]);

  const finish = useCallback((res, rawCorrect) => {
    if (mode === "memorize") return;   // F-MEMORIZE: browse-only never scores/mutates
    const st = stats[current.id];
    const isNew = !st || !st.seen;
    setResult(res);
    recordAttempt(current.id, res.score, res.verdict, isNew, res.errorType ?? null);  // legacy stats
    resolveWord(rawCorrect, hintUsed);   // V8: runqueue + single FSRS grade at graduation
    setSession((s) => [...s, res.verdict].slice(-12));
    maybeTip();
    flip("back");
  }, [current, recordAttempt, flip, stats, maybeTip, hintUsed, resolveWord, mode]);

  const answerOpts = () => ({ lenientCase: settings.lenientCase, strictAccents: settings.strictAccents, articleMode: settings.articleMode, acceptPartial: settings.acceptPartial });

  const check = useCallback(() => {
    if (!current || face === "back" || anim) return;
    if (mode === "type" && !input.trim()) return;
    let res = latinL3Answer
      ? scoreLatinForm(input, current.lernform || "", answerOpts())
      : scoreAnswer(input, scoreTarget(current, tgtKey), answerOpts());
    const rawCorrect = res.verdict === "correct";    // V8: true correctness before hint downgrade
    if (hintUsed && res.verdict === "correct") {
      res = { ...res, verdict: "almost", score: Math.min(res.score, 0.85), note: "Correct — with a hint" };
    }
    finish(res, rawCorrect);
  }, [current, face, anim, input, mode, tgtKey, hintUsed, finish, settings]);

  const choose = useCallback((opt) => {
    if (!current || face === "back" || anim) return;
    setPicked(opt.id);
    const correct = scoreTarget(opt, tgtKey) === scoreTarget(current, tgtKey);
    let res = scoreAnswer(scoreTarget(opt, tgtKey), scoreTarget(current, tgtKey), answerOpts());
    if (!correct) res = { ...res, score: 0, verdict: "wrong" };
    if (hintUsed && res.verdict === "correct")
      res = { ...res, verdict: "almost", score: 0.85, note: "Correct — with a hint" };
    finish(res, correct);
  }, [current, face, anim, tgtKey, hintUsed, finish, settings]);

  const next = useCallback(() => { flip("front", () => pickNext()); }, [pickNext, flip]);

  // Recall / Memorize: reveal the answer without scoring yet
  const reveal = useCallback(() => {
    if (!current || face === "back" || anim) return;
    if (mode === "memorize") resolveWord(true, false);   // V5/V8: Memorize = seen, no grade
    flip("back");
  }, [current, face, anim, flip, mode, resolveWord]);

  // Recall: self-graded (got it / missed it)
  const grade = useCallback((correct) => {
    if (!current || anim) return;
    const st = stats[current.id];
    const isNew = !st || !st.seen;
    recordAttempt(current.id, correct ? 1 : 0, correct ? "correct" : "wrong", isNew);  // legacy
    resolveWord(correct, false);   // V8: runqueue + grade at graduation
    setSession((s) => [...s, correct ? "correct" : "wrong"].slice(-12));
    maybeTip();
    flip("front", () => pickNext());
  }, [current, anim, stats, recordAttempt, flip, pickNext, maybeTip, resolveWord]);

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
  const smartCountOf = (ref) => ref === "heute"
    ? resolveToday(pairVocabAll, stats, lessons, retentionFor(settings), settings.dailyGoal, settings.newPerDay).length
    : resolveSmart(ref, pairVocabAll, stats, settings.masteryCorrect, { retention: retentionFor(settings) }).filter(practiceable).length;
  const lessonCountOf = (l) => resolveLesson(l, vocab).filter(practiceable).length;
  const smartChipsEl = (
    <div className="lchips smart-chips p-smart">
      {SMART_ACCESS.map((s) => (
        <button key={s.ref} title="Schnellzugriff"
          className={"lchip lchip-smart tone-" + s.tone + (validMulti.length === 0 && effective.kind === "smart" && effective.ref === s.ref ? " on" : "")}
          onClick={() => pickScope("smart", s.ref)}>
          <Icon name={s.icon} size={14} /> {s.label} <span className="lchip-n">{smartCountOf(s.ref)}</span>
        </button>
      ))}
    </div>
  );
  // V9: sort lessons by deadline (soonest first), show a mastery colour dot.
  const lessonRetention = retentionFor(settings);
  const dotTone = (t) => t === "green" ? "var(--green)" : t === "amber" ? "var(--amber)" : t === "red" ? "var(--red)" : "var(--ink-faint)";
  const lessonsSorted = [...pairLessons].sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity) || (a.createdAt || 0) - (b.createdAt || 0));
  // F-NAV-2: one scope picker — three collapsible groups (Lektionen offen, Listen/
  // Themen zu). Chips multi-toggle (ephemeral union); "Alle" per Gruppe.
  const listCountOf = (id: string) => pairVocabAll.filter((w: any) => (w.lists || []).includes(id)).length;
  const topicCountOf = (t: string) => pairVocabAll.filter((w: any) => w.topic === t).length;
  const toggleAll = (toks: string[]) => {
    const on = toks.length > 0 && toks.every((t) => multiSel.includes(t));
    const next = on ? multiSel.filter((t) => !toks.includes(t)) : Array.from(new Set([...multiSel, ...toks]));
    setMultiSel(next);
    if (next.length === 1) store.setSettings({ practiceSel: next[0] });
  };
  const groupHead = (open: boolean, set: any, icon: string, label: string, n: number, toks: string[]) => (
    <div className="scope-group-head">
      <button className="lchips-label lchips-toggle" onClick={() => set((o: boolean) => !o)}>
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span> <Icon name={icon as any} size={13} /> {label} ({n})
      </button>
      {open && n > 0 && <button className="scope-all" onClick={() => toggleAll(toks)}>{toks.every((t) => validMulti.includes(t)) && toks.length ? "keine" : "alle"}</button>}
    </div>
  );
  const lessonToks = lessonsSorted.map((l) => "lesson:" + l.id);
  const listToks = pairLists.map((l: any) => "list:" + l.id);
  const topicToks = pairTopics.map((t) => "topic:" + t);
  const lessonSelectorEl = (pairLessons.length || pairLists.length || pairTopics.length) ? (
    <div className="scope-picker p-lessonsel">
      {pairLessons.length > 0 && (
        <div className="lchips lesson-selector lchips-topics">
          {groupHead(lessonsOpen, setLessonsOpen, "cards", "Lektionen", pairLessons.length, lessonToks)}
          {lessonsOpen && lessonsSorted.map((l) => {
            const tone = lessonProfile(l, vocab, stats, lessonRetention).tone;
            const days = l.dueDate ? Math.ceil((l.dueDate - Date.now()) / 86400000) : null;
            return (
            <button key={l.id} className={"lchip" + (isActiveTok("lesson:" + l.id) ? " on" : "")} onClick={() => toggleScope("lesson:" + l.id)}>
              <span className="dot" style={{ width: 9, height: 9, borderRadius: "50%", background: dotTone(tone) }} />
              {l.name} <span className="lchip-n">{lessonCountOf(l)}</span>
              {days != null && <span className="lchip-due" style={{ color: days <= 3 ? "var(--red)" : "var(--ink-faint)" }}>{days < 0 ? "überfällig" : days === 0 ? "heute" : `${days}T`}</span>}
            </button>
            );
          })}
        </div>
      )}
      {pairLists.length > 0 && (
        <div className="lchips lesson-selector lchips-topics">
          {groupHead(listsOpen, setListsOpen, "list", "Listen", pairLists.length, listToks)}
          {listsOpen && pairLists.map((l: any) => (
            <button key={l.id} className={"lchip" + (isActiveTok("list:" + l.id) ? " on" : "")} onClick={() => toggleScope("list:" + l.id)}>
              {l.name} <span className="lchip-n">{listCountOf(l.id)}</span>
            </button>
          ))}
        </div>
      )}
      {pairTopics.length > 0 && (
        <div className="lchips lesson-selector lchips-topics">
          {groupHead(topicsOpen, setTopicsOpen, "filter", "Themen", pairTopics.length, topicToks)}
          {topicsOpen && pairTopics.map((t) => (
            <button key={t} className={"lchip lchip-topic" + (isActiveTok("topic:" + t) ? " on" : "")} onClick={() => toggleScope("topic:" + t)}>
              {t} <span className="lchip-n">{topicCountOf(t)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;
  // F-7TAGE: 7-day outlook moved into a popover (button toggles). Day boxes are
  // clickable (start that day's words) and text-labelled, not colour-only.
  const outlookEl = (() => {
    const days = sevenDayOutlook(pairVocabAll, stats, lessons, retentionFor(settings));
    const DN = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const totalSoon = days.reduce((a, d) => a + d.count, 0);
    return (
      <div className="outlook-wrap p-smart">
        <button className="btn btn-ghost btn-sm" onClick={() => setOutlookOpen((o) => !o)} title="Was in den nächsten 7 Tagen fällig wird">
          <Icon name="calendar" size={14} /> 7-Tage-Ausblick <span className="lchip-n">{totalSoon}</span>
        </button>
        {outlookOpen && (
          <div className="outlook outlook-pop">
            <div className="outlook-label"><Icon name="calendar" size={12} /> Fällige &amp; geplante Wörter je Tag <span className="faint">· Schätzung</span></div>
            <div className="outlook-days">
              {days.map((d, i) => { const dt = new Date(d.day); const lbl = i === 0 ? "heute" : DN[dt.getDay()];
                const sel = i === 0 ? "heute" : "baldfaellig";
                return (
                  <button key={i} className={"outlook-day" + (d.deadlines.length ? " has-deadline" : "")}
                    title={`${lbl}: ${d.count} fällig${d.deadlines.length ? " · Prüfung: " + d.deadlines.join(", ") : ""} — tippen zum Üben`}
                    onClick={() => { pickScope("smart", sel); setOutlookOpen(false); }}>
                    <span className="od-n">{d.count}</span>
                    <span className="od-d">{lbl}</span>
                    {d.deadlines.length > 0 && <span className="od-flag" title="Prüfung">!</span>}
                  </button>
                );
              })}
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>„!" = Prüfungstermin einer Lektion an dem Tag.</div>
          </div>
        )}
      </div>
    );
  })();
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
  if (!current) {
    // B3: three distinct reasons there's no current card.
    const st = runRef.current;
    const remainingN = st ? remaining(st) : 0;
    const total = st ? st.total : 0;
    if (remainingN > 0) {   // transient: first card about to be picked
      return <div className="practice-wrap">{scopeBar}<div className="empty"><div className="big">Bereit</div><div>Einen Moment …</div></div></div>;
    }
    if (total === 0) {     // nothing was due / everything already sits
      return (
        <div className="practice-wrap">
          {scopeBar}
          <div className="empty">
            <div className="big">Alles sitzt — nichts fällig</div>
            <div>In dieser Auswahl ist gerade nichts dran. Wähle oben eine andere Lektion / einen Schnellzugriff — oder komm später wieder.</div>
          </div>
        </div>
      );
    }
    // F-MEMORIZE: browse-only has no round/FSRS balance — neutral end-card.
    if (mode === "memorize") {
      return (
        <div className="practice-wrap">
          {scopeBar}
          <div className="empty round-done">
            <div className="big">Durchgeblättert</div>
            <div className="round-tally">Du hast alle Karten dieser Auswahl angesehen. Memorize ändert deinen Lernstand nicht.</div>
            <div className="round-actions">
              <button className="btn btn-primary" onClick={leaveRun}>Fertig</button>
              <button className="btn btn-ghost btn-sm" onClick={() => beginRun(runWordsRef.current, true)}><Icon name="refresh" size={14} /> Nochmal durchblättern</button>
            </div>
          </div>
        </div>
      );
    }
    // V10: round finished → end-card with honest tally + targeted re-drill.
    const ret = retentionFor(settings);
    const sitNow = (st ? Object.keys(st.words) : []).filter((id) => deriveProfile(stats[id]?.fsrs, ret).stufe === "sitzt").length;
    const back = total - sitNow;
    const failedCount = st ? Object.values(st.words).filter((w: any) => w.failedOnce || w.usedHint).length : 0;
    // V14 nugget (bundled): words that gained stability this round (ephemeral).
    const grown = growthRef.current.filter((g: any) => g.after > g.before + 0.1);
    const topGrow = [...grown].sort((a: any, b: any) => (b.after - b.before) - (a.after - a.before)).slice(0, 2);
    const wlbl = (id: string) => { const w = vocab.find((x: any) => x.id === id); return w ? (isLat ? latinHeadword(w) : (w[foreign] || w.de)) : ""; };
    return (
      <div className="practice-wrap">
        {scopeBar}
        <div className="empty round-done">
          <div className="big">Runde geschafft</div>
          <div className="round-tally">{sitNow} {sitNow === 1 ? "Wort sitzt" : "Wörter sitzen"} dauerhaft{back > 0 ? ` · ${back} ${back === 1 ? "kommt" : "kommen"} zur Wiederholung zurück` : ""}.</div>
          {grown.length > 0 && (
            <div className="round-grow">
              <div style={{ fontWeight: 600 }}>{grown.length} {grown.length === 1 ? "Wort ist" : "Wörter sind"} heute stärker geworden.</div>
              {topGrow.map((g: any, i: number) => { const y = Math.round(g.after), z = Math.round(g.before); return (
                <div key={i} className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{wlbl(g.id)} hält jetzt ~{y} {z >= 1 ? `statt ${z} ` : ""}Tage{z >= 1 ? "n" : ""}.</div>
              ); })}
            </div>
          )}
          <div className="round-actions">
            <button className="btn btn-primary" onClick={leaveRun}>Fertig</button>
            {failedCount > 0 && <button className="btn btn-amber" onClick={startRoundRetry}><Icon name="flame" size={15} /> Wackler nochmal ({failedCount})</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => beginRun(runWordsRef.current, true)}><Icon name="refresh" size={14} /> Ganze Lektion nochmal</button>
          </div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>Am besten morgen wieder — dann sitzt's dauerhaft.</div>
        </div>
      </div>
    );
  }

  const verdictMeta = {
    correct: { tone: "green", label: "Correct!", icon: "check" },
    almost: { tone: "amber", label: "Almost there", icon: "sparkle" },
    wrong: { tone: "red", label: "Not quite", icon: "x" },
  };

  // F-CARD-UI: TWO separate indicators.
  // (1) Rundenfortschritt-% (top, ephemeral/RAM): denominator = sum of round goals
  //     fixed at start (FIX A); rises on a counting recall, drops on a lapse of an
  //     in-progress word (FIX B). NOT persisted.
  // (2) Wasserstand-Balken (bottom): GLOBAL 5-stufen distribution over ALL scope
  //     words (deriveProfile, one source). No second line.
  const masteryRetention = retentionFor(settings);
  const scopeIds = runWordsRef.current;
  const scopeTotal = scopeIds.length;
  const scopeDist: Record<string, number> = { sitzt: 0, sitzt_fast: 0, sitzt_schlecht: 0, neu: 0, noch_nicht_geuebt: 0 };
  for (const id of scopeIds) { const s = deriveProfile(stats[id]?.fsrs, masteryRetention).stufe; scopeDist[s] = (scopeDist[s] || 0) + 1; }
  const sits = scopeDist.sitzt;
  const roundProg = runRef.current ? progress(runRef.current) : null;
  const roundProgressEl = (roundProg && roundProg.total > 0) ? (
    <div className="round-progress card-head">
      <div className="round-progress-head"><span>Runde</span><span>{roundProg.pct} %</span></div>
      <div className="round-progress-track"><i style={{ width: roundProg.pct + "%" }} /></div>
    </div>
  ) : null;
  const masteryBar = scopeTotal > 0 ? (
    <div className="mastery-strip card-foot">
      <div className="mastery-head">{sits} von {scopeTotal} {scopeTotal === 1 ? "Wort sitzt" : "Wörtern sitzen"}</div>
      <div className="stufe-band">
        {STUFE_ORDER.map((k) => scopeDist[k] ? <i key={k} style={{ flex: scopeDist[k], background: toneVarP(STUFE[k].tone) }} /> : null)}
      </div>
    </div>
  ) : null;

  return (
    <div className={"practice-wrap" + (focus ? " focus-on" : "")}
      onClick={focus ? (e) => { if (e.target === e.currentTarget) setFocus(false); } : undefined}>
      {focus && <div className="focus-rotate-hint">Drehe dein Gerät quer für mehr Platz</div>}
      {smartChipsEl}
      {outlookEl}
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

      {/* F-CARD-UI: leave any time (no dialog) + non-blocking "genug für heute" hint */}
      <div className="run-bar p-controls">
        {runRef.current && runRef.current.cards >= (getCfg().GENUG_KARTEN || 40) && !enoughAck && (
          <div className="enough-hint">
            <span>Genug für heute? Du hast schon {runRef.current.cards} Karten geübt.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setEnoughAck(true)}>Weiter</button>
          </div>
        )}
        <button className="btn btn-ghost btn-sm run-leave" onClick={leaveRun}><Icon name="x" size={13} /> Lektion verlassen</button>
      </div>

      {/* card (F-CARD-UI: round-progress header + Wasserstand footer ON the card) */}
      <div className="card-scene p-card">
        {roundProgressEl}
        <div className="card-frame">
        <button className="card-expand" title={focus ? "Fokus verlassen (Esc)" : "Karte vergrössern"}
          onClick={() => setFocus((f) => !f)}>
          <Icon name={focus ? "x" : "expand"} size={16} />
        </button>
        {/* B2: one audio button, fixed top-left of the card across all modes/faces */}
        {hasTTS(face === "front" ? srcLang : tgtLang) && (
          <button className={"audio-btn card-audio" + (playing ? " playing" : "")} title="Hör es"
            onClick={(e) => { e.stopPropagation(); const k = face === "front" ? srcKey : tgtKey; playAudio(sideText(current, k), face === "front" ? srcLang : tgtLang); }}>
            <Icon name="volume" size={16} />
          </button>
        )}
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
        </div>
        </div>
        {masteryBar}
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
                <button className="btn btn-ghost btn-sm" onClick={() => finish(latinL3Answer ? scoreLatinForm("", current.lernform || "", answerOpts()) : scoreAnswer("", scoreTarget(current, tgtKey), answerOpts()), false)}>
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

      {/* sporadic study tip at a natural pause (Phase 6) */}
      <TipPopup tip={tip} onClose={() => setTip(null)} />
    </div>
  );
}
