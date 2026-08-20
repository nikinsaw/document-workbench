import { getDb } from "./db";
import type {
  DocumentRecord,
  DocumentStatus,
  ExtractionResult,
  AnalysisResult,
  Finding,
} from "../types/shared";

// ---------------------------------------------------------------------------
// Row shapes as stored in SQLite (snake_case, JSON-as-TEXT)
// ---------------------------------------------------------------------------

interface DocumentRow {
  document_id: string;
  file_name: string;
  file_type: string;
  status: string;
  size_bytes: number;
  stored_path: string;
  uploaded_at: string;
  error_message: string | null;
  extracted_text: string | null;
  extracted_rows: string | null;
  metadata: string | null;
}

function rowToDocumentRecord(row: DocumentRow, includeText = false): DocumentRecord {
  return {
    documentId: row.document_id,
    fileName: row.file_name,
    fileType: row.file_type as DocumentRecord["fileType"],
    status: row.status as DocumentStatus,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    errorMessage: row.error_message ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    extractedText: includeText ? row.extracted_text ?? undefined : undefined,
  };
}

// ---------------------------------------------------------------------------
// Document persistence
// ---------------------------------------------------------------------------

export function insertPendingDocument(params: {
  documentId: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  storedPath: string;
  uploadedAt: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO documents (document_id, file_name, file_type, status, size_bytes, stored_path, uploaded_at)
     VALUES (@documentId, @fileName, @fileType, 'pending', @sizeBytes, @storedPath, @uploadedAt)`
  ).run(params);
}

export function markDocumentParsed(documentId: string, extraction: ExtractionResult): void {
  const db = getDb();
  db.prepare(
    `UPDATE documents
     SET status = 'parsed', extracted_text = ?, extracted_rows = ?, metadata = ?, error_message = NULL
     WHERE document_id = ?`
  ).run(
    extraction.extractedText,
    extraction.extractedRows ? JSON.stringify(extraction.extractedRows) : null,
    JSON.stringify(extraction.metadata ?? {}),
    documentId
  );
}

export function markDocumentFailed(documentId: string, errorMessage: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE documents SET status = 'failed', error_message = ? WHERE document_id = ?`
  ).run(errorMessage, documentId);
}

export function getDocumentById(documentId: string, includeText = false): DocumentRecord | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM documents WHERE document_id = ?`)
    .get(documentId) as DocumentRow | undefined;
  return row ? rowToDocumentRecord(row, includeText) : null;
}

/** Internal helper: fetch full extraction (with text/rows) for use in analysis pipeline. */
export function getDocumentExtraction(documentId: string): (ExtractionResult & { status: DocumentStatus }) | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM documents WHERE document_id = ?`)
    .get(documentId) as DocumentRow | undefined;
  if (!row) return null;
  return {
    documentId: row.document_id,
    fileName: row.file_name,
    fileType: row.file_type as ExtractionResult["fileType"],
    extractedText: row.extracted_text ?? "",
    extractedRows: row.extracted_rows ? JSON.parse(row.extracted_rows) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    status: row.status as DocumentStatus,
  };
}

export function listDocuments(): DocumentRecord[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM documents ORDER BY uploaded_at DESC`).all() as DocumentRow[];
  return rows.map((r) => rowToDocumentRecord(r));
}

export function listDocumentsByIds(documentIds: string[]): DocumentRecord[] {
  if (documentIds.length === 0) return [];
  const db = getDb();
  const placeholders = documentIds.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM documents WHERE document_id IN (${placeholders})`)
    .all(...documentIds) as DocumentRow[];
  return rows.map((r) => rowToDocumentRecord(r));
}

// ---------------------------------------------------------------------------
// Analysis persistence
// ---------------------------------------------------------------------------

export function insertAnalysis(result: AnalysisResult): void {
  const db = getDb();
  const insertAnalysisStmt = db.prepare(
    `INSERT INTO analyses (analysis_id, prompt, document_ids, created_at, per_document, synthesis, any_truncated)
     VALUES (@analysisId, @prompt, @documentIds, @createdAt, @perDocument, @synthesis, @anyTruncated)`
  );
  const insertFindingStmt = db.prepare(
    `INSERT INTO findings (finding_id, analysis_id, scope, source_document_ids, category, title, extracted_facts, ai_interpretation, confidence)
     VALUES (@findingId, @analysisId, @scope, @sourceDocumentIds, @category, @title, @extractedFacts, @aiInterpretation, @confidence)`
  );

  const tx = db.transaction(() => {
    insertAnalysisStmt.run({
      analysisId: result.analysisId,
      prompt: result.prompt,
      documentIds: JSON.stringify(result.documentIds),
      createdAt: result.createdAt,
      perDocument: JSON.stringify(result.perDocument),
      synthesis: JSON.stringify(result.synthesis),
      anyTruncated: result.anyTruncated ? 1 : 0,
    });

    const insertFinding = (scope: "per_document" | "synthesis", finding: Finding) => {
      insertFindingStmt.run({
        findingId: finding.id,
        analysisId: result.analysisId,
        scope,
        sourceDocumentIds: JSON.stringify(finding.sourceDocumentIds),
        category: finding.category,
        title: finding.title,
        extractedFacts: JSON.stringify(finding.extractedFacts),
        aiInterpretation: finding.aiInterpretation,
        confidence: finding.confidence ?? null,
      });
    };

    for (const perDoc of result.perDocument) {
      for (const finding of perDoc.findings) insertFinding("per_document", finding);
    }
    for (const finding of result.synthesis.findings) insertFinding("synthesis", finding);
  });

  tx();
}

interface AnalysisRow {
  analysis_id: string;
  prompt: string;
  document_ids: string;
  created_at: string;
  per_document: string;
  synthesis: string;
  any_truncated: number;
}

export function getAnalysisById(analysisId: string): AnalysisResult | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM analyses WHERE analysis_id = ?`)
    .get(analysisId) as AnalysisRow | undefined;
  if (!row) return null;
  return {
    analysisId: row.analysis_id,
    prompt: row.prompt,
    documentIds: JSON.parse(row.document_ids),
    createdAt: row.created_at,
    perDocument: JSON.parse(row.per_document),
    synthesis: JSON.parse(row.synthesis),
    anyTruncated: !!row.any_truncated,
  };
}

export function listAnalyses(): Array<Pick<AnalysisResult, "analysisId" | "prompt" | "documentIds" | "createdAt">> {
  const db = getDb();
  const rows = db
    .prepare(`SELECT analysis_id, prompt, document_ids, created_at FROM analyses ORDER BY created_at DESC`)
    .all() as Array<Pick<AnalysisRow, "analysis_id" | "prompt" | "document_ids" | "created_at">>;
  return rows.map((r) => ({
    analysisId: r.analysis_id,
    prompt: r.prompt,
    documentIds: JSON.parse(r.document_ids),
    createdAt: r.created_at,
  }));
}
