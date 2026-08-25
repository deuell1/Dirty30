import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    const required = process.env.NODE_ENV === "production"
      ? ["DATABASE_URL", "CLERK_SECRET_KEY", "VITE_CLERK_PUBLISHABLE_KEY", "BOOTSTRAP_COMMISSIONER_PHONE", "APP_ORIGIN"]
      : [];
    if (required.some((name) => !process.env[name]?.trim())) return res.status(503).json({ status: "unavailable" });
    return res.json({ status: "ready" });
  } catch {
    return res.status(503).json({ status: "unavailable" });
  }
});

export default router;
