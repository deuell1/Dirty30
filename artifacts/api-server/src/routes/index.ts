import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leagueRouter from "./league";
import maintenanceRouter from "./maintenance";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leagueRouter);
router.use(maintenanceRouter);

export default router;
