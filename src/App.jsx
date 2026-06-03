import { useState, useEffect, useCallback } from "react";
import './styles.css';

// ── CSV Feed URLs ─────────────────────────────────────────────────────────────
const PUBLISHED_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRDN1Yd4s_LWjF9cLUWIhBi8SkNoK87N-_bcAi0QFgaQSCN08LRbpUCpC4r2dhuKQ4AOcry1_IKqvnv/pub";
const FIXTURES_CSV   = `${PUBLISHED_BASE}?gid=2081265115&single=true&output=csv`;
const STANDINGS_CSV  = `${PUBLISHED_BASE}?gid=1894072067&single=true&output=csv`;
const THIRD_CSV      = `${PUBLISHED_BASE}?gid=535694100&single=true&output=csv`;
const SCORERS_CSV    = `${PUBLISHED_BASE}?gid=288857986&single=true&output=csv`;

// ── CSV Parsers ───────────────────────────────────────────────────────────────
// Raw arrays — for standings/third/scorers where header rows are unreliable
function parseRawCSV(text) {
  return text.trim().split("\n").map((line) => {
    const vals = [];
    let cur = "", inQ = false;
    for (let c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { vals.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    vals.push(cur.trim());
    return vals;
  });
}

// Header-keyed objects — for fixtures
function parseFixturesCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
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
    headers.forEach((h, i) => (obj[h] = vals[i] ? vals[i].trim() : ""));
    return obj;
  });
}

// ── Date/Time Helpers ─────────────────────────────────────────────────────────
function toISO(d) {
  if (!d) return "";
  const p = d.split("/");
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
  return d;
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function formatDate(d) {
  return new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
}
function eveningSlateKey(f) {
  const iso = toISO(f["Date"]);
  const hour = parseInt((f["Kick-off (BST)"]||"12:00").split(":")[0],10);
  if (hour < 8) {
    const d = new Date(iso+"T12:00:00"); d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10);
  }
  return iso;
}
function currentSlateDate() {
  const now = new Date();
  if (now.getHours() < 8) {
    const y = new Date(now); y.setDate(y.getDate()-1); return y.toISOString().slice(0,10);
  }
  return now.toISOString().slice(0,10);
}
function isScotland(f) { return f["Home Team"]==="Scotland"||f["Away Team"]==="Scotland"; }
function isPlayed(f)   { return f["Home Score"]!==""&&f["Away Score"]!==""; }

// ── Badges ────────────────────────────────────────────────────────────────────
function StageBadge({ stage }) {
  const map = {
    "Group Stage":{cls:"gs",label:"Group"},"Round of 32":{cls:"r32",label:"R32"},
    "Round of 16":{cls:"r16",label:"R16"},"Quarter-Final":{cls:"qf",label:"QF"},
    "Semi-Final":{cls:"sf",label:"SF"},"Final":{cls:"fin",label:"Final"},"3rd Place":{cls:"tp",label:"3rd"},
  };
  const s = map[stage]||{cls:"gs",label:stage};
  return <span className={`stage-badge ${s.cls}`}>{s.label}</span>;
}
function ChannelBadge({ ch }) {
  if (!ch||ch==="TBC") return null;
  const lower = ch.toLowerCase();
  const cls = lower.includes("bbc")?"bbc":lower.includes("itv")?"itv":"tbc-ch";
  return <span className={`ch-badge ${cls}`}>{ch}</span>;
}

// ── Match Card ────────────────────────────────────────────────────────────────
function MatchCard({ f }) {
  const scot = isScotland(f), watching = f["Watching?"]==="TRUE";
  const hs=f["Home Score"], as2=f["Away Score"], hasScore=hs!==""&&as2!=="";
  const aet=f["AET?"]&&f["AET?"]!=="90 mins"?f["AET?"]:"";
  const grp=f["Group"]?` · Grp ${f["Group"]}`:"";
  const location=[f["Venue"],f["City"]].filter(Boolean).join(", ");
  return (
    <div className={`match-card${scot?" scotland":""}${watching?" watching":""}`}>
      {watching&&<span className="watching-eye">👁</span>}
      <div className="card-top">
        <StageBadge stage={f["Stage"]}/>
        <span className="card-meta">{f["Kick-off (BST)"]} BST{grp}</span>
        <ChannelBadge ch={f["UK Channel"]}/>
      </div>
      <div className="card-teams">
        <span className={`team home${hasScore&&parseInt(hs)>parseInt(as2)?" winner":""}`}>{f["Home Team"]}</span>
        {hasScore?(
          <span className="score-block">
            <span className="score">{hs} – {as2}</span>
            {aet&&<span className="aet-label">{aet}</span>}
          </span>
        ):<span className="vs">vs</span>}
        <span className={`team away${hasScore&&parseInt(as2)>parseInt(hs)?" winner":""}`}>{f["Away Team"]}</span>
      </div>
      {location&&<div className="card-venue">📍 {location}</div>}
    </div>
  );
}

