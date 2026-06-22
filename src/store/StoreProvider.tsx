/* React state layer over the pure lib/* logic: holds the five vt_v1_*
 * documents, persists them to localStorage, and exposes the store API
 * (recordAttempt updates stats + meta exactly as the prototype did). */
import React from "react";
import { LS, load, save } from "../lib/storage";
import { newId } from "../lib/ids";
import { RECOMMENDED } from "../lib/defaults";
import { DEFAULT_VOCAB } from "../data/seed";
import { migrateTopics, lessonsForLists, swissifyVocab, migrateLessonsStatic } from "../lib/migrate";
import { deriveRating, gradeFromCard, initialCard, retentionFor, RETENTION } from "../lib/fsrs";
import type { SessionOutcome, SerializedCard } from "../lib/fsrs";
import type { Word, ListT } from "../lib/types";

function seedVocab(): Word[] {
  return DEFAULT_VOCAB.map((w) => ({ id: newId(), ...w, pair: "en-de", review: false, source: "seed" })) as Word[];
}

const todayStr = () => new Date().toDateString();
const yesterdayStr = () => {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString();
};

/* One-time load + migration: guarantees a list exists and every word
 * carries a `lists` array. Legacy words are folded into a default list. */
export function initData() {
  let lists = load(LS.lists, null);
  let vocab = load(LS.vocab, null);
  if (!vocab || !vocab.length) vocab = seedVocab();
  if (!lists || !lists.length) {
    const def = { id: newId(), name: "Starter Words", pair: "en-de", createdAt: Date.now() };
    lists = [def];
    vocab = vocab.map((w: Word) => ({ ...w, pair: w.pair || "en-de", lists: (w.lists && w.lists.length) ? w.lists : [def.id] }));
  } else {
    lists = lists.map((l: ListT) => ({ ...l, pair: l.pair || "en-de" }));
    vocab = vocab.map((w: Word) => ({ ...w, pair: w.pair || "en-de", lists: Array.isArray(w.lists) ? w.lists : [] }));
  }
  return { vocab, lists };
}

