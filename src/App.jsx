import { useState, useEffect } from "react";
import './styles.css';

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDN1Yd4s_LWjF9cLUWIhBi8SkNoK87N-_bcAi0QFgaQSCN08LRbpUCpC4r2dhuKQ4AOcry1_IKqvnv/pub?gid=2081265115&single=true&output=csv";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const vals = [];
    let cur = "", inQ = false;
    for (let c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { vals.push(cur); cur = ""; }
      else cur += c;
    }
    vals.push(cur);
    const obj = {};
    headers.forEach((h, i) => (obj[h.trim()] = vals[i] ? vals[i].trim() : ""));
    return obj;
  });
}

function toISO(d) {
  if (!d) return "";
  const p = d.split("/");
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  return d;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function isScotland(f) {
  return f["Home Team"] === "Scotland" || f["Away Team"] === "Scotland";
}

function StageBadge({ stage }) {
  const map = {
    "Group Stage": { cls: "gs", label: "Group" },
    "Round of 32": { cls: "r32", label: "R32" },
    "Round of 16": { cls: "r16", label: "R16" },
    "Quarter-Final": { cls: "qf", label: "QF" },
    "Semi-Final": { cls: "sf", label: "SF" },
    "Final": { cls: "fin", label: "Final" },
    "3rd Place": { cls: "tp", label: "3rd" },
  };
  const s = map[stage] || { cls: "gs", label: stage };
  return <span className={`stage-badge ${s.cls}`}>{s.label}</span>;
}

function ChannelBadge({ ch }) {
  if (!ch || ch === "TBC") return <span className="ch-badge tbc-ch">TBC</span>;
  const cl = ch.toLowerCase().includes("bbc") ? "bbc" : "itv";
  return <span className={`ch-badge ${cl}`}>{ch}</span>;
}

function MatchCard({ f }) {
  const scot = isScotland(f);
  const watching = f["Watching?"] === "TRUE";
  const hs = f["Home Score"], as = f["Away Score"];
  const hasScore = hs !== "" && as !== "";
  const aet = f["AET?"] && f["AET?"] !== "90 mins" ? ` (${f["AET?"]})` : "";
  const grp = f["Group"] ? ` · Grp ${f["Group"]}` : "";
  const location = [f["Venue"], f["City"]].filter(Boolean).join(", ");

  return (
    <div className={`match-card${scot ? " scotland" : ""}${watching ? " watching" : ""}`}>
      <div className="teams-row">
        <span className="teams">
          {f["Home Team"]} <span className="vs">v</span> {f["Away Team"]}
        </span>
        <div className="card-right">
          {hasScore && <span className="score">{hs}–{as}{aet}</span>}
          {watching && (
            <span className="watching-icon" title="Watching">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </span>
          )}
        </div>
      </div>
      <div className="meta">
        <span className="badge">{f["Kick-off (BST)"]} BST</span>
        <StageBadge stage={f["Stage"]} />
        {grp && <span className="badge">{grp}</span>}
        <ChannelBadge ch={f["UK Channel"]} />
        <span className="venue">{location}</span>
      </div>
    </div>
  );
}

function GroupedFixtures({ fixtures }) {
  if (!fixtures.length) return <div className="empty">No matches to show</div>;
  const groups = {};
  fixtures.forEach((f) => {
    const d = toISO(f["Date"]);
    if (!groups[d]) groups[d] = [];
    groups[d].push(f);
  });
  return Object.keys(groups).sort().map((d) => (
    <div key={d}>
      <div className="date-header">{formatDate(d)}</div>
      {groups[d].map((f) => <MatchCard key={f["Match #"]} f={f} />)}
    </div>
  ));
}

function TodayTab({ fixtures }) {
  const today = todayStr();
  const todayF = fixtures.filter((f) => toISO(f["Date"]) === today);
  if (!todayF.length) {
    const upcoming = fixtures.filter((f) => toISO(f["Date"]) > today);
    const nextDate = upcoming.length ? toISO(upcoming[0]["Date"]) : null;
    const nextF = nextDate ? upcoming.filter((f) => toISO(f["Date"]) === nextDate) : [];
    return (
      <>
        <div className="today-hero">No matches today</div>
        {nextF.length > 0 && (
          <>
            <div className="section-title">Next up — {formatDate(nextDate)}</div>
            {nextF.map((f) => <MatchCard key={f["Match #"]} f={f} />)}
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="section-title">Today · {formatDate(today)}</div>
      {todayF.map((f) => <MatchCard key={f["Match #"]} f={f} />)}
    </>
  );
}

function WeekTab({ fixtures }) {
  const today = todayStr();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const endStr = end.toISOString().slice(0, 10);
  const week = fixtures.filter((f) => {
    const d = toISO(f["Date"]);
    return d >= today && d <= endStr;
  });
  return <GroupedFixtures fixtures={week} />;
}

export default function App() {
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState("today");
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadData() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(CSV_URL);
      if (!res.ok) throw new Error("Failed");
      const text = await res.text();
      setFixtures(parseCSV(text));
      setLastUpdated(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  return (
    <div className="hub">
      <div className="header">
        <div>
          <div className="header-title">World Cup 2026</div>
          {lastUpdated && <div className="header-sub">Updated {lastUpdated}</div>}
        </div>
        <button className="refresh-btn" onClick={loadData}>↻ Refresh</button>
      </div>

      <div className="tab-bar">
        {["today", "week", "all"].map((t) => (
          <button
            key={t}
            className={`tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "today" ? "Today" : t === "week" ? "This week" : "All fixtures"}
          </button>
        ))}
      </div>

      {loading && <div className="loading">Loading fixtures...</div>}
      {error && <div className="error-msg">Could not load fixtures. Check connection and refresh.</div>}
      {!loading && !error && (
        <>
          {tab === "today" && <TodayTab fixtures={fixtures} />}
          {tab === "week" && <WeekTab fixtures={fixtures} />}
          {tab === "all" && <GroupedFixtures fixtures={fixtures} />}
        </>
      )}
    </div>
  );
}