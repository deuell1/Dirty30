import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { eq, or } from "drizzle-orm";
import { db, users, type User } from "@workspace/db";

declare global {
  namespace Express {
    interface Locals {
      currentUser?: User;
    }
  }
}

function splitName(name: string | null | undefined): [string, string] {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

export async function resolveCurrentUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)?.emailAddress;
    if (!primaryEmail) return res.status(400).json({ error: "A primary email address is required" });

    const [firstName, lastName] = splitName([clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" "));
    const normalizedEmail = primaryEmail.toLowerCase();
    const existing = await db.query.users.findFirst({ where: or(eq(users.externalAuthId, userId), eq(users.email, normalizedEmail)) });
    if (existing) {
      const [updated] = await db.update(users).set({ externalAuthId: userId, email: normalizedEmail }).where(eq(users.id, existing.id)).returning();
      if (!updated?.active) return res.status(403).json({ error: "This league account is inactive" });
      res.locals.currentUser = updated;
      return next();
    }

    const bootstrapEmail = process.env.BOOTSTRAP_COMMISSIONER_EMAIL?.trim().toLowerCase();
    const role = bootstrapEmail && bootstrapEmail === normalizedEmail ? "COMMISSIONER" : "PLAYER";
    const [created] = await db.insert(users).values({
      externalAuthId: userId,
      email: normalizedEmail,
      firstName,
      lastName,
      role,
    }).onConflictDoUpdate({
      target: users.email,
      set: { externalAuthId: userId, firstName, lastName },
    }).returning();
    if (!created?.active) return res.status(403).json({ error: "This league account is inactive" });
    res.locals.currentUser = created;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCommissioner(req: Request, res: Response, next: NextFunction) {
  if (res.locals.currentUser?.role !== "COMMISSIONER") {
    return res.status(403).json({ error: "Commissioner access required" });
  }
  return next();
}

export function currentUser(req: Request, res: Response): User {
  const user = res.locals.currentUser;
  if (!user) throw new Error(`Missing authenticated user for ${req.method} ${req.path}`);
  return user;
}