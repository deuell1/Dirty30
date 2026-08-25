import { useEffect, useState, type FormEvent } from "react";
import {
  GameStatus,
  getListCourtsQueryKey,
  getListGamesQueryKey,
  getListVenuesQueryKey,
  type Court,
  type Game,
  type Team,
  type Venue,
  useCancelGame,
  useCreateCourt,
  useCreateGame,
  useCreateVenue,
  useListCourts,
  useListGames,
  useListTeams,
  useListVenues,
  usePublishGame,
  useUpdateCourt,
  useUpdateGame,
  useUpdateVenue,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleFormForEdit } from "./schedule-form";

function message(error: unknown) {
  if (typeof error === "object" && error) {
    const value = error as { data?: { error?: string }; message?: string };
    return value.data?.error ?? value.message ?? "The league desk could not save that change.";
  }
  return "The league desk could not save that change.";
}

const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]";
const subtleButton = "min-h-10 rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-bold hover:border-[hsl(var(--primary))]";

export function CommissionerScheduleAdmin() {
  const client = useQueryClient();
  const venues = useListVenues();
  const teams = useListTeams();
  const games = useListGames();
  const [selectedVenueId, setSelectedVenueId] = useState<number>();
  const courts = useListCourts(selectedVenueId ?? 0, { query: { queryKey: getListCourtsQueryKey(selectedVenueId ?? 0), enabled: Boolean(selectedVenueId) } });
  const createVenue = useCreateVenue();
  const updateVenue = useUpdateVenue();
  const createCourt = useCreateCourt();
  const updateCourt = useUpdateCourt();
  const createGame = useCreateGame();
  const updateGame = useUpdateGame();
  const publishGame = usePublishGame();
  const cancelGame = useCancelGame();
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [courtName, setCourtName] = useState("");
  const [editingGame, setEditingGame] = useState<Game>();
  const [form, setForm] = useState({ homeTeamId: "", awayTeamId: "", venueId: "", courtId: "", scheduledAt: "" });

  const venueList = (venues.data ?? []) as Venue[];
  const courtList = (courts.data ?? []) as Court[];
  const teamList = (teams.data ?? []) as Team[];
  const gameList = (games.data ?? []) as Game[];
  const activeVenues = venueList.filter((venue) => venue.active);
  const activeCourts = courtList.filter((court) => court.active);

  useEffect(() => {
    if (!selectedVenueId && activeVenues[0]) setSelectedVenueId(activeVenues[0].id);
  }, [activeVenues, selectedVenueId]);

  useEffect(() => {
    if (!form.venueId && activeVenues[0]) setForm((current) => ({ ...current, venueId: String(activeVenues[0].id) }));
  }, [activeVenues, form.venueId]);

  useEffect(() => {
    const selectedId = Number(form.venueId);
    if (selectedId && selectedId !== selectedVenueId) setSelectedVenueId(selectedId);
  }, [form.venueId, selectedVenueId]);

  useEffect(() => {
    if (!form.courtId && activeCourts[0]) setForm((current) => ({ ...current, courtId: String(activeCourts[0].id) }));
  }, [activeCourts, form.courtId]);

  const refreshSchedule = () => {
    void Promise.all([
      client.invalidateQueries({ queryKey: getListVenuesQueryKey() }),
      client.invalidateQueries({ queryKey: getListCourtsQueryKey(selectedVenueId ?? 0) }),
      client.invalidateQueries({ queryKey: getListGamesQueryKey() }),
    ]);
  };

  const saveVenue = (event: FormEvent) => {
    event.preventDefault();
    if (!venueName.trim()) return;
    createVenue.mutate({ data: { name: venueName.trim(), address: venueAddress.trim() } }, {
      onSuccess: () => { setVenueName(""); setVenueAddress(""); refreshSchedule(); },
    });
  };

  const saveCourt = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVenueId || !courtName.trim()) return;
    createCourt.mutate({ venueId: selectedVenueId, data: { name: courtName.trim() } }, {
      onSuccess: () => { setCourtName(""); refreshSchedule(); },
    });
  };

  const startEdit = (game: Game) => {
    setSelectedVenueId(game.venueId);
    setEditingGame(game);
    setForm(scheduleFormForEdit(game, toTwentyFourHour));
  };

  const clearGame = () => {
    setEditingGame(undefined);
    setForm({ homeTeamId: "", awayTeamId: "", venueId: String(activeVenues[0]?.id ?? ""), courtId: "", scheduledAt: "" });
  };

  const saveGame = (event: FormEvent) => {
    event.preventDefault();
    const input = {
      homeTeamId: Number(form.homeTeamId),
      awayTeamId: Number(form.awayTeamId),
      venueId: Number(form.venueId),
      courtId: Number(form.courtId),
      scheduledAt: new Date(form.scheduledAt).toISOString(),
    };
    if (Object.values(input).some((value) => !value || (typeof value === "string" && Number.isNaN(Date.parse(value))))) return;
    const mutation = editingGame
      ? updateGame.mutate({ gameId: editingGame.id, data: input }, { onSuccess: () => { clearGame(); refreshSchedule(); } })
      : createGame.mutate({ data: input }, { onSuccess: () => { clearGame(); refreshSchedule(); } });
    void mutation;
  };

  const error = [createVenue.error, updateVenue.error, createCourt.error, updateCourt.error, createGame.error, updateGame.error, publishGame.error, cancelGame.error].find(Boolean);

  return <section className="mt-8 space-y-5 rounded-[24px] border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.055)] p-4 sm:p-6" data-testid="commissioner-schedule-admin">
    <div>
      <p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">Commissioner tools</p>
      <h2 className="mt-1 font-display text-2xl font-bold">Build the game board</h2>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Draft games stay visible only to commissioners until published.</p>
    </div>
    {error && <p className="rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">{message(error)}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl bg-[hsl(var(--card))] p-4">
        <h3 className="font-display text-lg font-bold">Venues & courts</h3>
        <form onSubmit={saveVenue} className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-bold">Venue name<input value={venueName} onChange={(event) => setVenueName(event.target.value)} className={fieldClass} placeholder="Northside Rec" /></label>
          <label className="text-xs font-bold">Address<input value={venueAddress} onChange={(event) => setVenueAddress(event.target.value)} className={fieldClass} placeholder="123 Beer League Ave" /></label>
          <button className={subtleButton} type="submit" disabled={createVenue.isPending}>Add venue</button>
        </form>
        <div className="mt-4 space-y-2">
          {venueList.map((venue) => <div key={venue.id} className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] p-3">
            <button type="button" onClick={() => setSelectedVenueId(venue.id)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-bold">{venue.name}</p><p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{venue.address || "No address"}</p></button>
            <button type="button" onClick={() => updateVenue.mutate({ venueId: venue.id, data: { active: !venue.active } }, { onSuccess: refreshSchedule })} className={subtleButton}>{venue.active ? "Deactivate" : "Activate"}</button>
          </div>)}
        </div>
        {selectedVenueId && <div className="mt-5 border-t border-[hsl(var(--border))] pt-4">
          <p className="text-sm font-bold">Courts for {venueList.find((venue) => venue.id === selectedVenueId)?.name ?? "venue"}</p>
          <form onSubmit={saveCourt} className="mt-2 flex gap-2"><input value={courtName} onChange={(event) => setCourtName(event.target.value)} className={fieldClass.replace("mt-1 ", "")} placeholder="Court 1" /><button className={subtleButton} type="submit" disabled={createCourt.isPending}>Add court</button></form>
          <div className="mt-3 space-y-2">{courtList.map((court) => <div key={court.id} className="flex items-center justify-between rounded-lg bg-[hsl(var(--muted)/.6)] p-2.5 text-sm"><span>{court.name}</span><button type="button" onClick={() => updateCourt.mutate({ courtId: court.id, data: { active: !court.active } }, { onSuccess: refreshSchedule })} className="text-xs font-bold text-[hsl(var(--primary))]">{court.active ? "Deactivate" : "Activate"}</button></div>)}</div>
        </div>}
      </section>
      <section className="rounded-2xl bg-[hsl(var(--card))] p-4">
        <div className="flex items-center justify-between"><h3 className="font-display text-lg font-bold">{editingGame ? "Edit game" : "Create draft game"}</h3>{editingGame && <button type="button" onClick={clearGame} className="text-xs font-bold text-[hsl(var(--primary))]">New draft</button>}</div>
        <form onSubmit={saveGame} className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Home team" value={form.homeTeamId} onChange={(value) => setForm((current) => ({ ...current, homeTeamId: value }))} options={teamList.filter((team) => team.active).map((team) => [team.id, team.name])} />
            <Select label="Away team" value={form.awayTeamId} onChange={(value) => setForm((current) => ({ ...current, awayTeamId: value }))} options={teamList.filter((team) => team.active).map((team) => [team.id, team.name])} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Venue" value={form.venueId} onChange={(value) => setForm((current) => ({ ...current, venueId: value, courtId: "" }))} options={activeVenues.map((venue) => [venue.id, venue.name])} />
            <Select label="Court" value={form.courtId} onChange={(value) => setForm((current) => ({ ...current, courtId: value }))} options={activeCourts.map((court) => [court.id, court.name])} />
          </div>
          <label className="text-xs font-bold">Date & start time<input type="datetime-local" value={form.scheduledAt} onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))} className={fieldClass} /></label>
          <button className={subtleButton} type="submit" disabled={createGame.isPending || updateGame.isPending}>{editingGame ? "Save game" : "Save draft"}</button>
        </form>
      </section>
    </div>
    <div className="space-y-2">
      <h3 className="font-display text-lg font-bold">Commissioner schedule</h3>
      {gameList.map((game) => <div key={game.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm">
        <div className="min-w-0 flex-1"><p className="font-bold">{game.homeTeam} vs {game.awayTeam}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{game.date} · {game.startTime} · {game.venue} / {game.court}</p></div>
        <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-1 text-[10px] font-bold">{!game.published ? "DRAFT" : game.status.replaceAll("_", " ")}</span>
        <button type="button" onClick={() => startEdit(game)} className={subtleButton}>Edit</button>
        {!game.published && <button type="button" onClick={() => publishGame.mutate({ gameId: game.id }, { onSuccess: refreshSchedule })} className={subtleButton}>Publish</button>}
        {game.status !== GameStatus.FINAL && game.status !== GameStatus.CANCELLED && <button type="button" onClick={() => cancelGame.mutate({ gameId: game.id }, { onSuccess: refreshSchedule })} className={subtleButton}>Cancel</button>}
      </div>)}
    </div>
  </section>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[number, string]> }) {
  return <label className="text-xs font-bold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass}><option value="">Choose {label.toLowerCase()}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

function toTwentyFourHour(value: string) {
  const parts = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!parts) return "19:00";
  const hour = (Number(parts[1]) % 12) + (parts[3].toUpperCase() === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${parts[2]}`;
}