/**
 * Shared types between backend and frontend.
 *
 * The frontend copy of this file is kept in sync manually (frontend/src/types/shared.ts).
 * In a monorepo setup (npm/pnpm workspaces) this file would live in a single package
 * imported by both — see README "Productionizing" section.
 */

// ---------------------------------------------------------------------------
// Document domain
// ---------------------------------------------------------------------------

export type SupportedFileType = "pdf" | "csv" | "txt" | "image";

export type DocumentStatus = "pending" | "parsed" | "failed";

/** A single row of tabular data extracted from a CSV document. */
export type ExtractedRow = Record<string, string | number | null>;

export interface DocumentMetadata {
  /** Number of pages (PDF), rows (CSV), or characters (TXT) — extractor-specific. */
  pageCount?: number;
  rowCount?: number;
  charCount?: number;
  /** Column headers, for tabular documents. */
  columns?: string[];
  /** Set when the extracted text was too large and had to be truncated before LLM calls. */
  truncated?: boolean;
  /** Free-form extractor notes (e.g. "OCR not implemented, image not processed"). */
  notes?: string;
}

/** Normalized output every DocumentExtractor implementation must produce. */
export interface ExtractionResult {
  documentId: string;
  fileName: string;
  fileType: SupportedFileType;
  extractedText: string;
  extractedRows?: ExtractedRow[];
  metadata: DocumentMetadata;
}

/** A document record as stored/returned by the API. */
export interface DocumentRecord {
  documentId: string;
  fileName: string;
  fileType: SupportedFileType;
  status: DocumentStatus;
  sizeBytes: number;
  uploadedAt: string; // ISO timestamp
  errorMessage?: string;
  metadata?: DocumentMetadata;
  /** Only included when explicitly requested (e.g. for source-excerpt viewing). */
  extractedText?: string;
}

// ---------------------------------------------------------------------------
// Analysis domain
// ---------------------------------------------------------------------------

export type FindingCategory =
  | "comparison"
  | "discrepancy"
  | "summary"
  | "extraction"
  | "other";

/** A single finding. Every finding must be traceable to its source document(s). */
export interface Finding {
  id: string;
  category: FindingCategory;
  title: string;
  /** Facts pulled verbatim / near-verbatim from the source documents. */
  extractedFacts: string[];
  /** Model-generated judgment, inference, or interpretation — kept separate from facts. */
  aiInterpretation: string;
  /** Which uploaded documents this finding is derived from. Never empty. */
  sourceDocumentIds: string[];
  /** Optional confidence label surfaced by the model. */
  confidence?: "low" | "medium" | "high";
}

/** Result of the independent, per-document analysis pass. */
export interface PerDocumentAnalysis {
  documentId: string;
  findings: Finding[];
  summary: string;
}

/** Result of the cross-document synthesis pass. */
export interface CrossDocumentSynthesis {
  findings: Finding[];
  summary: string;
}

export interface AnalysisResult {
  analysisId: string;
  prompt: string;
  documentIds: string[];
  createdAt: string;
  perDocument: PerDocumentAnalysis[];
  synthesis: CrossDocumentSynthesis;
  /** True if any source document's text was truncated before being sent to the LLM. */
  anyTruncated: boolean;
}

// ---------------------------------------------------------------------------
// API request/response envelopes
// ---------------------------------------------------------------------------

export interface UploadResponse {
  documents: DocumentRecord[];
}

export interface AnalysisRequest {
  documentIds: string[];
  prompt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SourceExcerptResponse {
  documentId: string;
  fileName: string;
  excerpt: string;
}
