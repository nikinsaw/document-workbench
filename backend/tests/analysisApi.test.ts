import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import request from "supertest";

// Force the mock LLM client and an isolated, throwaway DB/upload dir before
// any application module (which reads config at import time) is loaded.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "doc-workbench-test-"));
process.env.DB_PATH = path.join(tmpRoot, "test.db");
process.env.UPLOAD_DIR = path.join(tmpRoot, "uploads");
process.env.USE_MOCK_LLM = "true";
process.env.ANTHROPIC_API_KEY = "";

// Dynamic imports so the env vars above are set before config.ts evaluates.
let createApp: typeof import("../src/app").createApp;
let closeDb: typeof import("../src/db/db").closeDb;

let app: import("express").Express;

beforeAll(async () => {
  ({ createApp } = await import("../src/app"));
  ({ closeDb } = await import("../src/db/db"));
  app = createApp();
});

afterAll(() => {
  // Release the DB file handle first — on Windows, better-sqlite3 holds an
  // exclusive lock until closed, which otherwise turns the temp-dir cleanup
  // below into an intermittent EPERM.
  closeDb();
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("Analysis API contract", () => {
  let documentId: string;

  beforeEach(() => {
    // no-op placeholder for future per-test isolation if needed
  });

  it("uploads a TXT document successfully", async () => {
    const res = await request(app)
      .post("/api/documents/upload")
      .attach("files", Buffer.from("Invoice #123 for Acme Corp, total due $450.00."), {
        filename: "invoice.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(201);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].status).toBe("parsed");
    documentId = res.body.documents[0].documentId;
    expect(documentId).toBeTruthy();
  });

  it("rejects an analysis request with no documentIds", async () => {
    const res = await request(app).post("/api/analysis").send({ documentIds: [], prompt: "summarize" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an analysis request referencing an unknown document", async () => {
    const res = await request(app)
      .post("/api/analysis")
      .send({ documentIds: [crypto.randomUUID()], prompt: "summarize this document please" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("runs an analysis against an uploaded document and returns schema-conformant, traceable findings", async () => {
    expect(documentId).toBeTruthy();

    const res = await request(app)
      .post("/api/analysis")
      .send({ documentIds: [documentId], prompt: "Summarize the key facts in this document." });

    expect(res.status).toBe(201);
    expect(res.body.analysisId).toBeTruthy();
    expect(res.body.documentIds).toEqual([documentId]);
    expect(res.body.perDocument).toHaveLength(1);
    expect(res.body.perDocument[0].documentId).toBe(documentId);

    // Provenance: every finding across both passes must cite only known document IDs.
    const allFindings = [
      ...res.body.perDocument.flatMap((d: { findings: unknown[] }) => d.findings),
      ...res.body.synthesis.findings,
    ];
    expect(allFindings.length).toBeGreaterThan(0);
    for (const finding of allFindings) {
      expect(finding.sourceDocumentIds).toContain(documentId);
      expect(finding).toHaveProperty("extractedFacts");
      expect(finding).toHaveProperty("aiInterpretation");
    }
  });
});
