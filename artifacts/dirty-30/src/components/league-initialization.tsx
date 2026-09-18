import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDashboardQueryKey,
  getGetLeagueInitializationStatusQueryKey,
  useInitializeLeague,
  type LeagueInitializationStatus,
} from "@workspace/api-client-react";

export function shouldShowLeagueInitialization(
  role: string | undefined,
  accessState: string | undefined,
  status: LeagueInitializationStatus | undefined,
) {
  return (
    role === "COMMISSIONER" &&
    accessState === "ACTIVE" &&
    status?.requiresInitialization === true
  );
}

export function LeagueInitializationScreen({
  status,
}: {
  status: LeagueInitializationStatus;
}) {
  const queryClient = useQueryClient();
  const initialize = useInitializeLeague();
  const [leagueName, setLeagueName] = useState(status.leagueName ?? "");
  const [seasonName, setSeasonName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [validationError, setValidationError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setValidationError(undefined);
    if (endDate < startDate) {
      setValidationError("Season end date must be on or after its start date.");
      return;
    }
    initialize.mutate(
      {
        data: {
          leagueName: leagueName.trim(),
          seasonName: seasonName.trim(),
          startDate,
          endDate,
        },
      },
      {
        onSuccess: () => {
          queryClient.setQueryData(getGetLeagueInitializationStatusQueryKey(), {
            requiresInitialization: false,
            hasActiveLeague: true,
            hasActiveSeason: true,
            leagueName: leagueName.trim(),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetDashboardQueryKey(),
          });
        },
        onError: () => {
          void queryClient.invalidateQueries({
            queryKey: getGetLeagueInitializationStatusQueryKey(),
          });
        },
      },
    );
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[hsl(var(--background))] p-5">
      <section className="w-full max-w-xl rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
          Commissioner setup
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold">
          Start your league
        </h1>
        <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
          Create the first season. Teams, players, venues, and games will stay
          empty until you add them.
        </p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-bold">
            League name
            <input
              value={leagueName}
              onChange={(event) => setLeagueName(event.target.value)}
              disabled={status.hasActiveLeague}
              required
              maxLength={160}
              className="mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3 disabled:opacity-60"
            />
          </label>
          <label className="block text-sm font-bold">
            Season name
            <input
              value={seasonName}
              onChange={(event) => setSeasonName(event.target.value)}
              required
              maxLength={160}
              className="mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3"
              placeholder="Spring 2027"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold">
              Season start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
                className="mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3"
              />
            </label>
            <label className="block text-sm font-bold">
              Season end date
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => setEndDate(event.target.value)}
                required
                className="mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-transparent px-3"
              />
            </label>
          </div>
          {(validationError || initialize.error) && (
            <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
              {validationError ??
                "League setup could not be completed. Refresh and try again."}
            </p>
          )}
          <button
            type="submit"
            disabled={
              initialize.isPending ||
              !leagueName.trim() ||
              !seasonName.trim() ||
              !startDate ||
              !endDate
            }
            className="min-h-11 w-full rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {initialize.isPending ? "Creating league…" : "Create league"}
          </button>
        </form>
      </section>
    </main>
  );
}
