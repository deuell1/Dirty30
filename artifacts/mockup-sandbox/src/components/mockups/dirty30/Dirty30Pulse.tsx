import { useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";

type Game = {
  time: string;
  period: string;
  home: string;
  away: string;
  court: string;
  color: string;
  state: "live" | "next" | "later";
};

const games: Game[] = [
  { time: "6:00", period: "PM", home: "Layup Lines", away: "The Rebound", court: "Court 1", color: "#e76f51", state: "next" },
  { time: "7:30", period: "PM", home: "Court Jesters", away: "Full Court Press", court: "Court 2", color: "#5d7c78", state: "later" },
  { time: "8:15", period: "PM", home: "Net Results", away: "Bank Shot Social", court: "Court 3", color: "#d99b55", state: "later" },
];

const nav = [
  { label: "Tonight", icon: Trophy },
  { label: "Calendar", icon: CalendarDays },
  { label: "People", icon: UsersRound },
];

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span style={{ backgroundColor: color }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold text-[#fff8ee]">
      {name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
    </span>
  );
}

function GameCard({ game, expanded, onExpand }: { game: Game; expanded: boolean; onExpand: () => void }) {
  return (
    <article className={`overflow-hidden rounded-[3px] border transition ${game.state === "next" ? "border-[#e76f51] bg-[#fff9f1] shadow-[4px_4px_0_#f2c7a2]" : "border-[#d9d4ca] bg-[#fbf7f0]"}`}>
      <button onClick={onExpand} className="w-full px-4 py-4 text-left sm:px-5">
        <div className="flex items-center gap-3">
          <div className="w-16 shrink-0 border-r border-[#e3ddd4] pr-3">
            <div className="font-['Space_Mono'] text-2xl font-bold tracking-[-.08em] text-[#292a32]">{game.time}</div>
            <div className="font-mono text-[9px] font-bold uppercase tracking-[.18em] text-[#aaa096]">{game.period}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${game.state === "next" ? "bg-[#e76f51]" : "bg-[#c8c0b6]"}`} />
              <span className="font-mono text-[9px] font-bold uppercase tracking-[.17em] text-[#9a8f84]">{game.state === "next" ? "Your game" : "Up later"}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-3 text-[15px] font-bold leading-6 text-[#292a32]">
              <span className="flex items-center gap-2 truncate"><Avatar name={game.home} color={game.color} />{game.home}</span>
              <span className="row-span-2 self-center font-mono text-xs text-[#a99f95]">VS</span>
              <span className="flex items-center gap-2 truncate"><Avatar name={game.away} color="#292a32" />{game.away}</span>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#9a8f84] transition ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[#e3ddd4] bg-[#f4ede3] px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] font-bold uppercase tracking-[.11em] text-[#7d736b]">
            <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-[#e76f51]" />Civic Rec Center · {game.court}</span>
            <span className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#e76f51]" />Arrive 20 min early</span>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="bg-[#292a32] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[.13em] text-[#fff8ee]">Open matchup</button>
            <button className="border border-[#d1c7bb] bg-[#fff9f1] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[.13em] text-[#6f665e]">Message team</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function Dirty30Pulse() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(0);
  const [checked, setChecked] = useState(false);
  const [active, setActive] = useState("Tonight");
  const [query, setQuery] = useState("");

  return (
    <div className="min-h-[100dvh] bg-[#eee8df] text-[#292a32]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Syne:wght@600;700;800&display=swap');
        @keyframes pulse-in { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .pulse-in { animation: pulse-in .55s cubic-bezier(.2,.8,.2,1) both }
      `}</style>
      <div className="mx-auto flex min-h-[100dvh] max-w-[1440px]">
        <aside className={`fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col bg-[#292a32] px-5 py-6 text-[#f7efe4] transition-transform lg:static lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setActive("Tonight")} className="flex items-center gap-2 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e76f51] font-['Syne'] text-lg font-extrabold">D</span>
              <span className="font-['Syne'] text-[17px] font-extrabold tracking-[-.08em]">DIRTY<span className="text-[#e76f51]">30</span></span>
            </button>
            <button onClick={() => setMenuOpen(false)} className="lg:hidden"><X className="h-5 w-5" /></button>
          </div>
          <p className="mt-14 font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#8e8a89]">Your league</p>
          <nav className="mt-3 space-y-1">
            {nav.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActive(label); setMenuOpen(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-[2px] px-3 text-sm font-bold transition ${active === label ? "bg-[#f7efe4] text-[#292a32]" : "text-[#c3bbb3] hover:bg-[#3d3e47]"}`}><Icon className="h-[17px] w-[17px]" />{label}{label === "Tonight" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#e76f51]" />}</button>)}
          </nav>
          <div className="mt-auto border-t border-[#484951] pt-5">
            <button onClick={() => setActive("Review queue")} className="flex w-full items-center gap-3 py-2 text-left text-sm font-semibold text-[#c3bbb3]"><Bell className="h-4 w-4 text-[#e76f51]" />Review queue <span className="ml-auto rounded-full bg-[#e76f51] px-2 py-0.5 font-mono text-[10px] text-[#292a32]">2</span></button>
            <div className="mt-5 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#6f8c86] font-mono text-[10px] font-bold">JM</span><span><b className="block text-xs">Jordan Miles</b><small className="text-[10px] text-[#8e8a89]">Commissioner</small></span><MoreHorizontal className="ml-auto h-4 w-4 text-[#8e8a89]" /></div>
          </div>
        </aside>
        {menuOpen && <button aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 bg-[#292a32]/40 lg:hidden" />}
        <main className="min-w-0 flex-1">
          <header className="flex h-[72px] items-center justify-between border-b border-[#d9d4ca] bg-[#f4eee6] px-5 sm:px-9">
            <button onClick={() => setMenuOpen(true)} className="lg:hidden"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-2 text-xs font-semibold text-[#938a81] lg:flex"><span className="h-2 w-2 rounded-full bg-[#6f8c86]" />Thursday, March 20 <span className="mx-2 text-[#c5bbb0]">/</span> Spring ’25</div>
            <div className="ml-auto flex items-center gap-4"><button className="hidden text-[#938a81] sm:block"><MessageSquare className="h-[18px] w-[18px]" /></button><span className="h-5 w-px bg-[#d9d4ca]" /><span className="grid h-8 w-8 place-items-center rounded-full bg-[#6f8c86] font-mono text-[10px] font-bold text-[#fff8ee]">JM</span></div>
          </header>
          <div className="mx-auto max-w-[1000px] px-5 py-8 sm:px-10 lg:px-16">
            <div className="pulse-in">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#e76f51]">Thursday night / week 04</p><h1 className="mt-2 font-['Syne'] text-5xl font-extrabold tracking-[-.08em] sm:text-6xl">The pulse.</h1><p className="mt-3 max-w-md text-sm leading-6 text-[#81786f]">Everything your team needs before the first whistle. One glance, no digging.</p></div>
                <button onClick={() => setChecked(!checked)} className={`flex items-center gap-2 border px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[.12em] transition ${checked ? "border-[#6f8c86] bg-[#dbe5df] text-[#365c58]" : "border-[#d9d4ca] bg-[#fbf7f0] text-[#81786f]"}`}>{checked ? <Check className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{checked ? "Ready to play" : "Mark ready"}</button>
              </div>
              <section className="mt-9 grid gap-4 md:grid-cols-[1fr_220px]">
                <div className="bg-[#292a32] p-5 text-[#f7efe4] sm:p-6"><div className="flex items-start justify-between"><div><p className="font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#e76f51]">Next up</p><h2 className="mt-2 font-['Syne'] text-3xl font-extrabold tracking-[-.07em]">Layup Lines</h2><p className="mt-1 text-sm text-[#bbb2ab]">The Rebound · tonight at 6:00 PM</p></div><span className="rounded-full bg-[#e76f51] px-2 py-1 font-mono text-[9px] font-bold text-[#292a32]">COURT 1</span></div><div className="mt-8 flex items-center justify-between border-t border-[#484951] pt-4"><span className="flex items-center gap-2 text-xs text-[#bbb2ab]"><MapPin className="h-3.5 w-3.5 text-[#e76f51]" />Civic Rec Center</span><button onClick={() => setExpanded(0)} className="flex items-center gap-1 text-xs font-bold text-[#e76f51]">Matchup details <ChevronRight className="h-4 w-4" /></button></div></div>
                <div className="border border-[#d9d4ca] bg-[#f7d8bd] p-5"><CircleAlert className="h-5 w-5 text-[#b64f3e]" /><p className="mt-5 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-[#9f5142]">One thing</p><p className="mt-2 font-['Syne'] text-xl font-bold leading-6 tracking-[-.05em]">Court Jesters still need to confirm their roster.</p><button onClick={() => setActive("Review queue")} className="mt-5 text-xs font-bold text-[#9f5142] underline underline-offset-4">Review request</button></div>
              </section>
              <section className="mt-10"><div className="flex items-end justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[#938a81]">The run of show</p><h2 className="mt-2 font-['Syne'] text-2xl font-bold tracking-[-.06em]">All games tonight</h2></div><button className="flex items-center gap-2 border border-[#d9d4ca] bg-[#fbf7f0] px-3 py-2 text-xs font-bold text-[#81786f]"><Plus className="h-3.5 w-3.5 text-[#e76f51]" /> Add note</button></div><div className="mt-4 space-y-3">{games.filter((x) => `${x.home} ${x.away}`.toLowerCase().includes(query.toLowerCase())).map((game, i) => <GameCard key={game.time} game={game} expanded={expanded === i} onExpand={() => setExpanded(expanded === i ? -1 : i)} />)}</div></section>
              <div className="mt-8 flex items-center gap-3 border-t border-[#d9d4ca] pt-5"><Search className="h-4 w-4 text-[#aaa096]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a team or matchup" className="w-full bg-transparent text-sm outline-none placeholder:text-[#aaa096]" /><span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-[#aaa096]">⌘ K</span></div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}