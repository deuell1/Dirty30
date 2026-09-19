import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  GameStatus,
  getListCourtsQueryKey,
  getListGamesQueryKey,
  getListScheduleWeeksQueryKey,
  type Court,
  type Game,
  type ScheduleWeek,
  type Team,
  type Venue,
  useCancelGame,
  useCreateGame,
  useListCourts,
  useListVenues,
  usePublishGame,
  useUpdateGame,
} from "@workspace/api-client-react";
import { scheduleFormForEdit } from "./schedule-form";
import { ScoreActions } from "./score-actions";

const fieldClass =
  "mt-1 min-h-[44px] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-base outline-none focus:border-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

function toTwentyFourHour(value: string) {
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return value;
  let hour = Number(match[1]);
  if (match[3].toUpperCase() === "PM" && hour !== 12) hour += 12;
  if (match[3].toUpperCase() === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error) {
    const value = error as { data?: { error?: string }; message?: string };
    return (
      value.data?.error ?? value.message ?? "That change could not be saved."
    );
  }
  return "That change could not be saved.";
}

export function isSchedulingLocked(game?: Pick<Game, "status">) {
  return Boolean(game) && game?.status !== GameStatus.SCHEDULED;
}

export function CommissionerGameEditor({
  game,
  teams,
  scheduleWeeks = [],
  initialScheduleWeekId,
  initialDate,
  onClose,
}: {
  game?: Game;
  teams: Team[];
  scheduleWeeks?: ScheduleWeek[];
  initialScheduleWeekId?: number;
  initialDate?: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const venuesQuery = useListVenues();
  const createGame = useCreateGame();
  const updateGame = useUpdateGame();
  const publishGame = usePublishGame();
  const cancelGame = useCancelGame();
  const initialBase = game
    ? scheduleFormForEdit(game, toTwentyFourHour)
    : {
        homeTeamId: "",
        awayTeamId: "",
        venueId: "",
        courtId: "",
        scheduledAt: `${initialDate ?? ""}T18:00`,
      };
  const initial = {
    ...initialBase,
    scheduleWeekId: String(initialScheduleWeekId ?? ""),
  };
  const [form, setForm] = useState(initial);
  const selectedVenueId = Number(form.venueId);
  const courtsQuery = useListCourts(selectedVenueId || 0, {
    query: {
      queryKey: getListCourtsQueryKey(selectedVenueId || 0),
      enabled: Boolean(selectedVenueId),
    },
  });
  const venues = ((venuesQuery.data ?? []) as Venue[]).filter(
    (venue) => venue.active,
  );
  const courts = ((courtsQuery.data ?? []) as Court[]).filter(
    (court) => court.active,
  );
  const activeTeams = teams.filter((team) => team.active);
  const schedulingLocked = isSchedulingLocked(game);

  useEffect(() => {
    if (!form.venueId && venues[0]) {
      setForm((current) => ({
        ...current,
        venueId: String(venues[0].id),
      }));
    }
  }, [form.venueId, venues]);

  useEffect(() => {
    if (!form.courtId && courts[0]) {
      setForm((current) => ({ ...current, courtId: String(courts[0].id) }));
    }
  }, [courts, form.courtId]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: getListGamesQueryKey() });
    void client.invalidateQueries({ queryKey: getListScheduleWeeksQueryKey() });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (schedulingLocked) return;
    const scheduled = new Date(form.scheduledAt);
    const input = {
      homeTeamId: Number(form.homeTeamId),
      awayTeamId: Number(form.awayTeamId),
      venueId: Number(form.venueId),
      courtId: Number(form.courtId),
      scheduleWeekId: Number(form.scheduleWeekId),
      scheduledAt: scheduled.toISOString(),
    };
    if (
      !Number.isFinite(scheduled.getTime()) ||
      Object.values(input).some((value) => !value)
    )
      return;

    const onSuccess = () => {
      refresh();
      onClose();
    };
    if (game) {
      updateGame.mutate({ gameId: game.id, data: input }, { onSuccess });
    } else {
      createGame.mutate({ data: input }, { onSuccess });
    }
  };

  const error = [
    createGame.error,
    updateGame.error,
    publishGame.error,
    cancelGame.error,
  ].find(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-editor-title"
    >
      <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[24px] bg-[hsl(var(--background))] shadow-2xl sm:rounded-[24px]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-[hsl(var(--background))] p-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
              Commissioner
            </p>
            <h2
              id="game-editor-title"
              className="font-display text-2xl font-bold truncate"
            >
              {game ? "Edit game" : "Add game"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="action-close-editor"
            className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border hover:bg-[hsl(var(--muted)/.5)] transition-colors"
            aria-label="Close game editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {schedulingLocked && (
            <p className="mb-4 rounded-xl bg-[hsl(var(--accent)/.2)] p-3 text-sm font-semibold">
              Scheduling fields are locked after a game enters scoring or is
              finalized. Score correction remains available below and uses the
              audited score workflow.
            </p>
          )}
          {error && (
            <p className="mb-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">
              {errorMessage(error)}
            </p>
          )}

          <form onSubmit={save} className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Home team"
                value={form.homeTeamId}
                disabled={schedulingLocked}
                onChange={(value) =>
                  setForm((current) => ({ ...current, homeTeamId: value }))
                }
                options={activeTeams.map((team) => [team.id, team.name])}
                testId="select-home-team"
              />
              <Select
                label="Away team"
                value={form.awayTeamId}
                disabled={schedulingLocked}
                onChange={(value) =>
                  setForm((current) => ({ ...current, awayTeamId: value }))
                }
                options={activeTeams.map((team) => [team.id, team.name])}
                testId="select-away-team"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Schedule week"
                value={form.scheduleWeekId}
                disabled={schedulingLocked}
                onChange={(value) => {
                  const week = scheduleWeeks.find(
                    (candidate) => candidate.id === Number(value),
                  );
                  setForm((current) => ({
                    ...current,
                    scheduleWeekId: value,
                    scheduledAt: week
                      ? `${week.playDate}T${current.scheduledAt.split("T")[1] ?? "18:00"}`
                      : current.scheduledAt,
                  }));
                }}
                options={scheduleWeeks.map((week) => [
                  week.id,
                  `Week ${week.weekNumber}`,
                ])}
                testId="select-schedule-week"
              />
              <Select
                label="Venue"
                value={form.venueId}
                disabled={schedulingLocked}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    venueId: value,
                    courtId: "",
                  }))
                }
                options={venues.map((venue) => [venue.id, venue.name])}
                testId="select-venue"
              />
              <Select
                label="Court"
                value={form.courtId}
                disabled={schedulingLocked}
                onChange={(value) =>
                  setForm((current) => ({ ...current, courtId: value }))
                }
                options={courts.map((court) => [court.id, court.name])}
                testId="select-court"
              />
            </div>
            <label className="text-xs font-bold">
              Date & start time
              <input
                type="datetime-local"
                value={form.scheduledAt}
                disabled={schedulingLocked}
                data-testid="input-scheduled-at"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scheduledAt: event.target.value,
                  }))
                }
                className={fieldClass}
              />
            </label>
            {!schedulingLocked && (
              <button
                type="submit"
                disabled={createGame.isPending || updateGame.isPending}
                data-testid="action-save-game"
                className="min-h-[44px] rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-sm disabled:opacity-50 transition-opacity hover:opacity-90 mt-2"
              >
                {game ? "Save schedule changes" : "Save draft game"}
              </button>
            )}
          </form>

          {game && (
            <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap">
              {!game.published && game.status === GameStatus.SCHEDULED && (
                <button
                  type="button"
                  data-testid="action-publish-game"
                  onClick={() =>
                    publishGame.mutate(
                      { gameId: game.id },
                      { onSuccess: refresh },
                    )
                  }
                  className="min-h-[44px] flex-1 sm:flex-none rounded-xl border px-4 text-sm font-bold shadow-sm hover:border-[hsl(var(--primary))] transition-colors"
                >
                  Publish game
                </button>
              )}
              {game.status !== GameStatus.FINAL &&
                game.status !== GameStatus.CANCELLED && (
                  <button
                    type="button"
                    data-testid="action-cancel-game"
                    onClick={() =>
                      cancelGame.mutate(
                        { gameId: game.id },
                        { onSuccess: refresh },
                      )
                    }
                    className="min-h-[44px] flex-1 sm:flex-none rounded-xl border border-[hsl(var(--destructive)/.45)] px-4 text-sm font-bold text-[hsl(var(--destructive))] shadow-sm hover:border-[hsl(var(--destructive))] transition-colors"
                  >
                    Cancel game
                  </button>
                )}
            </div>
          )}

          {game && <ScoreActions game={game} />}
        </div>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  disabled,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<[number, string]>;
  testId?: string;
}) {
  return (
    <label className="text-xs font-bold">
      {label}
      <select
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        <option value="">Choose {label.toLowerCase()}</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
