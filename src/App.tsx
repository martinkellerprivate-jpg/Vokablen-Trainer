/* ===================================================================
 * app.tsx — shell: header (streak / daily goal), tabs, pair switcher.
 * =================================================================== */
import { useState, useEffect } from "react";
import { useStore } from "./store/StoreProvider";
import { useAuth } from "./sync/auth";
import { useSync } from "./sync/SyncBridge";
import { Icon } from "./ui/Icon";
import { Ring } from "./ui/Ring";
import { PAIRS } from "./lib/pairs";
import { AccountModal } from "./components/AccountModal";
import { ImportShareModal } from "./components/ImportShareModal";
import { ImportContext } from "./components/importContext";
import { LearnTips } from "./components/LearnTips";
import { Practice } from "./components/Practice";
import { WordList } from "./components/WordList";
import { Stats } from "./components/Stats";
import { SettingsTab } from "./components/SettingsTab";

const SYNC_DOT: Record<string, string> = {
  local: "var(--ink-faint)", syncing: "var(--amber)", synced: "var(--green)", offline: "var(--ink-faint)", error: "var(--red)",
};

function Header() {
  const { meta, vocab, settings } = useStore();
  const auth = useAuth();
  const { status } = useSync();
  const [accountOpen, setAccountOpen] = useState(false);
  const pair = settings.pair;
  const p = PAIRS[pair] || PAIRS["en-de"];
  const nWords = vocab.filter((w: any) => w.pair === pair).length;
  const goalP = Math.min(1, (meta.todayCount || 0) / (settings.dailyGoal || 20));
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <div>
          <div className="brand-name">Lilly-Anne’s Vokabeltrainer</div>
          <div className="brand-sub">{p.foreignLabel} ⇄ {p.nativeLabel} · {nWords} words</div>
        </div>
      </div>
      <div className="topbar-spacer" />
      {auth.configured && (
        <>
          <button className="tipbtn" title="Account & Sync" onClick={() => setAccountOpen(true)} style={{ gap: 8 }}>
            <span className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: SYNC_DOT[status] }} />
            {auth.user ? "Konto" : "Anmelden"}
          </button>
          <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
        </>
      )}
      <LearnTips />
      <div className="metric" title="Days practised in a row">
        <span className="ic" style={{ color: "var(--red)" }}><Icon name="flame" size={19} /></span>
        <div><b>{meta.streak || 0}</b><small>day streak</small></div>
      </div>
      <div className="metric" title="Cards practised today">
        <span className="ic"><Ring value={goalP} size={26} stroke={4} /></span>
        <div><b>{meta.todayCount || 0}/{settings.dailyGoal || 20}</b><small>today's goal</small></div>
      </div>
    </div>
  );
}

function PairSwitcher() {
  const { settings, setSettings } = useStore();
  const pair = settings.pair;
  return (
    <div className="pairbar">
      <div className="pairseg">
        {Object.values(PAIRS).map((p) => (
          <button key={p.id} className={pair === p.id ? "on" : ""}
            onClick={() => { if (pair !== p.id) setSettings({ pair: p.id, selectedLists: [], statLists: [] }); }}>
            {p.foreignLabel} ⇄ {p.nativeLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { id: "practice", label: "Practise", icon: "cards" },
  { id: "words", label: "Word List", icon: "list" },
  { id: "stats", label: "Statistics", icon: "chart" },
  { id: "settings", label: "Settings", icon: "gear" },
];

export function App() {
  const { vocab, settings } = useStore();
  const nWords = vocab.filter((w: any) => w.pair === settings.pair).length;
  const [tab, setTab] = useState(() => localStorage.getItem("vt_v1_tab") || "practice");
  useEffect(() => { localStorage.setItem("vt_v1_tab", tab); }, [tab]);

  // appearance: apply the active skin to the document root (Phase 6 CR)
  useEffect(() => { document.documentElement.dataset.skin = settings.skin || "paper"; }, [settings.skin]);

  // shared-list import: top-level modal, opened by the toolbar or a #share= link
  const [importOpen, setImportOpen] = useState(false);
  const [importToken, setImportToken] = useState<string | null>(null);
  const openImport = (token?: string | null) => { setImportToken(token ?? null); setImportOpen(true); };
  useEffect(() => {
    const m = location.hash.match(/#share=([A-Za-z0-9]+)/);
    if (m) {
      openImport(m[1]);
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, []);

  return (
    <ImportContext.Provider value={{ openImport }}>
    <div className="app">
      <Header />
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} className="tab" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={17} /> {t.label}
            {t.id === "words" && <span className="badge-count">{nWords}</span>}
          </button>
        ))}
      </div>
      {tab !== "settings" && <PairSwitcher />}
      {tab === "practice" && <Practice />}
      {tab === "words" && <WordList />}
      {tab === "stats" && <Stats />}
      {tab === "settings" && <SettingsTab />}
      <ImportShareModal open={importOpen} initialToken={importToken} onClose={() => setImportOpen(false)} />
    </div>
    </ImportContext.Provider>
  );
}
