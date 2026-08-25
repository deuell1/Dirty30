-- Existing development fixtures used email identities before phone OTP existed.
-- Only values that are unambiguously development-only receive reserved 202-555
-- test numbers. Any other record must be resolved deliberately before migration.
UPDATE "users"
SET "phone" = '+1202555' || lpad("id"::text, 4, '0')
WHERE "external_auth_id" LIKE 'seed\_%'
   OR "email" LIKE '%@dirty30.local'
   OR "email" = 'commissioner@dirty30.example.com';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE NOT (
      "external_auth_id" LIKE 'seed\_%'
      OR "email" LIKE '%@dirty30.local'
      OR "email" = 'commissioner@dirty30.example.com'
    )
  ) THEN
    RAISE EXCEPTION 'Phone OTP migration stopped: every non-development user requires an explicit Clerk-verified E.164 phone reconciliation.';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "phone" IS NULL) THEN
    RAISE EXCEPTION 'Phone OTP migration stopped: a non-development user has no phone number. Add a verified E.164 phone before retrying.';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "player_invitations"
    WHERE "invited_email" NOT LIKE '%@dirty30.local'
  ) THEN
    RAISE EXCEPTION 'Phone OTP migration stopped: every non-development invitation requires an explicit verified-phone reconciliation.';
  END IF;
END $$;
--> statement-breakpoint
UPDATE "player_invitations"
SET "invited_email" = '+1202555' || lpad((190 + "id")::text, 4, '0')
WHERE "invited_email" LIKE '%@dirty30.local';
--> statement-breakpoint
DROP INDEX "invitations_pending_team_email";
--> statement-breakpoint
ALTER TABLE "player_invitations" RENAME COLUMN "invited_email" TO "invited_phone";
--> statement-breakpoint
ALTER TABLE "player_invitations" ALTER COLUMN "invited_phone" TYPE varchar(40);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
UPDATE "users"
SET "email" = NULL
WHERE "email" LIKE '%@dirty30.local'
   OR "email" = 'commissioner@dirty30.example.com';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_unique" UNIQUE("phone");
--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_team_phone" ON "player_invitations" USING btree ("team_id", "invited_phone") WHERE "player_invitations"."status" = 'PENDING';