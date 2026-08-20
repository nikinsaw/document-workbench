import type { LlmClient } from "./LlmClient";
import { buildMockAnalysis, type MockDocument } from "./mockAnalysis";

const DOCUMENT_BLOCK_RE =
  /\[DOCUMENT id=([a-zA-Z0-9-]+) fileName="([^"]*)" fileType="([^"]*)"\]\n([\s\S]*?)\n\[\/DOCUMENT id=\1\]/g;

function parseDocumentBlocks(userPrompt: string): MockDocument[] {
  const docs: MockDocument[] = [];
  for (const m of userPrompt.matchAll(DOCUMENT_BLOCK_RE)) {
    docs.push({ documentId: m[1], fileName: m[2], fileType: m[3], text: m[4] });
  }
  return docs;
}

/**
 * Deterministic mock used when no ANTHROPIC_API_KEY is set (config.useMockLlm)
 * and in unit/contract tests. It recognizes the document shapes used in
 * sample-documents/ (loan application / identity verification / bank
 * statement, purchase order / vendor invoice) and produces findings —
 * including cross-document discrepancy detection — that reflect what's
 * actually in the text (see mockAnalysis.ts). Anything it doesn't recognize
 * falls back to a generic placeholder finding, so arbitrary uploads still
 * pass sourceDocumentIds validation like a real model response would.
 */
export class MockLlmClient implements LlmClient {
  async complete(_systemPrompt: string, userPrompt: string): Promise<string> {
    const docs = parseDocumentBlocks(userPrompt);
    const { perDocument, synthesis } = buildMockAnalysis(docs);
    return JSON.stringify({ perDocument, synthesis });
  }
}