export const StoreContext = React.createContext<any>(null);
export const useStore = () => React.useContext(StoreContext);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const initRef = React.useRef<any>(null);
  if (!initRef.current) initRef.current = initData();
  const [vocab, setVocabState] = React.useState(initRef.current.vocab);
  const [lists, setListsState] = React.useState(initRef.current.lists);
  const [lessons, setLessonsState] = React.useState(() => load(LS.lessons, []));
  const [stats, setStats] = React.useState(() => load(LS.stats, {}));
  const [meta, setMeta] = React.useState(() => load(LS.meta, {
    lastDate: null, streak: 0, todayCount: 0, dailyGoal: 20, totalReviews: 0,
  }));
  const [settings, setSettings] = React.useState(() => {
    // Addendum §2: default direction is German → foreign (n2f).
    const loaded = load(LS.settings, {});
    const s = { direction: "n2f", pair: "en-de", selectedLists: [], statLists: [], practiceSel: "", ...RECOMMENDED, ...loaded };
    if (s.direction === "en2de") s.direction = "f2n";
    if (s.direction === "de2en") s.direction = "n2f";
    if (s.articleMode == null) s.articleMode = s.requireArticle ? "required-full" : "required-partial";
    // V13: targetRetention is the source. Migrate an existing lernIntensity choice
    // into it once (so a user on "intensiv" keeps 0.95, not the default 0.9).
    if (loaded.targetRetention == null && loaded.lernIntensity) s.targetRetention = RETENTION[loaded.lernIntensity] ?? 0.9;
    return s;
  });

  // --- sync glue (Phase 3) ----------------------------------------
  // applyRemote() writes a doc from the cloud WITHOUT marking it dirty.
  // registerSync() lets the sync bridge hear local (user-driven) changes.
  const remoteKeys = React.useRef<Set<string>>(new Set());
  const onLocalChange = React.useRef<((key: string) => void) | null>(null);
  const setterFor: Record<string, (v: any) => void> = {
    vocab: setVocabState, lists: setListsState, lessons: setLessonsState, stats: setStats, meta: setMeta, settings: setSettings,
  };
  const applyRemote = React.useCallback((key: string, data: any) => {
    remoteKeys.current.add(key);
    setterFor[key]?.(data);
  }, []);
  const registerSync = React.useCallback((cb: ((key: string) => void) | null) => { onLocalChange.current = cb; }, []);
  const persist = (key: string, lsKey: string, value: any) => {
    save(lsKey, value);
    if (remoteKeys.current.has(key)) { remoteKeys.current.delete(key); return; }
    onLocalChange.current?.(key);
  };

  React.useEffect(() => persist("vocab", LS.vocab, vocab), [vocab]);
  React.useEffect(() => persist("lists", LS.lists, lists), [lists]);
  React.useEffect(() => persist("lessons", LS.lessons, lessons), [lessons]);
  React.useEffect(() => persist("stats", LS.stats, stats), [stats]);
  React.useEffect(() => persist("meta", LS.meta, meta), [meta]);
  React.useEffect(() => persist("settings", LS.settings, settings), [settings]);

  // One-time, versioned data migrations (recorded in meta.migrations).
  const migratedRef = React.useRef(false);
  React.useEffect(() => {
    if (migratedRef.current) return;
    migratedRef.current = true;
    const done = (meta.migrations || {}) as Record<string, boolean>;
    const applied: Record<string, boolean> = {};
    if (!done.topicsDe) { setVocabState((v: any) => migrateTopics(v)); applied.topicsDe = true; } // V4
    if (!done.swissV3) { setVocabState((v: any) => swissifyVocab(v)); applied.swissV3 = true; } // V3 — ß → ss
    if (!done.lessonsV6) { // V6 — one list-lesson per existing list
      const add = lessonsForLists(initRef.current.lists, load(LS.lessons, []), newId);
      if (add.length) setLessonsState((les: any) => [...les, ...add]);
      applied.lessonsV6 = true;
    }
    if (!done.lessonsStaticV9) { // V9 — convert all lessons to static snapshots (once)
      setLessonsState((les: any) => migrateLessonsStatic(les, initRef.current.lists, initRef.current.vocab || [], newId));
      applied.lessonsStaticV9 = true;
    }
    if (Object.keys(applied).length) {
      setMeta((prev: any) => ({ ...prev, migrations: { ...(prev.migrations || {}), ...applied } }));
    }
  }, []);

  const recordAttempt = React.useCallback((wordId: string, score: number, verdict: string, isNew: boolean, errorType: any = null) => {
    setStats((prev: any) => {
      const s = prev[wordId] || {
        seen: 0, scoreSum: 0, correctCount: 0, almostCount: 0, wrongCount: 0,
        firstTry: false, ema: 0, streak: 0, history: [],
      };
      const seen = s.seen + 1;
      const firstTry = s.seen === 0 ? score >= 1 : s.firstTry;
      const a = 0.4;
      const ema = s.seen === 0 ? score : s.ema * (1 - a) + score * a;
      const streak = verdict === "correct" ? (s.streak || 0) + 1 : 0;
      const history = [...s.history, { score, verdict, ts: Date.now(), errorType }].slice(-30);
      return {
        ...prev,
        [wordId]: {
          seen,
          scoreSum: s.scoreSum + score,
          correctCount: s.correctCount + (verdict === "correct" ? 1 : 0),
          almostCount: s.almostCount + (verdict === "almost" ? 1 : 0),
          wrongCount: s.wrongCount + (verdict === "wrong" ? 1 : 0),
          firstTry, ema, streak, history, lastTs: Date.now(),
        },
      };
    });
    setMeta((prev: any) => {
      const today = todayStr();
      let { streak, todayCount, lastDate, newToday } = prev;
      newToday = newToday || 0;
      if (lastDate === today) {
        todayCount += 1;
      } else {
        streak = lastDate === yesterdayStr() ? streak + 1 : 1;
        todayCount = 1;
        newToday = 0;
        lastDate = today;
      }
      if (isNew) newToday += 1;
      return { ...prev, streak, todayCount, lastDate, newToday, totalReviews: prev.totalReviews + 1 };
    });
  }, []);

  // V8 — fire exactly ONE FSRS grade per word per session (at graduation / first
  // resolution). recordAttempt keeps the legacy per-attempt fields; this only
  // touches stat.fsrs. Memorize → deriveRating returns "no-grade" → no-op.
  const gradeWord = React.useCallback((wordId: string, outcome: SessionOutcome, mode: string, baseCard?: SerializedCard) => {
    const rating = deriveRating(outcome, mode);
    if (rating === "no-grade") return;
    setStats((prev: any) => {
      const s = prev[wordId];
      if (!s) return prev;   // recordAttempt runs first, so a legacy stat exists
      // grade from the run-start baseline so exactly one increment happens per
      // session (FIX 1) — not from the live stat already mutated this session.
      const base = baseCard || initialCard(s);
      const fsrsCard = gradeFromCard(base, rating as number, retentionFor(settings));
      return { ...prev, [wordId]: { ...s, fsrs: fsrsCard } };
    });
  }, [settings.targetRetention, settings.lernIntensity]);

  const api = {
    vocab, stats, meta, settings, lists, lessons,
    setVocab: setVocabState,
    setSettings: (patch: any) => setSettings((p: any) => ({ ...p, ...patch })),
    setMeta: (patch: any) => setMeta((p: any) => ({ ...p, ...patch })),
    recordAttempt,
    gradeWord,
    addWord: (w: any) => setVocabState((v: any) => [{ id: newId(), review: false, source: "manual", pair: "en-de", lists: [], ...w }, ...v]),
    addWords: (arr: any[]) => setVocabState((v: any) => [...arr.map((w) => ({ id: newId(), review: false, source: "import", pair: "en-de", lists: [], ...w })), ...v]),
    updateWord: (id: string, patch: any) => setVocabState((v: any) => v.map((w: any) => (w.id === id ? { ...w, ...patch } : w))),
    deleteWord: (id: string) => setVocabState((v: any) => v.filter((w: any) => w.id !== id)),
    replaceVocab: (list: any[]) => setVocabState(list.map((w) => ({ id: w.id || newId(), review: false, source: "import", pair: "en-de", lists: [], ...w }))),
    resetStats: () => { setStats({}); setMeta({ lastDate: null, streak: 0, todayCount: 0, newToday: 0, totalReviews: 0 }); },
    resetStatsForWords: (ids: string[]) => setStats((prev: any) => { const next = { ...prev }; ids.forEach((id) => { delete next[id]; }); return next; }),
    resetSettings: () => setSettings((p: any) => ({ ...p, ...RECOMMENDED })),
    // ---- lists (each new list gets a paired dynamic "whole list" lesson) ----
    // V9: lists and lessons are decoupled — adding a list no longer creates a lesson.
    addList: (name: string, pair: string) => {
      const l = { id: newId(), name: name || "New list", pair: pair || "en-de", createdAt: Date.now() };
      setListsState((ls: any) => [...ls, l]);
      return l.id;
    },
    renameList: (id: string, name: string) => {
      setListsState((ls: any) => ls.map((l: any) => (l.id === id ? { ...l, name } : l)));
    },
    deleteList: (id: string) => {
      setListsState((ls: any) => ls.filter((l: any) => l.id !== id));
      setVocabState((v: any) => v.map((w: any) => ({ ...w, lists: (w.lists || []).filter((x: string) => x !== id) })));
      // lessons are snapshots → unaffected by list deletion
    },
    toggleWordList: (wordId: string, listId: string) => setVocabState((v: any) => v.map((w: any) => w.id === wordId
      ? { ...w, lists: (w.lists || []).includes(listId) ? w.lists.filter((x: string) => x !== listId) : [...(w.lists || []), listId] }
      : w)),
    // ---- lessons (V9: always static snapshots) ----
    addLesson: (lesson: any) => { const id = newId(); const now = Date.now(); setLessonsState((les: any) => [...les, { id, members: [], createdAt: now, updatedAt: now, ...lesson }]); return id; },
    updateLesson: (id: string, patch: any) => setLessonsState((les: any) => les.map((l: any) => (l.id === id ? { ...l, ...patch, updatedAt: Date.now() } : l))),
    deleteLesson: (id: string) => setLessonsState((les: any) => les.filter((l: any) => l.id !== id)),
    setLessons: (next: any[]) => setLessonsState(next),
    addWordsToLesson: (id: string, wordIds: string[]) => setLessonsState((les: any) => les.map((l: any) =>
      l.id === id ? { ...l, members: Array.from(new Set([...(l.members || []), ...wordIds])), updatedAt: Date.now() } : l)),
    removeWordFromLesson: (id: string, wordId: string) => setLessonsState((les: any) => les.map((l: any) =>
      l.id === id ? { ...l, members: (l.members || []).filter((x: string) => x !== wordId), updatedAt: Date.now() } : l)),
    newId,
    // sync glue
    applyRemote,
    registerSync,
  };

  return React.createElement(StoreContext.Provider, { value: api }, children);
}
