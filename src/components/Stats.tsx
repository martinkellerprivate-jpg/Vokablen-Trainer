import { useState, useMemo } from "react";
import { useStore } from "../store/StoreProvider";
import { useToast } from "../ui/Toast";
import { Icon } from "../ui/Icon";
import { Ring, toneColor, pct } from "../ui/Ring";
import { wordsForSelection, resolveSmart } from "../lib/engine";
import { deriveProfile, retentionFor, STUFE_ORDER } from "../lib/fsrs";
import { PAIRS, NATIVE, practiceable, isLatinPair } from "../lib/pairs";
import { latinHeadword } from "../lib/latin";
import { buildInsights } from "../lib/insights";
import { ListSelector } from "./ListSelector";

// V14: the four FSRS levels (one source). Tone/labels match V13 STUFE.
const STUFE_META: Record<string, any> = {
  sitzt:             { label: "Sitzt",           tone: "green", blurb: "Sitzt sicher — hält lange." },
  sitzt_fast:        { label: "Sitzt fast",      tone: "amber", blurb: "Fast da — noch ein paar Wiederholungen." },
  sitzt_schlecht:    { label: "Wackelt noch",    tone: "red",   blurb: "Wackelt noch — kommt öfter zurück." },
  neu:               { label: "Neu / frisch",   tone: "blue",  blurb: "Frisch gelernt — noch jung." },
  noch_nicht_geuebt: { label: "Noch nicht geübt", tone: "slate", blurb: "Noch nicht geübt." },
};
const STUFE_KEYS = STUFE_ORDER;
// F-WORTLISTE: "Hält" as a circle — full ring = one month (~30 days).
function haeltCircle(p: any) {
  if (p.haeltTage == null || p.haeltTage <= 0) return <span className="faint">—</span>;
  const d = Math.round(p.haeltTage);
  return (
    <div className="haelt-cell" title={`hält etwa ${d} Tage`}>
      <Ring value={Math.min(1, p.haeltTage / 30)} size={30} stroke={4} />
      <span className="haelt-d">{d} T</span>
    </div>
  );
}

/* ===================================================================
 * stats.jsx — detailed scoring: overall + category + word-by-word.
 * =================================================================== */