// ── Grouped Fixtures ──────────────────────────────────────────────────────────
function GroupedFixtures({ fixtures, reverse=false, useSlateKey=false }) {
  if (!fixtures.length) return <div className="empty">No matches to show</div>;
  const groups={};
  fixtures.forEach(f=>{
    const d=useSlateKey?eveningSlateKey(f):toISO(f["Date"]);
    if(!groups[d])groups[d]=[];
    groups[d].push(f);
  });
  let sorted=Object.keys(groups).sort();
  if(reverse)sorted=sorted.reverse();
  return sorted.map(d=>(
    <div key={d}>
      <div className="date-header">{formatDate(d)}</div>
      {groups[d].map(f=><MatchCard key={f["Match #"]} f={f}/>)}
    </div>
  ));
}

// ── Fixture Tabs ──────────────────────────────────────────────────────────────
function TodayTab({ fixtures }) {
  const slateDate=currentSlateDate(), upcoming=fixtures.filter(f=>!isPlayed(f));
  const todaySlate=upcoming.filter(f=>eveningSlateKey(f)===slateDate);
  if (!todaySlate.length) {
    const slateDates=[...new Set(upcoming.map(eveningSlateKey))].sort();
    const nextSlate=slateDates[0]||null;
    const nextF=nextSlate?upcoming.filter(f=>eveningSlateKey(f)===nextSlate):[];
    return(<><div className="today-hero">No matches today</div>{nextF.length>0&&<><div className="date-header">{formatDate(nextSlate)}</div>{nextF.map(f=><MatchCard key={f["Match #"]} f={f}/>)}</>}</>);
  }
  return(<><div className="date-header">{formatDate(slateDate)}</div>{todaySlate.map(f=><MatchCard key={f["Match #"]} f={f}/>)}</>);
}
function WeekTab({ fixtures }) {
  const slateDate=currentSlateDate(), end=new Date(slateDate);
  end.setDate(end.getDate()+7);
  const endStr=end.toISOString().slice(0,10);
  const week=fixtures.filter(f=>{const d=eveningSlateKey(f);return d>=slateDate&&d<=endStr&&!isPlayed(f);});
  if(!week.length)return<div className="empty">No upcoming matches this week</div>;
  return<GroupedFixtures fixtures={week} useSlateKey={true}/>;
}
function FixturesTab({ fixtures }) {
  const upcoming=fixtures.filter(f=>!isPlayed(f));
  if(!upcoming.length)return<div className="empty">No upcoming fixtures</div>;
  return<GroupedFixtures fixtures={upcoming} useSlateKey={true}/>;
}
function ResultsTab({ fixtures }) {
  const played=fixtures.filter(f=>isPlayed(f));
  if(!played.length)return<div className="empty">No results yet — tournament starts 11 June 2026 🎉</div>;
  return<GroupedFixtures fixtures={played} reverse={true} useSlateKey={true}/>;
}

