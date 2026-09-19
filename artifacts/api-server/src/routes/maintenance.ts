import { Router, type IRouter } from "express";
import {
  ExecuteSeedCleanupBody,
  ExecuteSeedCleanupResponse,
  GetSeedCleanupStatusResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  currentUser,
  requireActiveUser,
  requireCommissioner,
  resolveCurrentUser,
} from "../middlewares/auth";
import {
  executeSeedCleanup,
  getSeedCleanupStatus,
  isBootstrapCommissioner,
  SEED_CONFIRMATION,
} from "../services/seedCleanup";

const router: IRouter = Router();
router.use(resolveCurrentUser, requireActiveUser, requireCommissioner);

function requireBootstrap(
  req: Parameters<typeof resolveCurrentUser>[0],
  res: Parameters<typeof resolveCurrentUser>[1],
  next: Parameters<typeof resolveCurrentUser>[2],
) {
  const user = currentUser(req, res);
  if (!isBootstrapCommissioner(user)) {
    res.status(403).json({ error: "Bootstrap commissioner access required" });
    return;
  }
  next();
}

router.use(requireBootstrap);

router.get(
  "/maintenance/seed-cleanup",
  async (_req, res, next): Promise<void> => {
    try {
      res.json(
        GetSeedCleanupStatusResponse.parse(await getSeedCleanupStatus()),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/maintenance/seed-cleanup",
  async (req, res, next): Promise<void> => {
    try {
      const parsed = ExecuteSeedCleanupBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid cleanup confirmation" });
        return;
      }
      const input = parsed.data;
      if (input.confirmation !== SEED_CONFIRMATION) {
        res.status(400).json({ error: "Exact confirmation is required" });
        return;
      }
      const result = await db.transaction((tx) =>
        executeSeedCleanup(tx, currentUser(req, res)),
      );
      res.json(ExecuteSeedCleanupResponse.parse(result));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
