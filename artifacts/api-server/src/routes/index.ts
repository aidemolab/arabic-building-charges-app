import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import buildingsRouter from "./buildings";
import unitsRouter from "./units";
import personsRouter from "./persons";
import chargesRouter from "./charges";
import dashboardRouter from "./dashboard";
import importRouter from "./importRoute";
import exportRouter from "./exportRoute";
import auditRouter from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(buildingsRouter);
router.use(unitsRouter);
router.use(personsRouter);
router.use(chargesRouter);
router.use(dashboardRouter);
router.use(importRouter);
router.use(exportRouter);
router.use(auditRouter);

export default router;
