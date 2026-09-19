CREATE TYPE "public"."team_bye_source" AS ENUM('GENERATED', 'RECONCILED', 'MANUAL');--> statement-breakpoint
CREATE TABLE "team_byes" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"schedule_week" integer NOT NULL,
	"play_date" date NOT NULL,
	"source" "team_bye_source" NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_byes_positive_week" CHECK ("team_byes"."schedule_week" > 0)
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "schedule_week" integer;--> statement-breakpoint
ALTER TABLE "team_byes" ADD CONSTRAINT "team_byes_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_byes" ADD CONSTRAINT "team_byes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_byes" ADD CONSTRAINT "team_byes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_byes_season_team_week" ON "team_byes" USING btree ("season_id","team_id","schedule_week");--> statement-breakpoint
CREATE INDEX "team_byes_season_date_idx" ON "team_byes" USING btree ("season_id","play_date");