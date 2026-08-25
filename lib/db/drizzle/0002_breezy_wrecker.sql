CREATE TYPE "public"."user_access_state" AS ENUM('PENDING', 'ACTIVE', 'DISABLED');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_state" "user_access_state" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
UPDATE "users" SET "access_state" = CASE WHEN "active" THEN 'ACTIVE'::"user_access_state" ELSE 'DISABLED'::"user_access_state" END;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "access_state" SET DEFAULT 'PENDING';