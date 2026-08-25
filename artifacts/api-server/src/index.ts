import app from "./app";
import { logger } from "./lib/logger";

if (process.env.NODE_ENV === "production") {
  const required = ["DATABASE_URL", "CLERK_SECRET_KEY", "VITE_CLERK_PUBLISHABLE_KEY", "BOOTSTRAP_COMMISSIONER_PHONE", "APP_ORIGIN"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Production configuration is missing required environment variable names: ${missing.join(", ")}`);
  try {
    new URL(process.env.APP_ORIGIN!);
  } catch {
    throw new Error("APP_ORIGIN must be a valid absolute URL in production");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
