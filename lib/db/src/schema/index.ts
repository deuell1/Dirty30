import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["COMMISSIONER", "CAPTAIN", "PLAYER"]);
export const userAccessStateEnum = pgEnum("user_access_state", ["PENDING", "ACTIVE", "DISABLED"]);
export const membershipRoleEnum = pgEnum("membership_role", ["CAPTAIN", "PLAYER"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "CANCELLED", "EXPIRED"]);
export const gameStatusEnum = pgEnum("game_status", ["DRAFT", "PUBLISHED", "CANCELLED", "PENDING_CONFIRMATION", "DISPUTED", "FINAL"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  externalAuthId: varchar("external_auth_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 320 }).unique(),
  firstName: varchar("first_name", { length: 100 }).notNull().default(""),
  lastName: varchar("last_name", { length: 100 }).notNull().default(""),
  phone: varchar("phone", { length: 40 }).notNull().unique(),
  role: userRoleEnum("role").notNull().default("PLAYER"),
  accessState: userAccessStateEnum("access_state").notNull().default("PENDING"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull().references(() => leagues.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("seasons_one_active_per_league").on(table.leagueId).where(sql`${table.active} = true`),
  check("seasons_valid_dates", sql`${table.endDate} >= ${table.startDate}`),
]);

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => seasons.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex("teams_season_name").on(table.seasonId, table.name)]);

export const teamMemberships = pgTable("team_memberships", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  membershipRole: membershipRoleEnum("membership_role").notNull().default("PLAYER"),
  active: boolean("active").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("memberships_one_active_user_team").on(table.teamId, table.userId).where(sql`${table.active} = true`),
  index("memberships_user_idx").on(table.userId),
]);

export const playerInvitations = pgTable("player_invitations", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "restrict" }),
  invitedPhone: varchar("invited_phone", { length: 40 }).notNull(),
  invitedByUserId: integer("invited_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  status: invitationStatusEnum("status").notNull().default("PENDING"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("invitations_pending_team_phone").on(table.teamId, table.invitedPhone).where(sql`${table.status} = 'PENDING'`),
  index("invitations_token_idx").on(table.tokenHash),
]);

export const venues = pgTable("venues", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull().references(() => leagues.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  address: text("address").notNull().default(""),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const courts = pgTable("courts", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull().references(() => venues.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 100 }).notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex("courts_venue_name").on(table.venueId, table.name)]);

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => seasons.id, { onDelete: "restrict" }),
  homeTeamId: integer("home_team_id").notNull().references(() => teams.id, { onDelete: "restrict" }),
  awayTeamId: integer("away_team_id").notNull().references(() => teams.id, { onDelete: "restrict" }),
  venueId: integer("venue_id").notNull().references(() => venues.id, { onDelete: "restrict" }),
  courtId: integer("court_id").notNull().references(() => courts.id, { onDelete: "restrict" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: gameStatusEnum("status").notNull().default("DRAFT"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  submittedByUserId: integer("submitted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmedByUserId: integer("confirmed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  disputeReason: text("dispute_reason"),
  disputedByUserId: integer("disputed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  disputedAt: timestamp("disputed_at", { withTimezone: true }),
  resolvedByUserId: integer("resolved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("games_season_schedule_idx").on(table.seasonId, table.scheduledAt),
  check("games_different_teams", sql`${table.homeTeamId} <> ${table.awayTeamId}`),
  check("games_nonnegative_scores", sql`${table.homeScore} IS NULL OR ${table.homeScore} >= 0`),
  check("games_nonnegative_away_scores", sql`${table.awayScore} IS NULL OR ${table.awayScore} >= 0`),
]);

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull().references(() => leagues.id, { onDelete: "restrict" }),
  actorUserId: integer("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: integer("entity_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users);
export const insertLeagueSchema = createInsertSchema(leagues);
export const insertSeasonSchema = createInsertSchema(seasons);
export const insertTeamSchema = createInsertSchema(teams);
export const insertTeamMembershipSchema = createInsertSchema(teamMemberships);
export const insertPlayerInvitationSchema = createInsertSchema(playerInvitations);
export const insertVenueSchema = createInsertSchema(venues);
export const insertCourtSchema = createInsertSchema(courts);
export const insertGameSchema = createInsertSchema(games);
export const insertAuditEventSchema = createInsertSchema(auditEvents);

export type User = typeof users.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type PlayerInvitation = typeof playerInvitations.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Court = typeof courts.$inferSelect;
export type Game = typeof games.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type UserRole = z.infer<typeof insertUserSchema>["role"];