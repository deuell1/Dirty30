import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Menu,
  Moon,
  Plus,
  Settings,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

type NavItem = { label: string; icon: typeof CalendarDays };

const navItems: NavItem[] = [
  { label: "Home", icon: Trophy },
  { label: "Schedule", icon: CalendarDays },
  { label: "Teams", icon: UsersRound },
  { label: "Standings", icon: ClipboardCheck },
];

const games = [
  { date: "THU, MAR 20", time: "7:30 PM", home: "The Rebound", away: "Court Jesters", venue: "Civic Rec Center · Court 2", score: "48 — 42", status: "FINAL" },
  { date: "SAT, MAR 22", time: "6:00 PM", home: "The Rebound", away: "Layup Lines", venue: "Civic Rec Center · Court 1", score: "vs", status: "UP NEXT" },
  { date: "TUE, MAR 25", time: "8:15 PM", home: "Court Jesters", away: "Full Court Press", venue: "Mission Gym · Court 3", score: "vs", status: "SCHEDULED" },
];

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

function Status({ children, warm = false }: { children: string; warm?: boolean }) {
  return (
    <span className={warm ? "rounded-sm bg-[#efb37c] px-2 py-1 text-[10px] font-black tracking-[0.14em] text-[#3b1f2a]" : "rounded-sm bg-[#d7e3e2] px-2 py-1 text-[10px] font-black tracking-[0.14em] text-[#275a59]"}>
      {children}
    </span>
  );
}

