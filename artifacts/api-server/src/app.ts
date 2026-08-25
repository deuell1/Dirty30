import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
const isProduction = process.env.NODE_ENV === "production";
const productionOrigin = process.env.APP_ORIGIN;

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(isProduction ? { origin: productionOrigin, credentials: true } : undefined));
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use("/api", healthRouter);
app.use(clerkMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error }, "Unhandled API error");
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
  const message = error instanceof Error && status < 500 ? error.message : "Unexpected server error";
  res.status(status).json({ error: message });
});

export default app;