// ── Scotland Tab ──────────────────────────────────────────────────────────────
function ScotlandTab({ fixtures }) {
  const scotMatches=fixtures.filter(isScotland);
  if(!scotMatches.length)return<div className="empty">No Scotland matches found</div>;
  const today=todayStr();
  const nextMatch=scotMatches.find(f=>!isPlayed(f)&&toISO(f["Date"])>=today);
  let countdown=null;
  if(nextMatch){
    const kickoff=nextMatch["Kick-off (BST)"]||"00:00";
    const diffMs=new Date(toISO(nextMatch["Date"])+"T"+kickoff+":00")-new Date();
    if(diffMs>0){
      const days=Math.floor(diffMs/86400000),hours=Math.floor((diffMs%86400000)/3600000),mins=Math.floor((diffMs%3600000)/60000);
      countdown=days>0?`${days}d ${hours}h ${mins}m`:`${hours}h ${mins}m`;
    }
  }
  const played=scotMatches.filter(isPlayed), upcoming=scotMatches.filter(f=>!isPlayed(f));
  return(
    <>
      <div className="scotland-hero">
        <div className="scotland-flag">🏴󠁧󠁢󠁳󠁣󠁴󠁿</div>
        <div className="scotland-title">Scotland</div>
        <div className="scotland-group">Group C · FIFA World Cup 2026</div>
        {countdown&&nextMatch&&(
          <div className="scotland-countdown">
            <div className="countdown-label">Next match in</div>
            <div className="countdown-time">{countdown}</div>
            <div className="countdown-match">{nextMatch["Home Team"]} vs {nextMatch["Away Team"]} · {nextMatch["Kick-off (BST)"]} BST</div>
          </div>
        )}
      </div>
      {upcoming.length>0&&<><div className="section-title">Upcoming</div>{upcoming.map(f=><MatchCard key={f["Match #"]} f={f}/>)}</>}
      {played.length>0&&<><div className="section-title">Results</div>{[...played].reverse().map(f=><MatchCard key={f["Match #"]} f={f}/>)}</>}
    </>
  );
}

// ── Standings Tab ─────────────────────────────────────────────────────────────
function parseStandingsCSV(rawRows) {
  const groups=[];
  for(let i=0;i<rawRows.length;i++){
    const row=rawRows[i];
    let leftCol=-1,rightCol=-1,leftLetter="",rightLetter="";
    row.forEach((v,c)=>{
      const s=(v||"").trim().toUpperCase();
      if(/^GROUP [A-L]$/.test(s)){
        if(leftCol===-1){leftCol=c;leftLetter=s.replace("GROUP ","");}
        else{rightCol=c;rightLetter=s.replace("GROUP ","");}
      }
    });
    if(!leftLetter)continue;
    const leftTeams=[],rightTeams=[];
    for(let j=i+2;j<=i+5;j++){
      if(j>=rawRows.length)break;
      const r=rawRows[j];
      const lTeam=(r[leftCol]||"").trim();
      if(lTeam&&lTeam!=="Team"){
        leftTeams.push({team:lTeam,p:r[leftCol+1]||"0",w:r[leftCol+2]||"0",d:r[leftCol+3]||"0",l:r[leftCol+4]||"0",gf:r[leftCol+5]||"0",ga:r[leftCol+6]||"0",gd:r[leftCol+7]||"0",pts:r[leftCol+8]||"0",pos:r[leftCol+9]||String(leftTeams.length+1)});
      }
      if(rightCol!==-1){
        const rTeam=(r[rightCol]||"").trim();
        if(rTeam&&rTeam!=="Team"){
          rightTeams.push({team:rTeam,p:r[rightCol+1]||"0",w:r[rightCol+2]||"0",d:r[rightCol+3]||"0",l:r[rightCol+4]||"0",gf:r[rightCol+5]||"0",ga:r[rightCol+6]||"0",gd:r[rightCol+7]||"0",pts:r[rightCol+8]||"0",pos:r[rightCol+9]||String(rightTeams.length+1)});
        }
      }
    }
    const sort=t=>[...t].sort((a,b)=>parseInt(a.pos||9)-parseInt(b.pos||9));
    if(leftTeams.length) groups.push({name:leftLetter, teams:sort(leftTeams)});
    if(rightTeams.length)groups.push({name:rightLetter,teams:sort(rightTeams)});
  }
  return groups.sort((a,b)=>a.name.localeCompare(b.name));
}

