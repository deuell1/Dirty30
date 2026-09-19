import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTeamByes,
  useCreateTeamBye,
  useDeleteTeamBye,
  usePreviewByeReconciliation,
  useCommitByeReconciliation,
  useListTeams,
  getListTeamByesQueryKey,
  getListGamesQueryKey,
  getGetDashboardQueryKey,
  TeamByeSource,
  type TeamBye,
  type ByeReconciliationPreview,
  type Team,
} from "@workspace/api-client-react";
import { AlertTriangle, Check, ShieldAlert, Trash2 } from "lucide-react";

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const err = error as { data?: { error?: string }; message?: string };
    return err.data?.error || err.message || "An unexpected error occurred.";
  }
  return String(error);
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]";
const subtleButton =
  "min-h-[44px] rounded-lg border border-[hsl(var(--border))] px-3 text-xs font-bold hover:border-[hsl(var(--primary))]";
const actionButton =
  "min-h-[44px] rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50";

export function ByeWeekAdmin() {
  const client = useQueryClient();
  const byesQuery = useListTeamByes();
  const teamsQuery = useListTeams();
  const createBye = useCreateTeamBye();
  const deleteBye = useDeleteTeamBye();
  const previewReconciliation = usePreviewByeReconciliation();
  const commitReconciliation = useCommitByeReconciliation();

  const byes = (byesQuery.data ?? []) as TeamBye[];
  const teams = (teamsQuery.data ?? []) as Team[];
  const activeTeams = teams.filter((t) => t.active);

  const [previewData, setPreviewData] =
    useState<ByeReconciliationPreview | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    updatedGames: number;
    createdByes: number;
    noOp: boolean;
  } | null>(null);

  const [formTeamId, setFormTeamId] = useState("");
  const [formScheduleWeek, setFormScheduleWeek] = useState("");
  const [formPlayDate, setFormPlayDate] = useState("");

  const refreshQueries = () => {
    void client.invalidateQueries({ queryKey: getListTeamByesQueryKey() });
    void client.invalidateQueries({ queryKey: getListGamesQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  };

  const handleCreateBye = (e: FormEvent) => {
    e.preventDefault();
    if (!formTeamId || !formScheduleWeek || !formPlayDate) return;
    createBye.mutate(
      {
        data: {
          teamId: Number(formTeamId),
          scheduleWeek: Number(formScheduleWeek),
          playDate: formPlayDate,
        },
      },
      {
        onSuccess: () => {
          setFormTeamId("");
          setFormScheduleWeek("");
          setFormPlayDate("");
          refreshQueries();
        },
      },
    );
  };

  const handleDeleteBye = (teamId: number, scheduleWeek: number) => {
    deleteBye.mutate(
      { params: { teamId, scheduleWeek } },
      {
        onSuccess: refreshQueries,
      },
    );
  };

  const handlePreview = () => {
    setCommitResult(null);
    previewReconciliation.mutate(undefined, {
      onSuccess: (data) => {
        setPreviewData(data);
        setShowConfirm(false);
      },
    });
  };

  const handleCommit = () => {
    if (!previewData?.canCommit) return;
    commitReconciliation.mutate(
      {
        data: { confirm: true, previewHash: previewData.previewHash },
      },
      {
        onSuccess: (result) => {
          setCommitResult({
            updatedGames: result.updatedGames,
            createdByes: result.createdByes,
            noOp: result.noOp,
          });
          setPreviewData(null);
          setShowConfirm(false);
          refreshQueries();
        },
      },
    );
  };

  const error =
    createBye.error ||
    deleteBye.error ||
    previewReconciliation.error ||
    commitReconciliation.error;

  return (
    <section
      id="schedule-byes"
      className="mt-8 space-y-5 rounded-[24px] border border-[hsl(var(--primary)/.3)] bg-[hsl(var(--primary)/.055)] p-4 sm:p-6"
      data-testid="bye-week-admin"
    >
      <div>
        <p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
          Bye Management
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold">
          Manage Byes & Reconcile
        </h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Assign manual byes or run reconciliation to sync schedule gaps with
          bye tracking.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">
          {getErrorMessage(error)}
        </p>
      )}

      {commitResult && (
        <div
          className={`p-4 rounded-xl ${commitResult.noOp ? "bg-[hsl(var(--muted))]" : "bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"}`}
        >
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5" />
            <div>
              <p className="font-bold">
                {commitResult.noOp
                  ? "No changes needed"
                  : "Reconciliation complete!"}
              </p>
              <p className="text-xs">
                {commitResult.createdByes} byes created,{" "}
                {commitResult.updatedGames} games updated.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-[hsl(var(--card))] p-4 border border-[hsl(var(--border))]">
          <h3 className="font-display text-lg font-bold mb-3">
            Reconcile Byes
          </h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4 leading-relaxed">
            Checks all scheduled games to detect empty slots and missing byes.
            You must preview the changes before committing.
          </p>
          <button
            onClick={handlePreview}
            disabled={previewReconciliation.isPending}
            className={`w-full sm:w-auto ${actionButton}`}
          >
            {previewReconciliation.isPending
              ? "Generating preview..."
              : "Preview Reconciliation"}
          </button>

          {previewData && (
            <div className="mt-6 border-t border-[hsl(var(--border))] pt-5 animate-rise">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-display text-lg font-bold">Preview</h4>
                {previewData.detectedFormat && (
                  <span className="rounded-full bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))] px-3 py-1 text-xs font-bold uppercase">
                    {previewData.detectedFormat}
                  </span>
                )}
              </div>

              {!previewData.canCommit && (
                <div className="mb-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-[hsl(var(--destructive))] flex gap-2 items-start">
                  <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold">
                    Reconciliation blocked. Please resolve the blockers below
                    before committing.
                  </p>
                </div>
              )}

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                {previewData.weeks.map((week) => (
                  <div
                    key={week.scheduleWeek}
                    className="rounded-xl border border-[hsl(var(--border))] overflow-hidden bg-[hsl(var(--background))]"
                  >
                    <div className="bg-[hsl(var(--muted))] px-3 py-2 text-sm font-bold flex justify-between items-center">
                      <span>
                        Week {week.scheduleWeek} · {week.playDate}
                      </span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {week.games.length} games, {week.byes.length} byes
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      {week.blockers.length > 0 && (
                        <div className="rounded border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.05)] p-2">
                          <p className="text-xs font-bold text-[hsl(var(--destructive))] mb-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Blockers
                          </p>
                          <ul className="text-xs text-[hsl(var(--destructive))] list-disc pl-4 space-y-1">
                            {week.blockers.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {week.byes.length > 0 ? (
                        <div className="text-xs">
                          <span className="font-bold">Detected Byes:</span>{" "}
                          {week.byes.map((b) => b.teamName).join(", ")}
                        </div>
                      ) : (
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          No byes detected this week.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3 items-center justify-between bg-[hsl(var(--muted)/.5)] p-4 rounded-xl">
                {showConfirm ? (
                  <>
                    <p className="text-sm font-bold text-[hsl(var(--primary))]">
                      Confirm reconciliation?
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
                        disabled={commitReconciliation.isPending}
                        className={`flex-1 sm:flex-none ${actionButton}`}
                      >
                        {commitReconciliation.isPending
                          ? "Committing..."
                          : "Confirm"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      {previewData.canCommit
                        ? "Ready to sync schedule gaps."
                        : "Cannot commit with active blockers."}
                    </p>
                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={!previewData.canCommit}
                      className={`w-full sm:w-auto ${actionButton}`}
                    >
                      Commit Changes
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-[hsl(var(--card))] p-4 border border-[hsl(var(--border))]">
          <h3 className="font-display text-lg font-bold">Manual Byes</h3>
          <form onSubmit={handleCreateBye} className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">
                Team
                <select
                  value={formTeamId}
                  onChange={(e) => setFormTeamId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Select team</option>
                  {activeTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold">
                Schedule Week
                <input
                  type="number"
                  min="1"
                  value={formScheduleWeek}
                  onChange={(e) => setFormScheduleWeek(e.target.value)}
                  className={fieldClass}
                  placeholder="1"
                />
              </label>
            </div>
            <label className="text-xs font-bold">
              Play Date
              <input
                type="date"
                value={formPlayDate}
                onChange={(e) => setFormPlayDate(e.target.value)}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              disabled={
                createBye.isPending ||
                !formTeamId ||
                !formScheduleWeek ||
                !formPlayDate
              }
              className={`w-full sm:w-auto ${actionButton} mt-1`}
            >
              Add Bye
            </button>
          </form>

          <div className="mt-6 border-t border-[hsl(var(--border))] pt-4">
            <h4 className="text-sm font-bold mb-3">Existing Byes</h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {byes.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  No byes recorded.
                </p>
              ) : (
                byes.map((bye) => (
                  <div
                    key={bye.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">
                        {bye.teamName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono-custom">
                          W{bye.scheduleWeek} · {bye.playDate}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                            bye.source === TeamByeSource.MANUAL
                              ? "bg-[hsl(var(--accent)/.2)] text-[hsl(var(--accent))] border border-[hsl(var(--accent)/.3)]"
                              : bye.source === TeamByeSource.RECONCILED
                                ? "bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/.2)]"
                                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]"
                          }`}
                        >
                          {bye.source}
                        </span>
                      </div>
                    </div>
                    {(bye.source === TeamByeSource.MANUAL ||
                      bye.source === TeamByeSource.RECONCILED) && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteBye(bye.teamId, bye.scheduleWeek)
                        }
                        disabled={deleteBye.isPending}
                        className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.1)] rounded-lg transition-colors"
                        aria-label={`Remove bye for ${bye.teamName} week ${bye.scheduleWeek}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
