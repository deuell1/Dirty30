import { useState } from "react";
import {
  useExecuteSeedCleanup,
  useGetSeedCleanupStatus,
  type SeedCleanupCounts,
} from "@workspace/api-client-react";

const CONFIRMATION = "DELETE DIRTY30 SEED DATA";
const labels: Array<[keyof SeedCleanupCounts, string]> = [
  ["seedUsers", "Seed users"],
  ["nonSeedUsers", "Non-seed users"],
  ["leagues", "Seeded leagues"],
  ["seasons", "Seeded seasons"],
  ["teams", "Seeded teams"],
  ["memberships", "Seeded memberships"],
  ["games", "Seeded games"],
  ["invitations", "Seeded invitations"],
  ["venues", "Seeded venues"],
  ["courts", "Seeded courts"],
  ["auditEvents", "Audit events"],
  ["nonSeedMembersOnSeededTeams", "Non-seed memberships on seeded teams"],
  ["nonSeedUsersToDelete", "Non-seed users to delete"],
];
const removedLabels = labels.filter(
  ([key]) =>
    key !== "nonSeedUsers" &&
    key !== "nonSeedMembersOnSeededTeams" &&
    key !== "nonSeedUsersToDelete",
);

export function SeedCleanupPage() {
  const status = useGetSeedCleanupStatus();
  const execute = useExecuteSeedCleanup();
  const [confirmation, setConfirmation] = useState("");
  const result = execute.data ?? status.data;
  const counts = result?.counts;
  const safe = Boolean(status.data?.safeToExecute && !status.data.idempotent);
  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--destructive))]">
        Temporary maintenance
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold">
        Remove demo seed data
      </h1>
      <p className="mt-4 rounded-2xl border border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.06)] p-4 text-sm leading-6">
        This permanently removes the original Dirty-30 demonstration league,
        schedule, rosters, invitations, venues, courts, audit events, and seed
        users. Real Clerk-authenticated, non-seed user accounts are preserved.
        No new league or season will be created.
      </p>
      {status.isLoading ? (
        <p className="mt-6">Running a read-only safety check…</p>
      ) : status.error ? (
        <p className="mt-6 rounded-xl border border-[hsl(var(--destructive)/.35)] p-4">
          The maintenance check could not be loaded. No changes were made.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {labels.map(([key, label]) => (
              <div key={key} className="rounded-xl border p-3">
                <span className="text-sm text-[hsl(var(--muted-foreground))]">
                  {label}
                </span>
                <strong className="ml-2">{counts?.[key] ?? 0}</strong>
              </div>
            ))}
          </div>
          {result?.discrepancies.length ? (
            <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <strong>Count differences:</strong>
              <ul className="mt-2 list-disc pl-5">
                {result.discrepancies.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result?.blockers.length ? (
            <div className="mt-3 rounded-xl border border-[hsl(var(--destructive)/.35)] p-4 text-sm">
              <strong>Execution blocked:</strong>
              <ul className="mt-2 list-disc pl-5">
                {result.blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {execute.data?.complete ? (
            <div className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5">
              <h2 className="font-display text-2xl font-bold">
                Seed Cleanup Complete
              </h2>
              <p className="mt-2 text-sm">
                Removed the demo dataset and preserved{" "}
                {execute.data.preservedNonSeedUsers} non-seed users. Active
                bootstrap commissioner remains:{" "}
                {execute.data.activeBootstrapCommissioner ? "yes" : "no"}.
              </p>
              <p className="mt-2 text-sm">
                League initialization now requires setup; no league or season
                was created.
              </p>
              <h3 className="mt-4 font-bold">Counts removed</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {removedLabels.map(([key, label]) => (
                  <div key={key} className="text-sm">
                    {label}: {execute.data.removed[key]}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm">
                Initialization state: requiresInitialization ={" "}
                {String(execute.data.initialization.requiresInitialization)},
                hasActiveLeague ={" "}
                {String(execute.data.initialization.hasActiveLeague)},
                hasActiveSeason ={" "}
                {String(execute.data.initialization.hasActiveSeason)}.
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border p-5">
              <label
                className="block text-sm font-bold"
                htmlFor="seed-confirmation"
              >
                Type the exact confirmation phrase
              </label>
              <input
                id="seed-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border px-3 font-mono text-sm"
                placeholder={CONFIRMATION}
                autoComplete="off"
              />
              <button
                type="button"
                className="mt-4 min-h-11 rounded-xl bg-[hsl(var(--destructive))] px-4 text-sm font-bold text-white disabled:opacity-50"
                disabled={
                  !safe || confirmation !== CONFIRMATION || execute.isPending
                }
                onClick={() => execute.mutate({ data: { confirmation } })}
              >
                {execute.isPending
                  ? "Removing demo data…"
                  : "Permanently Remove Demo Data"}
              </button>
              {!safe && !result?.idempotent ? (
                <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                  The action remains disabled until every safety check passes.
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
