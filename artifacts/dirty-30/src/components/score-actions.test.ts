import { describe, expect, it } from "vitest";
import { GameStatus, type Game } from "@workspace/api-client-react";
import { scoreWorkflowAction } from "./score-actions";

describe("score edit workflow", () => {
  it("requires explicit confirmation before correcting a finalized game", () => {
    const game = {
      status: GameStatus.FINAL,
      canManageScore: true,
    } as Game;

    expect(scoreWorkflowAction(game, false)).toBe("confirm-correction");
    expect(scoreWorkflowAction(game, true)).toBe("correct");
  });

  it("keeps disputed scores in the audited commissioner resolution path", () => {
    expect(
      scoreWorkflowAction(
        {
          status: GameStatus.DISPUTED,
          canManageScore: true,
        } as Game,
        false,
      ),
    ).toBe("resolve");
  });

  it("routes ordinary score entry through submit instead of correction", () => {
    expect(
      scoreWorkflowAction(
        {
          status: GameStatus.SCHEDULED,
          canManageScore: false,
        } as Game,
        false,
      ),
    ).toBe("submit");
  });
});