function GameRow({ game, featured = false }: { game: (typeof games)[number]; featured?: boolean }) {
  return (
    <div className={`group border-b border-[#d9cfca] px-5 py-4 transition hover:bg-[#fff8f0] ${featured ? "bg-[#fff8f0]" : "bg-[#fbf6f0]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-[#9a817d]">
          <span>{game.date}</span><span className="h-1 w-1 rounded-full bg-[#c86456]" /><span>{game.time}</span>
        </div>
        <Status warm={game.status === "UP NEXT"}>{game.status}</Status>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <p className="font-['Bricolage_Grotesque'] text-[17px] font-bold text-[#3b1f2a]"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-sm bg-[#eadcd4] font-mono text-[9px]">{initials(game.home)}</span>{game.home}</p>
        <p className="font-mono text-lg font-bold text-[#3b1f2a]">{game.score}</p>
        <p className="text-right font-['Bricolage_Grotesque'] text-[17px] font-bold text-[#3b1f2a]">{game.away}<span className="ml-2 inline-grid h-6 w-6 place-items-center rounded-sm bg-[#eadcd4] font-mono text-[9px]">{initials(game.away)}</span></p>
      </div>
      <div className="mt-3 flex items-center text-xs text-[#9a817d]">{game.venue}<ChevronRight className="ml-auto h-4 w-4 text-[#c86456] transition group-hover:translate-x-1" /></div>
    </div>
  );
}

export function Dirty30Velvet() {
  const [active, setActive] = useState("Home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "FINAL" | "UPCOMING">("ALL");
  const [saved, setSaved] = useState(false);
  const filteredGames = games.filter((game) => filter === "ALL" || (filter === "FINAL" ? game.status === "FINAL" : game.status !== "FINAL"));

  return (
    <div className="min-h-[100dvh] bg-[#f4ede6] text-[#3b1f2a]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        .velvet-noise { position: relative; }
        .velvet-noise:after { content:''; pointer-events:none; position:fixed; inset:0; opacity:.035; z-index:30; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E"); }
        @keyframes velvet-rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .velvet-rise { animation: velvet-rise .55s cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
      <div className="velvet-noise flex min-h-[100dvh]">
        <aside className={`fixed inset-y-0 left-0 z-20 flex w-[244px] flex-col bg-[#3b1f2a] px-5 py-7 text-[#f8eadf] transition-transform duration-300 lg:static lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setActive("Home")} className="flex items-center gap-3 text-left">
              <span className="grid h-10 w-10 place-items-center rounded-sm bg-[#efb37c] font-['Bricolage_Grotesque'] text-xl font-extrabold text-[#3b1f2a] shadow-[3px_3px_0_#c86456]">D</span>
              <span><b className="block font-['Bricolage_Grotesque'] text-[19px] tracking-[-.06em]">DIRTY-30</b><small className="font-mono text-[8px] tracking-[.15em] text-[#d9bdb2]">LEAGUE HQ</small></span>
            </button>
            <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="lg:hidden"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-14">
            <p className="mb-3 px-3 font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#a98682]">League room</p>
            <nav className="space-y-1">
              {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActive(label); setMobileOpen(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-sm font-bold transition ${active === label ? "bg-[#efb37c] text-[#3b1f2a]" : "text-[#d9bdb2] hover:bg-[#51303b]"}`}><Icon className="h-[18px] w-[18px]" />{label}{label === "Schedule" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#df7765]" />}</button>)}
            </nav>
          </div>
          <div className="mt-auto space-y-1">
            <button onClick={() => setActive("Review queue")} className="flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-sm font-bold text-[#d9bdb2] hover:bg-[#51303b]"><CircleAlert className="h-[18px] w-[18px]" />Review queue<span className="ml-auto rounded-sm bg-[#efb37c] px-2 py-1 text-[10px] font-black text-[#3b1f2a]">2</span></button>
            <button onClick={() => setActive("Settings")} className="flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-left text-sm font-bold text-[#d9bdb2] hover:bg-[#51303b]"><Settings className="h-[18px] w-[18px]" />Settings</button>
          </div>
          <div className="mt-6 border-t border-[#60404a] pt-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#c86456] font-['Bricolage_Grotesque'] text-sm font-bold">JM</span><span className="min-w-0"><b className="block text-sm">Jordan Miles</b><small className="text-[10px] text-[#a98682]">Commissioner</small></span><button className="ml-auto text-[#a98682]"><Moon className="h-4 w-4" /></button></div></div>
        </aside>
        {mobileOpen && <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-10 bg-[#3b1f2a]/45 lg:hidden" />}
        <div className="min-w-0 flex-1">
          <header className="flex h-[74px] items-center justify-between border-b border-[#d9cfca] bg-[#f8f1ea]/90 px-5 backdrop-blur sm:px-9">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden"><Menu className="h-5 w-5" /></button>
            <div className="hidden items-center gap-2 text-xs font-semibold text-[#9a817d] lg:flex"><span className="h-2 w-2 rounded-full bg-[#5a9a92]" />League systems online</div>
            <div className="ml-auto flex items-center gap-4"><button className="text-[#9a817d]"><Settings className="h-5 w-5" /></button><span className="h-5 w-px bg-[#d9cfca]" /><span className="grid h-9 w-9 place-items-center rounded-full bg-[#c86456] font-['Bricolage_Grotesque'] text-xs font-bold text-[#fff8f0]">JM</span></div>
          </header>
          <main className="mx-auto max-w-[1350px] px-5 py-8 pb-14 sm:px-9 lg:px-12">
            <div className="velvet-rise">
              <div className="mb-7 flex flex-wrap items-center gap-2"><span className="bg-[#3b1f2a] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[#f8eadf]">Commissioner</span><span className="text-sm text-[#9a817d]">·</span><span className="text-sm font-semibold text-[#9a817d]">Spring season / 2025</span></div>
              <section className="relative overflow-hidden rounded-sm bg-[#c86456] px-6 py-9 text-[#fff5ea] sm:px-10 sm:py-12">
                <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full border-[26px] border-[#efb37c]/45" /><div className="absolute -bottom-24 right-44 h-48 w-48 rounded-full border-[18px] border-[#3b1f2a]/10" />
                <div className="relative max-w-2xl"><p className="font-mono text-[10px] font-bold uppercase tracking-[.22em] text-[#efb37c]">Dirty-30 Beer League</p><h1 className="mt-4 font-['Bricolage_Grotesque'] text-5xl font-extrabold leading-[.9] tracking-[-.07em] sm:text-7xl">Game day<br /><span className="text-[#efb37c]">starts here.</span></h1><p className="mt-5 max-w-md text-sm leading-6 text-[#fff5ea]/75">The trusted home base for lineups, late games, and the occasional overtime thriller.</p></div>
              </section>
              <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
                <section className="overflow-hidden border border-[#d9cfca] bg-[#fbf6f0]"><div className="flex items-center justify-between p-5 pb-4 sm:p-6 sm:pb-5"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#c86456]">Up next</p><h2 className="mt-1 font-['Bricolage_Grotesque'] text-2xl font-bold tracking-[-.04em]">Your next game</h2></div><CalendarDays className="h-5 w-5 text-[#c86456]" /></div><GameRow game={games[1]} featured /></section>
                <section className="border border-[#efb37c]/70 bg-[#f7dcc3] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#a94f49]">Commissioner's desk</p><h2 className="mt-1 font-['Bricolage_Grotesque'] text-2xl font-bold tracking-[-.04em]">Needs a look</h2></div><CircleAlert className="h-5 w-5 text-[#a94f49]" /></div><div className="space-y-3"><div className="flex items-start gap-3 bg-[#fff8f0]/70 p-3 text-sm font-semibold"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#c86456] text-[10px] font-bold text-[#fff5ea]">1</span>Score submitted by Court Jesters</div><div className="flex items-start gap-3 bg-[#fff8f0]/70 p-3 text-sm font-semibold"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#c86456] text-[10px] font-bold text-[#fff5ea]">2</span>New roster invite to approve</div></div></section>
              </div>
              <section className="mt-9"><div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#9a817d]">The tape</p><h2 className="mt-1 font-['Bricolage_Grotesque'] text-2xl font-bold tracking-[-.04em]">Recent results</h2></div><div className="flex items-center gap-2"><div className="flex border border-[#d9cfca] bg-[#fbf6f0] p-1">{(["ALL", "UPCOMING", "FINAL"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={`px-3 py-2 font-mono text-[9px] font-bold tracking-[.1em] transition ${filter === item ? "bg-[#3b1f2a] text-[#f8eadf]" : "text-[#9a817d] hover:text-[#3b1f2a]"}`}>{item}</button>)}</div><button onClick={() => setSaved(!saved)} className="grid h-9 w-9 place-items-center border border-[#d9cfca] bg-[#fbf6f0] text-[#c86456]">{saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button></div></div><div className="grid gap-3 md:grid-cols-2">{filteredGames.map((game) => <GameRow key={game.home + game.date} game={game} />)}</div></section>
              <div className="mt-9 flex items-center justify-between border-t border-[#d9cfca] pt-5"><div className="flex items-center gap-3 text-xs text-[#9a817d]"><Clock3 className="h-4 w-4 text-[#c86456]" />Last synced 4 min ago</div><button onClick={() => setActive("Schedule")} className="text-sm font-bold text-[#c86456] hover:underline">Full schedule <ArrowRight className="ml-1 inline h-4 w-4" /></button></div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}