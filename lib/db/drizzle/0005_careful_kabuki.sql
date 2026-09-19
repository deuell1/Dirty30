ALTER TABLE "player_invitations" ADD COLUMN "intended_role" "membership_role" DEFAULT 'PLAYER' NOT NULL;--> statement-breakpoint
WITH first_captain_invite AS (
  SELECT DISTINCT ON (invitation."team_id") invitation."id"
  FROM "player_invitations" AS invitation
  JOIN "users" AS inviter ON inviter."id" = invitation."invited_by_user_id"
  WHERE inviter."role" = 'COMMISSIONER'
    AND invitation."status" = 'PENDING'
    AND invitation."expires_at" > NOW()
    AND NOT EXISTS (
      SELECT 1
      FROM "team_memberships" AS membership
      WHERE membership."team_id" = invitation."team_id"
        AND membership."membership_role" = 'CAPTAIN'
        AND membership."active" = true
    )
  ORDER BY invitation."team_id", invitation."created_at", invitation."id"
)
UPDATE "player_invitations" AS invitation
SET "intended_role" = 'CAPTAIN'
FROM first_captain_invite
WHERE invitation."id" = first_captain_invite."id";