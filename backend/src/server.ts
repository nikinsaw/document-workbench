import { createApp } from "./app";
import { config } from "./config";
import { getDb } from "./db/db";

// Ensure DB + schema are initialized before accepting traffic.
getDb();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Multi-Document Intelligence Workbench API listening on http://localhost:${config.port}`);
  if (config.useMockLlm) {
    console.log("⚠ Running with MockLlmClient (no ANTHROPIC_API_KEY set). Set one in .env to use the real model.");
  }
});
