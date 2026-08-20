import crypto from "node:crypto";
import type { LlmClient } from "./LlmClient";
import { prepareDocumentsForPrompt, buildAnalysisUserPrompt, ANALYSIS_SYSTEM_PROMPT } from "./promptBuilder";
import { llmAnalysisResponseSchema, type LlmAnalysisResponse } from "../validation/schemas";
import { SchemaValidationError, ValidationError, LlmError } from "../errors";
import type { ExtractionResult, AnalysisResult, Finding, FindingCategory } from "../types/shared";

function toFinding(raw: LlmAnalysisResponse["synthesis"]["findings"][number]): Finding {
  return {
    id: crypto.randomUUID(),
    category: raw.category as FindingCategory,
    title: raw.title,
    extractedFacts: raw.extractedFacts,
    aiInterpretation: raw.aiInterpretation,
    sourceDocumentIds: raw.sourceDocumentIds,
    confidence: raw.confidence,
  };
}

/** Strips accidental markdown code fences some models wrap JSON in, despite instructions. */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

export class AnalysisService {
  constructor(private readonly llmClient: LlmClient) {}

  async runAnalysis(extractions: ExtractionResult[], userPrompt: string): Promise<AnalysisResult> {
    if (extractions.length === 0) {
      throw new ValidationError("At least one successfully parsed document is required for analysis.");
    }

    const prepared = prepareDocumentsForPrompt(extractions);
    const anyTruncated = prepared.some((p) => p.truncated);
    const fullUserPrompt = buildAnalysisUserPrompt(prepared, userPrompt);

    const validKnownIds = new Set(extractions.map((e) => e.documentId));

    let parsed: LlmAnalysisResponse;
    try {
      parsed = await this.callAndValidate(fullUserPrompt, validKnownIds);
    } catch (firstError) {
      // Retry once on validation failure (schema mismatch or invalid JSON),
      // per the spec — a single transient/format slip shouldn't fail the
      // whole request. A second failure surfaces a clear error, never a
      // partial or garbled result.
      if (!(firstError instanceof SchemaValidationError)) throw firstError;
      try {
        parsed = await this.callAndValidate(fullUserPrompt, validKnownIds);
      } catch (secondError) {
        throw secondError instanceof SchemaValidationError
          ? new SchemaValidationError(
              "The analysis model returned a response that didn't match the required format, even after a retry. Please try again or rephrase your prompt.",
              secondError.details
            )
          : secondError;
      }
    }

    const analysisId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const perDocument = parsed.perDocument.map((doc) => ({
      documentId: doc.documentId,
      summary: doc.summary,
      findings: doc.findings.map(toFinding),
    }));

    const synthesis = {
      summary: parsed.synthesis.summary,
      findings: parsed.synthesis.findings.map(toFinding),
    };

    return {
      analysisId,
      prompt: userPrompt,
      documentIds: extractions.map((e) => e.documentId),
      createdAt,
      perDocument,
      synthesis,
      anyTruncated,
    };
  }

  private async callAndValidate(userPrompt: string, validKnownIds: Set<string>): Promise<LlmAnalysisResponse> {
    const raw = await this.llmClient.complete(ANALYSIS_SYSTEM_PROMPT, userPrompt);

    let json: unknown;
    try {
      json = JSON.parse(stripCodeFences(raw));
    } catch (err) {
      throw new SchemaValidationError("LLM response was not valid JSON.", {
        parseError: (err as Error).message,
        rawPreview: raw.slice(0, 500),
      });
    }

    const result = llmAnalysisResponseSchema.safeParse(json);
    if (!result.success) {
      throw new SchemaValidationError("LLM response did not match the required schema.", {
        issues: result.error.issues,
      });
    }

    // Provenance enforcement: reject (as a schema failure, eligible for the
    // single retry) any finding that cites a document id we didn't actually
    // send. This is what guarantees traceability isn't just "requested" via
    // the system prompt but actually verified before persistence.
    const allFindings = [
      ...result.data.perDocument.flatMap((d) => d.findings),
      ...result.data.synthesis.findings,
    ];
    for (const finding of allFindings) {
      const unknownIds = finding.sourceDocumentIds.filter((id) => !validKnownIds.has(id));
      if (unknownIds.length > 0) {
        throw new SchemaValidationError(
          `LLM response cited unknown sourceDocumentIds not present in the request: ${unknownIds.join(", ")}`,
          { finding }
        );
      }
    }

    return result.data;
  }
}

export function createAnalysisService(llmClient: LlmClient): AnalysisService {
  return new AnalysisService(llmClient);
}

export { LlmError };