export function Stats() {
  const store = useStore();
  const toast = useToast();
  const { vocab, stats, meta, settings, lessons } = store;
  const pair = settings.pair;
  const goPractice = (sel: string) => { store.setSettings({ practiceSel: sel }); window.dispatchEvent(new CustomEvent("vt-tab", { detail: "practice" })); };
  const P = PAIRS[pair] || PAIRS["en-de"];
  const foreign = P.foreign;
  const srcKey = foreign;            // word column = foreign; translation = native
  const isLat = isLatinPair(pair);
  const fgnOf = (w) => isLat ? latinHeadword(w) : (w[foreign] || "");

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "priority", dir: 1 });
  const [resetOpen, setResetOpen] = useState(false);

  const ret = retentionFor(settings);
  const rows = useMemo(() => wordsForSelection(vocab.filter((w) => w.pair === pair), stats, settings.statLists, settings.masteryCorrect, lessons).map((w) => {
    const s = stats[w.id];
    const seen = s ? s.seen : 0;
    const acc = s && seen ? s.scoreSum / seen : 0;
    const prof = deriveProfile(s?.fsrs, ret);
    const stufe = !practiceable(w) ? "noch_nicht_geuebt" : prof.stufe;   // V14: one source
    const history = s ? s.history : [];
    const priority = stufe === "sitzt_schlecht" ? 0 : stufe === "noch_nicht_geuebt" ? 1 : stufe === "sitzt_fast" ? 2 : 3;
    return { w, seen, acc, stufe, prof, history, priority };
  }), [vocab, stats, settings.statLists, ret, pair, lessons]);

  const counts = useMemo(() => {
    const c: any = { sitzt: 0, sitzt_fast: 0, sitzt_schlecht: 0, neu: 0, noch_nicht_geuebt: 0 };
    rows.forEach((r) => c[r.stufe]++);
    return c;
  }, [rows]);

  const totals = useMemo(() => {
    let seenSum = 0, scoreSum = 0;
    rows.forEach((r) => { const s = stats[r.w.id]; if (s) { seenSum += s.seen; scoreSum += s.scoreSum; } });
    const mastered = counts.sitzt;
    return {
      mastered, total: rows.length,
      overallAcc: seenSum ? scoreSum / seenSum : 0,
      reviews: seenSum,
    };
  }, [rows, stats, counts]);

  const view = useMemo(() => {
    const q = query.toLowerCase().trim();
    let list = rows.filter((r) =>
      (filter === "all" || r.stufe === filter) &&
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

  // F-STATS-INSIGHTS: FSRS-driven strengths & next steps (real numbers + actions).
  const fgnOfId = (id: string) => { const w = vocab.find((x: any) => x.id === id); return w ? fgnOf(w) : ""; };
  const insights = useMemo(() => {
    const steps: any[] = [];
    // strength: topic with the highest mean stability among words that sit
    const byTopic: Record<string, { s: number; n: number }> = {};
    for (const r of rows) { if (r.stufe === "sitzt" && r.w.topic) { const t = byTopic[r.w.topic] || (byTopic[r.w.topic] = { s: 0, n: 0 }); t.s += r.prof.haeltTage; t.n++; } }
    let strength: any = null;
    for (const [t, v] of Object.entries(byTopic)) { if (v.n >= 2 && (!strength || v.s / v.n > strength.avg)) strength = { topic: t, n: v.n, avg: v.s / v.n }; }
    // next steps (each only if it applies)
    const bald = rows.filter((r) => r.prof.baldFaellig);
    if (bald.length) steps.push({ tone: "amber", text: `${bald.length} ${bald.length === 1 ? "Wort wird" : "Wörter werden"} bald fällig — heute auffrischen.`, action: { label: "Üben", sel: "smart:baldfaellig" } });
    const leech = rows.filter((r) => r.prof.istLeech);
    if (leech.length) steps.push({ tone: "red", text: `${leech.length} hartnäckig (z. B. ${fgnOfId(leech[0].w.id)}) — eine Eselsbrücke hilft.`, action: { label: "Üben", sel: "smart:leech" } });
    const c = retentionFor(settings);
    const kvs = rows.filter((r) => { const s = stats[r.w.id]?.fsrs?.stability || 0; return s >= 14 * 0.7 && s < 14; });
    if (kvs.length) steps.push({ tone: "green", text: `${kvs.length} kurz vor „sitzt" — ein Durchgang reicht.`, action: { label: "Üben", sel: "smart:kurzvorsitzt" } });
    for (const l of (lessons || [])) {
      if (l.pair !== pair || !l.dueDate) continue;
      const days = Math.ceil((l.dueDate - Date.now()) / 86400000);
      if (days < 0 || days > 14) continue;
      const risk = (l.members || []).filter((id: string) => { const st = deriveProfile(stats[id]?.fsrs, c).stufe; return st === "sitzt_schlecht" || st === "neu" || st === "noch_nicht_geuebt"; }).length;
      if (risk > 0) { steps.push({ tone: "red", text: `Prüfung „${l.name}" in ${days} T — ${risk} noch wackelig.`, action: { label: "Gefährdete üben", sel: "lesson:" + l.id } }); break; }
    }
    return { strength, steps, enough: !!strength || steps.length > 0 };
  }, [rows, stats, lessons, pair, settings, vocab]);

  // F-STATS-STRUKTUR: percentages that sum to exactly 100 (largest remainder).
  const pctMap: Record<string, number> = useMemo(() => {
    const total = rows.length; if (!total) return {};
    const parts = STUFE_KEYS.map((k) => { const exact = counts[k] / total * 100; return { k, f: Math.floor(exact), rem: exact - Math.floor(exact) }; });
    let left = 100 - parts.reduce((a, b) => a + b.f, 0);
    parts.slice().sort((a, b) => b.rem - a.rem).forEach((p) => { if (left > 0) { p.f++; left--; } });
    const m: Record<string, number> = {}; parts.forEach((p) => { m[p.k] = p.f; }); return m;
  }, [counts, rows.length]);

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
      <ListSelector selected={settings.statLists} onChange={(s) => store.setSettings({ statLists: s })} pair={pair} mc={settings.masteryCorrect} smart={[]} />

      {/* F-STATS-INSIGHTS: Stärken & nächste Schritte (versteckt wenn nichts Substanzielles) */}
      {insights.enough && (
        <div className="panel" style={{ padding: "16px 18px", marginBottom: 22 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>Deine Stärken & nächste Schritte</div>
          <div className="col" style={{ gap: 10 }}>
            {insights.strength && (
              <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <span className="badge green" style={{ flex: "0 0 auto", marginTop: 1 }}><span className="dot" />Stärke</span>
                <span style={{ fontSize: 14, lineHeight: 1.45 }}>Stark in <b>{insights.strength.topic}</b> — {insights.strength.n} {insights.strength.n === 1 ? "Wort sitzt" : "Wörter sitzen"}, halten ~{Math.round(insights.strength.avg)} Tage.</span>
              </div>
            )}
            {insights.steps.map((it: any, i: number) => (
              <div key={i} className="row" style={{ gap: 10, alignItems: "center" }}>
                <span className="badge" style={{ flex: "0 0 auto", background: `var(--${it.tone}-bg)`, color: toneColor(it.tone) }}><span className="dot" style={{ background: toneColor(it.tone) }} />Schritt</span>
                <span className="grow" style={{ fontSize: 14, lineHeight: 1.45 }}>{it.text}</span>
                {it.action && <button className="btn btn-sm" onClick={() => goPractice(it.action.sel)}>{it.action.label}</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* overall */}
      <div className="stat-grid">
        <StatCard icon="sparkle" k="Mastered" v={`${totals.mastered}/${totals.total}`}
          sub={`${pct(totals.total ? totals.mastered / totals.total : 0)}% of your words`} color="var(--green)" />
        <StatCard icon="target" k="Overall accuracy" v={`${pct(totals.overallAcc)}%`}
          sub={`across ${totals.reviews} answers`} color="var(--amber-deep)" />
        <StatCard icon="flame" k="Tage in Folge" v={meta.streak || 0}
          sub={meta.streak ? "dranbleiben!" : "heute üben startet die Serie"} color="var(--red)" />
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

      {/* F-STATS-STRUKTUR: Stufen = EINE Verteilungslinie + Legende (eine Achse) */}
      <div className="section-title" style={{ marginBottom: 10 }}>Wie deine Wörter sitzen</div>
      <div className="panel" style={{ padding: "14px 16px", marginBottom: 22 }}>
        {rows.length ? (
          <>
            <div className="stufe-band" style={{ height: 16, marginBottom: 12 }}>
              {STUFE_KEYS.map((k) => counts[k] ? <i key={k} style={{ flex: counts[k], background: toneColor(STUFE_META[k].tone) }} title={`${STUFE_META[k].label}: ${counts[k]}`} /> : null)}
            </div>
            <div className="stufe-legend">
              {STUFE_KEYS.map((k) => (
                <button key={k} className="leg-item" aria-pressed={filter === k} title={STUFE_META[k].blurb}
                  onClick={() => setFilter(filter === k ? "all" : k)}>
                  <span className="dot" style={{ background: toneColor(STUFE_META[k].tone) }} />
                  <span className="leg-label">{STUFE_META[k].label}</span>
                  <span className="leg-n">{counts[k]} · {pctMap[k] || 0}%</span>
                </button>
              ))}
            </div>
          </>
        ) : <div className="muted" style={{ fontSize: 13.5 }}>Noch keine Wörter in dieser Auswahl.</div>}
      </div>

      {/* F-STATS-STRUKTUR: smarte Listen = optionale Fokus-Filter, quer zu den Stufen */}
      <div className="section-title" style={{ marginBottom: 4 }}>Worauf du dich konzentrieren kannst</div>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Optionale Fokus-Listen — quer zu den Stufen. Tippen startet sofort das Üben.</div>
      <div className="lchips" style={{ justifyContent: "flex-start", marginBottom: 18 }}>
        {[{ k: "leech", label: "Hartnäckig", tone: "red", help: "Oft vergessen trotz Übung — brauchen eine Eselsbrücke" },
          { k: "frischfragil", label: "Frisch & fragil", tone: "amber", help: "Gerade gelernt, noch wackelig" },
          { k: "kurzvorsitzt", label: "Kurz vor „sitzt\"", tone: "green", help: "Fast dauerhaft — ein Schubs reicht" }].map((c) => {
          const n = resolveSmart(c.k, vocab.filter((w) => w.pair === pair), stats, settings.masteryCorrect, { retention: ret }).filter(practiceable).length;
          return (
            <button key={c.k} className={"lchip lchip-smart tone-" + c.tone} title={c.help} disabled={!n}
              onClick={() => goPractice("smart:" + c.k)}>
              <Icon name="target" size={13} /> {c.label} <span className="lchip-n">{n}</span>
            </button>
          );
        })}
      </div>

      {/* word-by-word */}
      <div className="bar" style={{ marginTop: 22 }}>
        <div className="section-title grow">Word by word</div>
        {filter !== "all" && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter("all")}>
            <Icon name="x" size={14} /> Filter aufheben: {STUFE_META[filter].label}
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
              <th style={{ width: 90 }}>Hält</th>
              <th className="sortable" onClick={() => setSortKey("acc")} style={{ width: 140 }}>Treffer</th>
              <th className="sortable" onClick={() => setSortKey("seen")} style={{ width: 70 }}>Geübt</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.w.id}>
                <td className="cell-en">{fgnOf(r.w)}<div className="faint" style={{ fontSize: 11.5 }}>{r.w.topic}</div></td>
                <td className="cell-de">{r.w[NATIVE]}</td>
                <td>
                  <span className={"badge " + STUFE_META[r.stufe].tone}><span className="dot" />{STUFE_META[r.stufe].label}</span>
                  {r.prof.istLeech && <span className="badge red" style={{ marginLeft: 5 }}><Icon name="flame" size={11} /> Hartnäckig</span>}
                </td>
                <td>{haeltCircle(r.prof)}</td>
                <td>
                  {r.seen ? (
                    <div className="acc">
                      <div className="acc-track"><i style={{ width: pct(r.acc) + "%", background: r.acc >= .8 ? "var(--green)" : r.acc >= .5 ? "var(--amber)" : "var(--red)" }} /></div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{pct(r.acc)}%</span>
                    </div>
                  ) : <span className="faint">—</span>}
                </td>
                <td><span style={{ fontWeight: 600 }}>{r.seen || <span className="faint">0</span>}</span></td>
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
