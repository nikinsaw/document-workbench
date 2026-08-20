import { z } from "zod";
import { config } from "../config";

// ---------------------------------------------------------------------------
// API request validation
// ---------------------------------------------------------------------------

export const analysisRequestSchema = z.object({
  documentIds: z
    .array(z.string().uuid())
    .min(1, "At least one documentId is required.")
    .max(50, "Too many documents in a single analysis request."),
  prompt: z
    .string()
    .trim()
    .min(3, "Prompt must be at least 3 characters.")
    .max(config.maxPromptLength, `Prompt must be at most ${config.maxPromptLength} characters.`),
});

// ---------------------------------------------------------------------------
// LLM output validation
//
// This is the schema every LLM response is validated against before being
// persisted or returned to the client. sourceDocumentIds is required and
// non-empty on every finding — this is how document-level provenance is
// enforced end-to-end, not just requested via the prompt.
// ---------------------------------------------------------------------------

export const findingCategorySchema = z.enum([
  "comparison",
  "discrepancy",
  "summary",
  "extraction",
  "other",
]);

export const llmFindingSchema = z.object({
  title: z.string().min(1).max(300),
  category: findingCategorySchema,
  extractedFacts: z.array(z.string().min(1)).default([]),
  aiInterpretation: z.string().min(1).max(2000),
  sourceDocumentIds: z.array(z.string().min(1)).min(1, "Every finding must cite at least one source document."),
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export const llmPerDocumentAnalysisSchema = z.object({
  documentId: z.string().min(1),
  summary: z.string().min(1).max(2000),
  findings: z.array(llmFindingSchema).default([]),
});

export const llmSynthesisSchema = z.object({
  summary: z.string().min(1).max(3000),
  findings: z.array(llmFindingSchema).default([]),
});

/** Full shape the LLM must return for a single analysis run. */
export const llmAnalysisResponseSchema = z.object({
  perDocument: z.array(llmPerDocumentAnalysisSchema),
  synthesis: llmSynthesisSchema,
});

export type LlmAnalysisResponse = z.infer<typeof llmAnalysisResponseSchema>;
export type LlmFinding = z.infer<typeof llmFindingSchema>;
