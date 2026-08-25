export type EditableScheduleGame = {
  homeTeamId?: number;
  awayTeamId?: number;
  venueId?: number;
  courtId?: number;
  date: string;
  startTime: string;
};

export function scheduleFormForEdit(game: EditableScheduleGame, toTwentyFourHour: (value: string) => string) {
  return {
    homeTeamId: String(game.homeTeamId ?? ""),
    awayTeamId: String(game.awayTeamId ?? ""),
    venueId: String(game.venueId ?? ""),
    courtId: String(game.courtId ?? ""),
    scheduledAt: `${game.date}T${toTwentyFourHour(game.startTime)}`,
  };
}