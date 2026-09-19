import { Router, type IRouter } from "express";
import healthRouter from "./health";
import leagueRouter from "./league";

const router: IRouter = Router();

router.use(healthRouter);
router.use(leagueRouter);

export default router;
