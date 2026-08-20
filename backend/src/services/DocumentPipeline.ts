import { getExtractor } from "../extractors";
import { markDocumentParsed, markDocumentFailed, insertPendingDocument } from "../db/repository";
import type { SupportedFileType, DocumentRecord } from "../types/shared";
import { getDocumentById } from "../db/repository";

export interface UploadedFileInput {
  documentId: string;
  fileName: string;
  fileType: SupportedFileType;
  sizeBytes: number;
  storedPath: string;
}

/**
 * Runs extraction for a single uploaded file and persists the result.
 * Never throws: a corrupt/unreadable file becomes a `failed` document status
 * with an error message, so one bad file in a multi-file upload can never
 * take down the rest of the batch (requirement: "never crash the pipeline").
 */
export async function processUploadedFile(input: UploadedFileInput): Promise<DocumentRecord> {
  insertPendingDocument({
    documentId: input.documentId,
    fileName: input.fileName,
    fileType: input.fileType,
    sizeBytes: input.sizeBytes,
    storedPath: input.storedPath,
    uploadedAt: new Date().toISOString(),
  });

  try {
    const extractor = getExtractor(input.fileType);
    const result = await extractor.extract(input.storedPath, input.documentId, input.fileName);
    markDocumentParsed(input.documentId, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown extraction error.";
    markDocumentFailed(input.documentId, message);
  }

  const record = getDocumentById(input.documentId);
  // insertPendingDocument + markDocument{Parsed,Failed} above guarantee a row
  // exists by this point; the null case is unreachable in practice but kept
  // typed rather than using a non-null assertion.
  if (!record) {
    throw new Error(`Document ${input.documentId} vanished during processing — this should never happen.`);
  }
  return record;
}

export async function processUploadedFiles(inputs: UploadedFileInput[]): Promise<DocumentRecord[]> {
  // Processed sequentially rather than Promise.all — keeps disk/CPU load
  // predictable for larger batches and keeps SQLite (single-writer) happy.
  // A production version would move this to a queue (see README).
  const results: DocumentRecord[] = [];
  for (const input of inputs) {
    results.push(await processUploadedFile(input));
  }
  return results;
}