function StandingsTab({ standings }) {
  if(!standings||standings.length===0)return(
    <div className="standings-notice"><div className="notice-icon">⚙️</div><div className="notice-title">Group Standings</div><div className="notice-body">Loading standings…</div></div>
  );
  return(
    <div className="standings-grid">
      {standings.map(grp=>(
        <div key={grp.name} className="standings-group">
          <div className="group-header">Group {grp.name}</div>
          <table className="standings-table">
            <thead><tr><th>#</th><th className="team-col">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
            <tbody>
              {grp.teams.map((t,i)=>(
                <tr key={t.team} className={`${i<2?"qualify":""}${t.team==="Scotland"?" scotland-row":""}`}>
                  <td className="pos">{t.pos}</td><td className="team-name">{t.team}</td>
                  <td>{t.p}</td><td>{t.w}</td><td>{t.d}</td><td>{t.l}</td><td>{t.gd}</td><td className="pts">{t.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="qualify-key"><span className="key-dot qualify-dot"></span> Top 2 qualify</div>
        </div>
      ))}
    </div>
  );
}

// ── Tables Tab (3rd Place Tracker + Golden Boot) ──────────────────────────────
function parseThirdPlaceCSV(rawRows) {
  // CSV structure:
  // row 0  = title
  // row 1  = legend
  // row 2  = col headers (Rank, Group, Team, P, W, D, L, GF, GA, GD, Pts)
  // rows 3-14 = unsorted raw data (12 teams) — SKIP these
  // row 15 = blank
  // row 16 = "Ranked — Top 8 Qualify" section header — SKIP
  // rows 17-28 = ranked data — USE these only
  const teams=[];
  for(let i=17;i<rawRows.length;i++){
    const row=rawRows[i];
    const first=(row[0]||"").trim();
    if(!first||first==="Rank"||first==="#")continue;
    const rank=parseInt(first,10);
    if(isNaN(rank))continue;
    teams.push({
      rank, group:(row[1]||"").trim(), team:(row[2]||"").trim(),
      p:(row[3]||"0"), w:(row[4]||"0"), d:(row[5]||"0"), l:(row[6]||"0"),
      gf:(row[7]||"0"), ga:(row[8]||"0"), gd:(row[9]||"0"), pts:(row[10]||"0"),
    });
  }
  return teams.sort((a,b)=>a.rank-b.rank);
}

function parseScorersCSV(rawRows) {
  // CSV columns (0-indexed):
  // A(0)=Match#, B(1)=Player, C(2)=Team, D(3)=Minute, E(4)=OG, F(5)=Date (blank col),
  // G(6)=blank, H(7)=Player(leaderboard), I(8)=Team, J(9)=Goals, K(10)=blank, L(11)=Own Goals
  // Row 0 = headers, rows 1+ = data
  const scorers=[];
  let ownGoals=0;
  for(let i=1;i<rawRows.length;i++){
    const row=rawRows[i];
    const player=(row[7]||"").trim();
    const team=(row[8]||"").trim();
    const goals=parseInt(row[9]||"0",10);
    if(i===1) ownGoals=parseInt(row[11]||"0",10);
    if(player&&!isNaN(goals)&&goals>0) scorers.push({player,team,goals});
  }
  const sorted = scorers.sort((a,b)=>b.goals-a.goals).slice(0,20);
  return{scorers:sorted,ownGoals};
}

function TablesTab({ thirdPlace, scorers, ownGoals }) {
  return(
    <>
      {/* ── Golden Boot ── */}
      <div className="tables-section-header">👟 Golden Boot</div>
      {!scorers||scorers.length===0?(
        <div className="empty">No goals scored yet — tournament starts 11 June 2026</div>
      ):(
        <>
          <div className="scorers-table-wrap">
            <table className="scorers-table">
              <thead>
                <tr><th>#</th><th className="player-col">Player</th><th>Team</th><th>Goals</th></tr>
              </thead>
              <tbody>
                {scorers.map((s,i)=>(
                  <tr key={s.player} className={i===0?"top-scorer":""}>
                    <td className="scorer-rank">{i+1}</td>
                    <td className="scorer-name">{s.player}</td>
                    <td className="scorer-team">{s.team}</td>
                    <td className="scorer-goals">{s.goals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ownGoals>0&&<div className="own-goals-note">Own goals this tournament: {ownGoals}</div>}
        </>
      )}

      {/* ── 3rd Place Tracker ── */}
      <div className="tables-section-header" style={{marginTop:"20px"}}>🥉 3rd Place Tracker</div>
      <div className="third-qualify-note">Top 8 third-placed teams qualify for Round of 32</div>
      {!thirdPlace||thirdPlace.length===0?(
        <div className="empty">No third-place data yet</div>
      ):(
        <div className="third-table-wrap">
          <table className="third-table">
            <thead>
              <tr><th>#</th><th>Grp</th><th className="team-col">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr>
            </thead>
            <tbody>
              {thirdPlace.map((t,i)=>(
                <tr key={t.team} className={`${i<8?"third-qualify":"third-elim"}${t.team==="Scotland"?" scotland-row":""}`}>
                  <td className="pos">{t.rank}</td>
                  <td className="third-group">{t.group}</td>
                  <td className="team-name">{t.team}</td>
                  <td>{t.p}</td><td>{t.w}</td><td>{t.d}</td><td>{t.l}</td><td>{t.gd}</td>
                  <td className="pts">{t.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="third-key-row">
            <span><span className="key-dot qualify-dot"></span> Qualify (Top 8)</span>
            <span><span className="key-dot elim-dot"></span> Eliminated</span>
          </div>
        </div>
      )}
    </>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [fixtures,    setFixtures]    = useState([]);
  const [standings,   setStandings]   = useState(null);
  const [thirdPlace,  setThirdPlace]  = useState([]);
  const [scorers,     setScorers]     = useState([]);
  const [ownGoals,    setOwnGoals]    = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [tab,         setTab]         = useState("today");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      // Fixtures
      const res = await fetch(FIXTURES_CSV);
      if (!res.ok) throw new Error("Failed");
      setFixtures(parseFixturesCSV(await res.text()));

      // Standings
      try {
        const sRes=await fetch(STANDINGS_CSV);
        if(sRes.ok){const raw=parseRawCSV(await sRes.text());const p=parseStandingsCSV(raw);if(p.length>0)setStandings(p);}
      } catch{}

      // 3rd Place Tracker
      try {
        const tRes=await fetch(THIRD_CSV);
        if(tRes.ok){const raw=parseRawCSV(await tRes.text());const p=parseThirdPlaceCSV(raw);if(p.length>0)setThirdPlace(p);}
      } catch{}

      // Scorers
      try {
        const scRes=await fetch(SCORERS_CSV);
        if(scRes.ok){const raw=parseRawCSV(await scRes.text());const{scorers:s,ownGoals:og}=parseScorersCSV(raw);setScorers(s);setOwnGoals(og);}
      } catch{}

      setLastUpdated(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}));
    } catch { setError(true); }
    finally  { setLoading(false); }
  },[]);

  useEffect(()=>{loadData();},[loadData]);

  const tabs=[
    {id:"today",    label:"Today",   emoji:"📅"},
    {id:"week",     label:"This Week",emoji:"📆"},
    {id:"scotland", label:"Scotland", emoji:"🏴󠁧󠁢󠁳󠁣󠁴󠁿"},
    {id:"standings",label:"Standings",emoji:"📊"},
    {id:"tables",   label:"Tables",   emoji:"🏆"},
    {id:"fixtures", label:"Fixtures", emoji:"🗓️"},
    {id:"results",  label:"Results",  emoji:"✅"},
  ];

  return(
    <div className="hub">
      <div className="header">
        <div>
          <div className="header-title">⚽ Cupo Hub</div>
          <div className="header-sub">FIFA World Cup 2026{lastUpdated&&<span> · Updated {lastUpdated}</span>}</div>
        </div>
        <button className="refresh-btn" onClick={loadData} disabled={loading}>
          {loading?"⏳":"↻"} {loading?"Loading…":"Refresh"}
        </button>
      </div>
      <div className="tab-bar">
        {tabs.map(t=>(
          <button key={t.id} className={`tab${tab===t.id?" active":""}`} onClick={()=>setTab(t.id)}>
            <span className="tab-emoji">{t.emoji}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="content">
        {loading&&<div className="loading"><div className="loading-spinner">⚽</div><div>Loading…</div></div>}
        {error&&!loading&&<div className="error"><div>⚠️ Couldn't load data.</div><button className="refresh-btn" onClick={loadData}>Try again</button></div>}
        {!loading&&!error&&<>
          {tab==="today"    &&<TodayTab     fixtures={fixtures}/>}
          {tab==="week"     &&<WeekTab      fixtures={fixtures}/>}
          {tab==="scotland" &&<ScotlandTab  fixtures={fixtures}/>}
          {tab==="standings"&&<StandingsTab standings={standings}/>}
          {tab==="tables"   &&<TablesTab    thirdPlace={thirdPlace} scorers={scorers} ownGoals={ownGoals}/>}
          {tab==="fixtures" &&<FixturesTab  fixtures={fixtures}/>}
          {tab==="results"  &&<ResultsTab   fixtures={fixtures}/>}
        </>}
      </div>
    </div>
  );
}