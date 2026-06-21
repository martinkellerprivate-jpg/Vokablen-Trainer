import { useState, useMemo } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { Ring, toneColor, pct } from "../ui/Ring";
import { wordsForSelection, classifyWord, CATEGORY } from "../lib/engine";
import { PAIRS, NATIVE, practiceable, isLatinPair } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";
import { buildInsights } from "../lib/insights";
import { ListSelector } from "./ListSelector";

/* ===================================================================
 * stats.jsx — detailed scoring: overall + category + word-by-word.
 * =================================================================== */
export function Stats() {
  const store = useStore();
  const toast = useToast();
  const { vocab, stats, meta, settings } = store;
  const pair = settings.pair;
  const P = PAIRS[pair] || PAIRS["en-de"];
  const foreign = P.foreign;
  const srcKey = foreign;            // word column = foreign; translation = native
  const isLat = isLatinPair(pair);
  const fgnOf = (w) => isLat ? latinHeadword(w) : (w[foreign] || "");

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "priority", dir: 1 });
  const [resetOpen, setResetOpen] = useState(false);

  const rows = useMemo(() => wordsForSelection(vocab.filter((w) => w.pair === pair), stats, settings.statLists, settings.masteryCorrect).map((w) => {
    const s = stats[w.id];
    const seen = s ? s.seen : 0;
    const acc = s && seen ? s.scoreSum / seen : 0;
    const cat = !practiceable(w) ? "new" : classifyWord(s, settings.masteryCorrect);
    const ema = s ? s.ema : 0;
    const history = s ? s.history : [];
    const priority = cat === "tricky" ? 0 : cat === "new" ? 1 : cat === "learned" ? 2 : 3;
    return { w, seen, acc, cat, ema, history, priority };
  }), [vocab, stats, settings.statLists, settings.masteryCorrect, pair]);

  const counts = useMemo(() => {
    const c = { effortless: 0, learned: 0, tricky: 0, new: 0 };
    rows.forEach((r) => c[r.cat]++);
    return c;
  }, [rows]);

  const totals = useMemo(() => {
    let seenSum = 0, scoreSum = 0;
    rows.forEach((r) => { const s = stats[r.w.id]; if (s) { seenSum += s.seen; scoreSum += s.scoreSum; } });
    const mastered = counts.effortless + counts.learned;
    return {
      mastered, total: rows.length,
      overallAcc: seenSum ? scoreSum / seenSum : 0,
      reviews: seenSum,
    };
  }, [rows, stats, counts]);

  const view = useMemo(() => {
    const q = query.toLowerCase().trim();
    let list = rows.filter((r) =>
      (filter === "all" || r.cat === filter) &&
      (!q || fgnOf(r.w).toLowerCase().includes(q) || (r.w[NATIVE] || "").toLowerCase().includes(q)));
    const k = sort.key;
    list = [...list].sort((a, b) => {
      let av, bv;
      if (k === "word") { av = fgnOf(a.w).toLowerCase(); bv = fgnOf(b.w).toLowerCase(); return av < bv ? -sort.dir : av > bv ? sort.dir : 0; }
      if (k === "acc") { av = a.acc; bv = b.acc; }
      else if (k === "seen") { av = a.seen; bv = b.seen; }
      else { av = a.priority * 1000 - a.acc * 100; bv = b.priority * 1000 - b.acc * 100; } // priority
      return (av - bv) * sort.dir;
    });
    return list;
  }, [rows, filter, query, sort, srcKey]);

  const goalP = Math.min(1, (meta.todayCount || 0) / (settings.dailyGoal || 20));
  const setSortKey = (key) => setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: key === "word" ? 1 : -1 });

  // rule-based insights (Phase 6) — respects the statLists selection
  const insights = useMemo(() => buildInsights(rows.map((r) => r.w), stats, pair, settings.masteryCorrect), [rows, stats, pair, settings.masteryCorrect]);

  const resetAll = () => { store.resetStats(); setResetOpen(false); toast("All progress reset", "refresh"); };
  const resetSelected = () => { const ids = rows.map((r) => r.w.id); store.resetStatsForWords(ids); setResetOpen(false); toast(`Progress reset for ${ids.length} word${ids.length === 1 ? "" : "s"}`, "refresh"); };

  const StatCard = ({ icon, k, v, sub, color }) => (
    <div className="stat-card">
      <div className="k"><Icon name={icon} size={15} style={{ color: color || "var(--ink-soft)" }} /> {k}</div>
      <div className="v" style={{ color }}>{v}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );

  return (
    <div>
      <ListSelector selected={settings.statLists} onChange={(s) => store.setSettings({ statLists: s })} pair={pair} mc={settings.masteryCorrect} />

      {/* insights (Phase 6) */}
      <div className="panel" style={{ padding: "16px 18px", marginBottom: 22 }}>
        <div className="section-title" style={{ marginBottom: insights.enoughData ? 12 : 6 }}>Deine Stärken & nächste Schritte</div>
        {!insights.enoughData ? (
          <div className="muted" style={{ fontSize: 13.5 }}>{insights.items[0].text}</div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {insights.items.map((it, i) => (
              <div key={i} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <span className="badge" style={{ flex: "0 0 auto", marginTop: 1, background: `var(--${it.tone}-bg)`, color: toneColor(it.tone) }}>
                  <span className="dot" style={{ background: toneColor(it.tone) }} />
                  {it.kind === "strength" ? "Stärke" : it.kind === "focus" ? "Übungstipp" : "Nächster Schritt"}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.45 }}>{it.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* overall */}
      <div className="stat-grid">
        <StatCard icon="sparkle" k="Mastered" v={`${totals.mastered}/${totals.total}`}
          sub={`${pct(totals.total ? totals.mastered / totals.total : 0)}% of your words`} color="var(--green)" />
        <StatCard icon="target" k="Overall accuracy" v={`${pct(totals.overallAcc)}%`}
          sub={`across ${totals.reviews} answers`} color="var(--amber-deep)" />
        <StatCard icon="flame" k="Day streak" v={meta.streak || 0}
          sub={meta.streak ? "keep it going!" : "practise today to start"} color="var(--red)" />
        <div className="stat-card">
          <div className="k"><Icon name="target" size={15} /> Today's goal</div>
          <div className="row" style={{ gap: 12, marginTop: 8, alignItems: "center" }}>
            <Ring value={goalP} size={48} stroke={6} />
            <div>
              <div className="v" style={{ fontSize: 26, margin: 0 }}>{meta.todayCount || 0}<span className="faint" style={{ fontSize: 16 }}>/{settings.dailyGoal || 20}</span></div>
              <div className="sub">cards today</div>
            </div>
          </div>
        </div>
      </div>

      {/* categories */}
      <div className="section-title" style={{ marginBottom: 12 }}>How your words are doing</div>
      <div className="cat-grid">
        {["effortless", "learned", "tricky", "new"].map((key) => {
          const c = CATEGORY[key];
          const n = counts[key];
          return (
            <button key={key} className="cat-card" aria-pressed={filter === key}
              onClick={() => setFilter(filter === key ? "all" : key)}>
              <div className="top">
                <span className="nm" style={{ color: toneColor(c.tone) }}>{c.label}</span>
                <span className="num">{n}</span>
              </div>
              <div className="bl">{c.blurb}</div>
              <div className="meter"><i style={{ width: (rows.length ? (n / rows.length) * 100 : 0) + "%", background: toneColor(c.tone) }} /></div>
            </button>
          );
        })}
      </div>

      {/* word-by-word */}
      <div className="bar" style={{ marginTop: 22 }}>
        <div className="section-title grow">Word by word</div>
        {filter !== "all" && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter("all")}>
            <Icon name="x" size={14} /> Clear filter: {CATEGORY[filter].label}
          </button>
        )}
        <div className="search" style={{ flex: "0 0 220px" }}>
          <Icon name="search" size={17} />
          <input className="field" placeholder="Find a word…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="vt">
          <thead>
            <tr>
              <th className="sortable" onClick={() => setSortKey("word")}>Word</th>
              <th>Translation</th>
              <th>Status</th>
              <th className="sortable" onClick={() => setSortKey("acc")} style={{ width: 150 }}>Accuracy</th>
              <th className="sortable" onClick={() => setSortKey("seen")} style={{ width: 80 }}>Seen</th>
              <th style={{ width: 130 }}>Recent</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.w.id}>
                <td className="cell-en">{fgnOf(r.w)}<div className="faint" style={{ fontSize: 11.5 }}>{r.w.topic}</div></td>
                <td className="cell-de">{r.w[NATIVE]}</td>
                <td><span className={"badge " + CATEGORY[r.cat].tone}><span className="dot" />{CATEGORY[r.cat].label}</span></td>
                <td>
                  {r.seen ? (
                    <div className="acc">
                      <div className="acc-track"><i style={{ width: pct(r.acc) + "%", background: r.acc >= .8 ? "var(--green)" : r.acc >= .5 ? "var(--amber)" : "var(--red)" }} /></div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pct(r.acc)}%</span>
                    </div>
                  ) : <span className="faint">—</span>}
                </td>
                <td><span style={{ fontWeight: 600 }}>{r.seen || <span className="faint">0</span>}</span></td>
                <td>
                  <span className="spark">
                    {r.history.slice(-8).map((h, i) => (
                      <i key={i} className={h.verdict === "correct" ? "c" : h.verdict === "almost" ? "a" : "w"} />
                    ))}
                    {!r.history.length && <span className="faint" style={{ fontSize: 12 }}>not seen</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!view.length && <div className="empty"><div className="big">Nothing here yet</div><div>Practise some cards to see them appear.</div></div>}
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setResetOpen(true)}>
          <Icon name="refresh" size={14} /> Reset progress
        </button>
      </div>

      {resetOpen && (
        <div className="modal-backdrop" onClick={() => setResetOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <div className="modal-title">Reset progress</div>
              <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => setResetOpen(false)}><Icon name="x" size={16} /></button>
            </div>
            <div className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>This clears scores and history. Your words and lists are kept.</div>
            <div className="picker-list">
              <button className="picker-row" style={{ textAlign: "left", opacity: settings.statLists.length ? 1 : .5, cursor: settings.statLists.length ? "pointer" : "not-allowed" }}
                disabled={!settings.statLists.length} onClick={resetSelected}>
                <Icon name="filter" size={16} />
                <span className="grow"><b>Selected lists only</b><div className="muted" style={{ fontSize: 12.5, fontWeight: 400 }}>{settings.statLists.length ? `${rows.length} word${rows.length === 1 ? "" : "s"} in your current selection` : "Pick one or more lists above first"}</div></span>
              </button>
              <button className="picker-row" style={{ textAlign: "left" }} onClick={resetAll}>
                <Icon name="refresh" size={16} />
                <span className="grow"><b>Everything</b><div className="muted" style={{ fontSize: 12.5, fontWeight: 400 }}>All lists, both languages, and the day streak</div></span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
