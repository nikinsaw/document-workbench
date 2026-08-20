import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { analysisRequestSchema } from "../validation/schemas";
import { ValidationError, NotFoundError } from "../errors";
import { getDocumentExtraction, insertAnalysis, getAnalysisById, listAnalyses } from "../db/repository";
import { createAnalysisService } from "../services/AnalysisService";
import { AnthropicLlmClient } from "../services/AnthropicLlmClient";
import { MockLlmClient } from "../services/MockLlmClient";
import { config } from "../config";
import type { ExtractionResult } from "../types/shared";

export const analysisRouter = Router();

// A single LlmClient/AnalysisService instance is reused across requests —
// both are stateless. Swapping providers (or injecting a test double) means
// changing only this construction site.
const llmClient = config.useMockLlm ? new MockLlmClient() : new AnthropicLlmClient();
const analysisService = createAnalysisService(llmClient);

analysisRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ analyses: listAnalyses() });
  })
);

analysisRouter.get(
  "/:analysisId",
  asyncHandler(async (req, res) => {
    const analysis = getAnalysisById(req.params.analysisId);
    if (!analysis) throw new NotFoundError(`Analysis ${req.params.analysisId} not found.`);
    res.json(analysis);
  })
);

analysisRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parseResult = analysisRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ValidationError("Invalid analysis request.", parseResult.error.issues);
    }
    const { documentIds, prompt } = parseResult.data;

    const extractions: ExtractionResult[] = [];
    const unavailable: string[] = [];
    for (const documentId of documentIds) {
      const doc = getDocumentExtraction(documentId);
      if (!doc || doc.status !== "parsed") {
        unavailable.push(documentId);
        continue;
      }
      extractions.push({
        documentId: doc.documentId,
        fileName: doc.fileName,
        fileType: doc.fileType,
        extractedText: doc.extractedText,
        extractedRows: doc.extractedRows,
        metadata: doc.metadata,
      });
    }

    if (unavailable.length > 0) {
      throw new ValidationError(
        `${unavailable.length} document(s) are not available for analysis (missing or not successfully parsed).`,
        { unavailableDocumentIds: unavailable }
      );
    }

    const result = await analysisService.runAnalysis(extractions, prompt);
    insertAnalysis(result);
    res.status(201).json(result);
  })
);
