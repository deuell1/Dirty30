import { useState, useEffect, useRef, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ScheduleGeneratorInputFormat,
  ScheduleGeneratorInputMaxMatchesPerTeamPerDate,
  usePreviewScheduleGenerator,
  useCommitScheduleGenerator,
  useListTeams,
  useListVenues,
  useListCourts,
  getListGamesQueryKey,
  getListCourtsQueryKey,
  type Court,
  type Team,
  type Venue,
  type ScheduleGeneratorPreview,
} from "@workspace/api-client-react";
import {
  Check,
  AlertTriangle,
  Calendar as CalendarIcon,
  Clock,
  X,
} from "lucide-react";

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const err = error as { data?: { error?: string }; message?: string };
    return err.data?.error || err.message || "An unexpected error occurred.";
  }
  return String(error);
}

function formatTime12Hour(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return time;
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]";
const subtleButton =
  "min-h-[44px] rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-bold hover:border-[hsl(var(--primary))]";
const actionButton =
  "min-h-[44px] rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50";

export function ScheduleGenerator() {
  const client = useQueryClient();
  const venuesQuery = useListVenues();
  const teamsQuery = useListTeams();

  const venues = ((venuesQuery.data as Venue[]) ?? []).filter((v) => v.active);
  const teams = ((teamsQuery.data as Team[]) ?? []).filter((t) => t.active);

  const [format, setFormat] = useState<ScheduleGeneratorInputFormat>(
    ScheduleGeneratorInputFormat.SINGLE,
  );
  const [venueId, setVenueId] = useState<number>(0);
  const [courtIds, setCourtIds] = useState<number[]>([]);
  const [firstPlayDate, setFirstPlayDate] = useState<string>("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([
    "18:00",
    "19:00",
    "20:00",
  ]);
  const [newTime, setNewTime] = useState("");
  const [maxMatches, setMaxMatches] =
    useState<ScheduleGeneratorInputMaxMatchesPerTeamPerDate>(
      ScheduleGeneratorInputMaxMatchesPerTeamPerDate.NUMBER_1,
    );

  const [previewData, setPreviewData] =
    useState<ScheduleGeneratorPreview | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    createdCount: number;
    noOp: boolean;
  } | null>(null);

  const preview = usePreviewScheduleGenerator();
  const commit = useCommitScheduleGenerator();

  const courtsQuery = useListCourts(venueId || 0, {
    query: {
      queryKey: getListCourtsQueryKey(venueId || 0),
      enabled: Boolean(venueId),
    },
  });
  const courts = ((courtsQuery.data as Court[]) ?? []).filter((c) => c.active);

  // Initialize defaults
  useEffect(() => {
    if (venues.length > 0 && !venueId) {
      setVenueId(venues[0].id);
    }
  }, [venues, venueId]);

  // Set default first play date to next Saturday if empty
  useEffect(() => {
    if (!firstPlayDate) {
      const d = new Date();
      d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
      setFirstPlayDate(d.toISOString().split("T")[0]);
    }
  }, [firstPlayDate]);

  useEffect(() => {
    if (firstPlayDate && weekdays.length === 0) {
      const d = new Date(firstPlayDate);
      const parts = firstPlayDate.split("-");
      if (parts.length === 3) {
        const local = new Date(
          Number(parts[0]),
          Number(parts[1]) - 1,
          Number(parts[2]),
        );
        setWeekdays([local.getDay()]);
      }
    }
  }, [firstPlayDate, weekdays]);

  // Sync courtIds when courts list updates (e.g. venue changes)
  useEffect(() => {
    const activeCourtIds = courts.map((c) => c.id);
    const validSelected = courtIds.filter((id) => activeCourtIds.includes(id));
    if (validSelected.length === 0 && activeCourtIds.length > 0) {
      setCourtIds(activeCourtIds);
    } else if (validSelected.length !== courtIds.length) {
      setCourtIds(validSelected);
    }
  }, [courts, courtIds]);

  const previewRequestId = useRef(0);

  // Clear preview anytime an input changes
  useEffect(() => {
    previewRequestId.current += 1;
    setPreviewData(null);
    setShowConfirm(false);
    setCommitResult(null);
  }, [
    format,
    venueId,
    courtIds,
    firstPlayDate,
    weekdays,
    timeSlots,
    maxMatches,
  ]);

  const handlePreview = (e: FormEvent) => {
    e.preventDefault();
    setCommitResult(null);
    if (
      !venueId ||
      courtIds.length === 0 ||
      !firstPlayDate ||
      weekdays.length === 0 ||
      timeSlots.length === 0
    )
      return;

    const currentRequestId = ++previewRequestId.current;

    preview.mutate(
      {
        data: {
          format,
          venueId,
          courtIds,
          firstPlayDate,
          weekdays,
          timeSlots,
          maxMatchesPerTeamPerDate: maxMatches,
        },
      },
      {
        onSuccess: (data) => {
          if (previewRequestId.current === currentRequestId) {
            setPreviewData(data);
            setShowConfirm(false);
          }
        },
      },
    );
  };

  const handleCommit = () => {
    if (!previewData) return;
    commit.mutate(
      {
        data: {
          format,
          venueId,
          courtIds,
          firstPlayDate,
          weekdays,
          timeSlots,
          maxMatchesPerTeamPerDate: maxMatches,
          confirm: true,
          previewHash: previewData.previewHash,
        },
      },
      {
        onSuccess: (result) => {
          setCommitResult({
            createdCount: result.createdCount,
            noOp: result.noOp,
          });
          setPreviewData(null);
          setShowConfirm(false);
          void client.invalidateQueries({ queryKey: getListGamesQueryKey() });
        },
      },
    );
  };

  const toggleCourt = (id: number) => {
    setCourtIds((curr) =>
      curr.includes(id) ? curr.filter((c) => c !== id) : [...curr, id],
    );
  };

  const toggleWeekday = (day: number) => {
    setWeekdays((curr) =>
      curr.includes(day) ? curr.filter((d) => d !== day) : [...curr, day],
    );
  };

  const addTimeSlot = () => {
    if (newTime && !timeSlots.includes(newTime)) {
      setTimeSlots((curr) => [...curr, newTime].sort());
      setNewTime("");
    }
  };

  const removeTimeSlot = (time: string) => {
    setTimeSlots((curr) => curr.filter((t) => t !== time));
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <section className="rounded-2xl bg-[hsl(var(--card))] p-4 sm:p-5 border border-[hsl(var(--border))] mt-5">
      <h3 className="font-display text-xl font-bold mb-1">Generate schedule</h3>
      <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5 leading-relaxed">
        Generate unpublished drafts for {teams.length} active teams:{" "}
        {teams.map((t) => t.name).join(", ")}.
      </p>

      {commitResult && (
        <div
          className={`mb-5 p-4 rounded-xl ${commitResult.noOp ? "bg-[hsl(var(--muted))]" : "bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"}`}
        >
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5" />
            <div>
              <p className="font-bold">
                {commitResult.noOp
                  ? "No new games created"
                  : "Schedule generated!"}
              </p>
              <p className="text-xs">
                {commitResult.createdCount} draft games added to the board.
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handlePreview} className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold block mb-1">Format</label>
            <div className="flex gap-2">
              {[
                ScheduleGeneratorInputFormat.SINGLE,
                ScheduleGeneratorInputFormat.DOUBLE,
              ].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 min-h-[44px] rounded-lg border text-xs font-bold transition-colors ${format === f ? "bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]"}`}
                >
                  {f === "SINGLE" ? "Single Round Robin" : "Double Round Robin"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">Venue</label>
            <select
              value={venueId}
              onChange={(e) => {
                setVenueId(Number(e.target.value));
              }}
              className={fieldClass}
            >
              {venues.length === 0 && (
                <option value={0}>No active venues</option>
              )}
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">
              Active Courts
            </label>
            {courts.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No active courts for this venue.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {courts.map((c) => {
                  const active = courtIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCourt(c.id)}
                      className={`min-h-[44px] px-4 rounded-lg border text-sm transition-colors ${active ? "bg-[hsl(var(--primary)/.1)] border-[hsl(var(--primary))] text-[hsl(var(--primary))] font-bold" : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]"}`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">
              Max Matches / Team / Date
            </label>
            <div className="flex gap-2">
              {[
                ScheduleGeneratorInputMaxMatchesPerTeamPerDate.NUMBER_1,
                ScheduleGeneratorInputMaxMatchesPerTeamPerDate.NUMBER_2,
              ].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMaxMatches(m)}
                  className={`flex-1 min-h-[44px] rounded-lg border text-xs font-bold transition-colors ${maxMatches === m ? "bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]"}`}
                >
                  {m} Match{m > 1 ? "es" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold block mb-1">
              First Play Date
            </label>
            <input
              type="date"
              value={firstPlayDate}
              onChange={(e) => setFirstPlayDate(e.target.value)}
              className={fieldClass}
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">
              Play Days (Weekdays)
            </label>
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {dayNames.map((name, i) => {
                const active = weekdays.includes(i);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleWeekday(i)}
                    className={`flex-1 sm:flex-none min-w-[44px] min-h-[44px] rounded-lg border text-xs transition-colors ${active ? "bg-[hsl(var(--primary)/.1)] border-[hsl(var(--primary))] text-[hsl(var(--primary))] font-bold" : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]"}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold block mb-1">Time Slots</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {timeSlots.map((time) => (
                <span
                  key={time}
                  className="inline-flex items-center gap-1 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-lg pl-3 pr-1 py-1 min-h-[44px] text-sm font-mono-custom font-bold"
                >
                  {formatTime12Hour(time)}
                  <button
                    type="button"
                    onClick={() => removeTimeSlot(time)}
                    aria-label={`Remove time slot ${formatTime12Hour(time)}`}
                    className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className={`flex-1 ${fieldClass}`}
              />
              <button
                type="button"
                onClick={addTimeSlot}
                disabled={!newTime}
                className={`${subtleButton} px-5`}
              >
                Add
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={
                preview.isPending ||
                !venueId ||
                courtIds.length === 0 ||
                !firstPlayDate ||
                weekdays.length === 0 ||
                timeSlots.length === 0
              }
              className={`w-full ${actionButton}`}
            >
              {preview.isPending ? "Generating..." : "Preview schedule"}
            </button>
            {preview.error && (
              <p className="mt-2 text-sm text-[hsl(var(--destructive))] font-bold">
                {getErrorMessage(preview.error)}
              </p>
            )}
          </div>
        </div>
      </form>

      {previewData && (
        <div className="mt-6 border-t border-[hsl(var(--border))] pt-6 animate-rise">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-display text-xl font-bold">Schedule Preview</h4>
            <span className="rounded-full bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))] px-3 py-1 text-xs font-bold uppercase tracking-wider">
              {previewData.format}
            </span>
          </div>

          {(previewData.warnings?.length ?? 0) > 0 && (
            <div className="mb-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-4 text-[hsl(var(--destructive))]">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <ul className="text-sm font-semibold space-y-1">
                  {previewData.warnings?.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-center bg-[hsl(var(--muted)/.3)]">
              <p className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                Total Matches
              </p>
              <p className="text-2xl font-mono-custom font-bold">
                {previewData.totalMatches}
              </p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-center bg-[hsl(var(--muted)/.3)]">
              <p className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                Teams
              </p>
              <p className="text-2xl font-mono-custom font-bold">
                {previewData.teamCount}
              </p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-center bg-[hsl(var(--muted)/.3)]">
              <p className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                Dates
              </p>
              <p className="text-2xl font-mono-custom font-bold">
                {previewData.playDatesUsed.length}
              </p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-center bg-[hsl(var(--muted)/.3)]">
              <p className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">
                Byes
              </p>
              <p className="text-2xl font-mono-custom font-bold">
                {previewData.byes.length}
              </p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-3">
                Games per Team
              </h5>
              <div className="space-y-1">
                {Object.entries(previewData.gamesPerTeam).map(
                  ([teamId, count]) => {
                    const teamName =
                      teams.find((t) => t.id === Number(teamId))?.name ??
                      `Team ${teamId}`;
                    const ha = previewData.homeAway[teamId] || {
                      home: 0,
                      away: 0,
                    };
                    return (
                      <div
                        key={teamId}
                        className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm border-b border-[hsl(var(--border))] py-2 last:border-0 gap-1 sm:gap-2"
                      >
                        <span className="break-words font-semibold">
                          {teamName}
                        </span>
                        <div className="shrink-0 flex items-center gap-3 font-mono-custom">
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            {ha.home}H {ha.away}A
                          </span>
                          <span className="font-bold">{count} total</span>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            {previewData.byes.length > 0 && (
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-3">
                  Byes (No Matches)
                </h5>
                <div className="space-y-1">
                  {previewData.byes.map((b, i) => {
                    const teamName =
                      teams.find((t) => t.id === b.teamId)?.name ??
                      `Team ${b.teamId}`;
                    return (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm border-b border-[hsl(var(--border))] py-2 last:border-0 gap-1 sm:gap-2"
                      >
                        <span className="break-words font-semibold">
                          {teamName}
                        </span>
                        <span className="font-mono-custom font-bold text-xs text-[hsl(var(--muted-foreground))]">
                          Round {b.round}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <h5 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-3">
            Generated Games
          </h5>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.1)] p-1">
            {(() => {
              // Group games by date -> time
              const grouped: Record<
                string,
                Record<string, typeof previewData.games>
              > = {};
              previewData.games.forEach((g) => {
                if (!grouped[g.date]) grouped[g.date] = {};
                if (!grouped[g.date][g.time]) grouped[g.date][g.time] = [];
                grouped[g.date][g.time].push(g);
              });

              return Object.entries(grouped)
                .sort()
                .map(([date, times]) => (
                  <div
                    key={date}
                    className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] overflow-hidden"
                  >
                    <div className="bg-[hsl(var(--muted))] px-3 py-2 text-sm font-bold flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {date}
                    </div>
                    <div className="divide-y divide-[hsl(var(--border))]">
                      {Object.entries(times)
                        .sort()
                        .map(([time, matches]) => (
                          <div key={time} className="p-3">
                            <div className="text-xs font-bold text-[hsl(var(--primary))] flex items-center gap-1.5 mb-2">
                              <Clock className="h-3.5 w-3.5" />
                              {formatTime12Hour(time)}
                            </div>
                            <div className="space-y-2">
                              {matches.map((m, i) => {
                                const homeName =
                                  teams.find((t) => t.id === m.homeTeamId)
                                    ?.name ?? `Team ${m.homeTeamId}`;
                                const awayName =
                                  teams.find((t) => t.id === m.awayTeamId)
                                    ?.name ?? `Team ${m.awayTeamId}`;
                                const courtName =
                                  courts.find((c) => c.id === m.courtId)
                                    ?.name ?? `Court ${m.courtId}`;

                                return (
                                  <div
                                    key={i}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm bg-[hsl(var(--background))] p-2 rounded border border-[hsl(var(--border))]"
                                  >
                                    <div className="font-bold flex-1 break-words whitespace-normal min-w-0">
                                      {homeName}{" "}
                                      <span className="text-[hsl(var(--muted-foreground))] font-normal">
                                        vs
                                      </span>{" "}
                                      {awayName}
                                    </div>
                                    <div className="text-xs text-[hsl(var(--muted-foreground))] shrink-0 font-mono-custom flex items-center gap-2">
                                      <span className="bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
                                        {courtName}
                                      </span>
                                      <span>R{m.round}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ));
            })()}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 items-center justify-between bg-[hsl(var(--muted))] p-4 rounded-xl">
            {showConfirm ? (
              <>
                <p className="text-sm font-bold text-[hsl(var(--destructive))]">
                  Are you sure? This will add {previewData.games.length} drafts.
                </p>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCommit}
                    disabled={commit.isPending}
                    className={`flex-1 sm:flex-none ${actionButton}`}
                  >
                    {commit.isPending ? "Generating..." : "Confirm & Save"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Review the schedule before generating drafts.
                </p>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={(previewData.warnings?.length ?? 0) > 0}
                  className={`w-full sm:w-auto ${actionButton}`}
                >
                  Create draft schedule
                </button>
              </>
            )}
          </div>
          {commit.error && (
            <p className="mt-3 text-sm text-[hsl(var(--destructive))] font-bold text-right">
              {getErrorMessage(commit.error)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
