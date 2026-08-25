import { useState, type FormEvent } from "react";
import {
  GameStatus,
  getGetDashboardQueryKey,
  getGetGameQueryKey,
  getGetScoreReviewQueueQueryKey,
  getGetStandingsQueryKey,
  getListGamesQueryKey,
  type Game,
  useConfirmScore,
  useCorrectScore,
  useDisputeScore,
  useResolveScore,
  useSubmitScore,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function errorMessage(error: unknown) {
  if (typeof error === "object" && error) {
    const value = error as { data?: { error?: string }; message?: string };
    return value.data?.error ?? value.message ?? "The score change could not be saved.";
  }
  return "The score change could not be saved.";
}

export function ScoreActions({ game }: { game: Game }) {
  const client = useQueryClient();
  const submit = useSubmitScore();
  const confirm = useConfirmScore();
  const dispute = useDisputeScore();
  const resolve = useResolveScore();
  const correct = useCorrectScore();
  const [homeScore, setHomeScore] = useState(game.homeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(game.awayScore?.toString() ?? "");
  const [reason, setReason] = useState("");
  const [confirmCorrection, setConfirmCorrection] = useState(false);
  const scoreInput = { homeScore: Number(homeScore), awayScore: Number(awayScore) };
  const ready = homeScore !== "" && awayScore !== "" && Number.isInteger(scoreInput.homeScore) && Number.isInteger(scoreInput.awayScore) && scoreInput.homeScore >= 0 && scoreInput.awayScore >= 0;
  const refresh = () => void Promise.all([
    client.invalidateQueries({ queryKey: getGetGameQueryKey(game.id) }),
    client.invalidateQueries({ queryKey: getListGamesQueryKey() }),
    client.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
    client.invalidateQueries({ queryKey: getGetScoreReviewQueueQueryKey() }),
    client.invalidateQueries({ queryKey: getGetStandingsQueryKey() }),
  ]);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    if (game.status === GameStatus.DISPUTED) {
      resolve.mutate({ gameId: game.id, data: scoreInput }, { onSuccess: refresh });
    } else if (game.canManageScore) {
      if (game.status === GameStatus.FINAL && !confirmCorrection) { setConfirmCorrection(true); return; }
      correct.mutate({ gameId: game.id, data: scoreInput }, { onSuccess: refresh });
    } else {
      submit.mutate({ gameId: game.id, data: scoreInput }, { onSuccess: refresh });
    }
  };
  const error = [submit.error, confirm.error, dispute.error, resolve.error, correct.error].find(Boolean);

  if (game.status === GameStatus.CANCELLED) return <StatusCard title="This game was cancelled." detail="No score can be recorded for a cancelled game." />;
  if (game.status === GameStatus.DISPUTED && !game.canManageScore) return <StatusCard title="Awaiting commissioner resolution" detail={game.disputeReason ? `Dispute reason: ${game.disputeReason}` : "A captain disputed this score. The commissioner will resolve it."} />;
  if (game.status === GameStatus.FINAL && !game.canManageScore) return <StatusCard title="Final score" detail="This verified result is now counted in the standings." />;

  return <section className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6" data-testid="score-actions">
    <p className="font-mono-custom text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--destructive))]">Game-day action</p>
    <h2 className="mt-1 font-display text-2xl font-bold">{game.status === GameStatus.PENDING_CONFIRMATION ? "Confirm or dispute score" : game.status === GameStatus.DISPUTED ? "Resolve disputed score" : game.status === GameStatus.FINAL ? "Correct final score" : game.canManageScore ? "Enter official score" : "Submit the score"}</h2>
    {error && <p className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] p-3 text-sm font-semibold text-[hsl(var(--destructive))]">{errorMessage(error)}</p>}
    {game.status === GameStatus.PENDING_CONFIRMATION && game.scoreSubmittedByCurrentUser && !game.canManageScore ? <StatusCard title="Awaiting opposing captain" detail="The other team's captain must confirm or dispute before this score reaches standings." /> : null}
    {game.status === GameStatus.PENDING_CONFIRMATION && game.canConfirmOrDisputeScore ? <div className="mt-4 space-y-3"><p className="rounded-xl bg-[hsl(var(--muted)/.65)] p-3 text-sm">Submitted score: <strong>{game.homeScore} – {game.awayScore}</strong></p><label className="block text-xs font-bold">Dispute reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm" placeholder="Required only if disputing" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => confirm.mutate({ gameId: game.id }, { onSuccess: refresh })} className="min-h-11 rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))]">Confirm score</button><button type="button" disabled={reason.trim().length < 3} onClick={() => dispute.mutate({ gameId: game.id, data: { reason: reason.trim() } }, { onSuccess: refresh })} className="min-h-11 rounded-xl border border-[hsl(var(--border))] px-4 text-sm font-bold disabled:opacity-50">Dispute</button></div></div> : null}
    {(game.canSubmitScore || game.status === GameStatus.DISPUTED && game.canManageScore || game.canManageScore && (game.status === GameStatus.FINAL || game.status === GameStatus.SCHEDULED && game.published)) && <form onSubmit={save} className="mt-4"><div className="grid grid-cols-2 gap-3"><ScoreField label={game.homeTeam} value={homeScore} onChange={setHomeScore} /><ScoreField label={game.awayTeam} value={awayScore} onChange={setAwayScore} /></div>{confirmCorrection && <p className="mt-3 rounded-xl bg-[hsl(var(--accent)/.24)] p-3 text-sm font-semibold">Confirm this final-score correction. The before and after values will be recorded in the audit log.</p>}<button type="submit" disabled={!ready} className="mt-4 min-h-11 w-full rounded-xl bg-[hsl(var(--primary))] px-4 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50">{game.status === GameStatus.DISPUTED ? "Resolve & finalize score" : game.status === GameStatus.FINAL ? confirmCorrection ? "Confirm correction" : "Continue to correction" : game.canManageScore ? "Finalize official score" : "Submit score"}</button></form>}
    {game.status === GameStatus.DISPUTED && game.canManageScore && game.disputeReason && <p className="mt-4 rounded-xl bg-[hsl(var(--accent)/.18)] p-3 text-sm">Dispute reason: {game.disputeReason}</p>}
    <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">Every submitted, confirmed, disputed, resolved, and corrected score is recorded in the league audit trail.</p>
  </section>;
}

function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold">{label}<input type="number" min="0" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 font-mono-custom text-xl" /></label>;
}

function StatusCard({ title, detail }: { title: string; detail: string }) {
  return <div className="mt-4 rounded-xl bg-[hsl(var(--muted)/.65)] p-4"><p className="font-bold">{title}</p><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{detail}</p></div>;
}