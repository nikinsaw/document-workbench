import type { ExtractionResult } from "../types/shared";
import { config } from "../config";

export interface PreparedDocument {
  documentId: string;
  fileName: string;
  fileType: string;
  text: string;
  truncated: boolean;
}

/**
 * Truncates each document's text independently to a fixed character budget.
 * Truncating per-document (rather than truncating the final concatenated
 * prompt) guarantees every document gets a fair share of the context window
 * regardless of upload order, and guarantees we can always report *which*
 * documents were truncated.
 */
export function prepareDocumentsForPrompt(extractions: ExtractionResult[]): PreparedDocument[] {
  return extractions.map((doc) => {
    const full = doc.extractedText || "(no extractable text)";
    const truncated = full.length > config.maxCharsPerDocument;
    const text = truncated ? `${full.slice(0, config.maxCharsPerDocument)}\n[...truncated...]` : full;
    return {
      documentId: doc.documentId,
      fileName: doc.fileName,
      fileType: doc.fileType,
      text,
      truncated,
    };
  });
}

/**
 * Builds the user-turn prompt with explicit, machine-parseable document
 * boundaries. Each document is wrapped in a tagged block carrying its
 * documentId, so the model can (and per the system prompt, must) cite
 * sourceDocumentIds that match these exact IDs — this is the mechanism that
 * keeps every finding traceable back to source, end-to-end, instead of
 * dumping all documents into one undifferentiated blob of text.
 */
export function buildAnalysisUserPrompt(prepared: PreparedDocument[], userAnalysisPrompt: string): string {
  const documentBlocks = prepared
    .map(
      (doc) =>
        `[DOCUMENT id=${doc.documentId} fileName="${doc.fileName}" fileType="${doc.fileType}"]\n${doc.text}\n[/DOCUMENT id=${doc.documentId}]`
    )
    .join("\n\n");

  return [
    `User's requested analysis: ${userAnalysisPrompt}`,
    ``,
    `The following ${prepared.length} document(s) are provided, each in its own tagged block with a unique id. Treat each block as a distinct source. Do not merge or blur facts across documents unless the user's request specifically asks for cross-document comparison — and even then, cite every source document id involved.`,
    ``,
    documentBlocks,
  ].join("\n");
}

export const ANALYSIS_SYSTEM_PROMPT = `You are a document analysis engine. You will be given one or more documents, each wrapped in a [DOCUMENT id=...]...[/DOCUMENT] block, plus a user request describing the desired analysis.

You must respond with ONLY valid JSON — no markdown code fences, no commentary before or after — matching exactly this shape:

{
  "perDocument": [
    {
      "documentId": "<the exact id from the DOCUMENT block>",
      "summary": "<1-3 sentence summary of this document alone>",
      "findings": [
        {
          "title": "<short title>",
          "category": "comparison" | "discrepancy" | "summary" | "extraction" | "other",
          "extractedFacts": ["<verbatim or near-verbatim facts pulled from the document text>"],
          "aiInterpretation": "<your judgment / inference / analysis — kept separate from the raw facts above>",
          "sourceDocumentIds": ["<the exact document id(s) this finding is drawn from>"],
          "confidence": "low" | "medium" | "high"
        }
      ]
    }
  ],
  "synthesis": {
    "summary": "<summary across ALL documents together, addressing the user's request>",
    "findings": [ /* same finding shape as above, but sourceDocumentIds may reference multiple documents */ ]
  }
}

Hard rules:
- "perDocument" must contain exactly one entry per DOCUMENT block provided, using its exact id.
- Every finding, in both perDocument and synthesis, MUST have a non-empty "sourceDocumentIds" array containing only ids that were actually provided in the DOCUMENT blocks. Never invent an id.
- Keep "extractedFacts" to things actually stated in the source documents. Put any inference, judgment, comparison conclusion, or suspicion in "aiInterpretation" instead — never blend the two.
- If a document's text is marked "[...truncated...]", note that limitation in that document's summary rather than inventing content past the cutoff.
- Output nothing but the JSON object.`;
