import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sourcesRouter from "./sources";
import rendersRouter from "./renders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sourcesRouter);
router.use(rendersRouter);

export default router;
