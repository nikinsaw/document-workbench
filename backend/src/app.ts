import express from "express";
import cors from "cors";
import { config } from "./config";
import { documentsRouter } from "./routes/documents";
import { analysisRouter } from "./routes/analysis";
import { errorHandler } from "./middleware/errorHandler";

export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", mockLlm: config.useMockLlm });
  });

  app.use("/api/documents", documentsRouter);
  app.use("/api/analysis", analysisRouter);

  // 404 for unmatched API routes
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "No such API route." } });
  });

  app.use(errorHandler);

  return app;
}
