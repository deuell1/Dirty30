import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, users, type User } from "@workspace/db";
import { normalizeUsPhone } from "../lib/phone";

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
    const primaryPhone = clerkUser.phoneNumbers.find((phone) => phone.id === clerkUser.primaryPhoneNumberId);
    if (!primaryPhone || primaryPhone.verification?.status !== "verified") {
      return res.status(400).json({ error: "A verified primary phone number is required" });
    }
    const normalizedPhone = normalizeUsPhone(primaryPhone.phoneNumber);
    const primaryEmail = clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId);
    const verifiedEmail = primaryEmail?.verification?.status === "verified" ? primaryEmail.emailAddress.toLowerCase() : undefined;

    const [firstName, lastName] = splitName([clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" "));
    const [byExternalAuthId, byPhone] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.externalAuthId, userId) }),
      db.query.users.findFirst({ where: eq(users.phone, normalizedPhone) }),
    ]);
    if (byExternalAuthId && byPhone && byExternalAuthId.id !== byPhone.id) {
      return res.status(409).json({ error: "This verified phone number is already linked to a different league account" });
    }
    const bootstrapPhoneRaw = process.env.BOOTSTRAP_COMMISSIONER_PHONE?.trim();
    const bootstrapPhone = bootstrapPhoneRaw ? normalizeUsPhone(bootstrapPhoneRaw) : undefined;
    const isBootstrapCommissioner = bootstrapPhone === normalizedPhone;
    const existing = byExternalAuthId ?? byPhone;
    if (existing) {
      if (existing.phone !== normalizedPhone) {
        return res.status(403).json({ error: "Your verified Clerk phone does not match this league account. Contact a commissioner before changing it." });
      }
      const [updated] = await db.update(users).set({
        externalAuthId: userId,
        email: verifiedEmail ?? null,
        firstName: existing.firstName || firstName,
        lastName: existing.lastName || lastName,
        ...(isBootstrapCommissioner ? { role: "COMMISSIONER" as const, accessState: "ACTIVE" as const, active: true } : {}),
      }).where(eq(users.id, existing.id)).returning();
      if (!updated?.active || updated.accessState === "DISABLED") return res.status(403).json({ error: "League access is unavailable" });
      res.locals.currentUser = updated;
      return next();
    }

    const role = isBootstrapCommissioner ? "COMMISSIONER" : "PLAYER";
    const [created] = await db.insert(users).values({
      externalAuthId: userId,
      phone: normalizedPhone,
      email: verifiedEmail,
      firstName,
      lastName,
      role,
      accessState: isBootstrapCommissioner ? "ACTIVE" : "PENDING",
    }).returning();
    if (!created?.active || created.accessState === "DISABLED") return res.status(403).json({ error: "League access is unavailable" });
    res.locals.currentUser = created;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCommissioner(req: Request, res: Response, next: NextFunction) {
  if (res.locals.currentUser?.accessState !== "ACTIVE" || res.locals.currentUser.role !== "COMMISSIONER") {
    return res.status(403).json({ error: "Commissioner access required" });
  }
  return next();
}

export function requireActiveUser(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.currentUser?.accessState !== "ACTIVE") {
    return res.status(403).json({ error: "An active league invitation is required" });
  }
  return next();
}

export function currentUser(req: Request, res: Response): User {
  const user = res.locals.currentUser;
  if (!user) throw new Error(`Missing authenticated user for ${req.method} ${req.path}`);
  return user;
}