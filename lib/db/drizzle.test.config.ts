import { defineConfig } from "drizzle-kit";
import path from "path";
import { getTestDatabaseUrl } from "./src/testDatabaseUrl";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: getTestDatabaseUrl(),
  },
});
