import type { ExtractionResult, SupportedFileType } from "../types/shared";

/**
 * One implementation per supported file type. Extractors must never throw for
 * "expected" bad input (corrupt file, empty file, unparseable CSV) — instead
 * the caller (extractDocument) catches thrown errors and converts them into a
 * failed document status, so a single bad upload can never crash the pipeline
 * or block other documents in the same batch.
 */
export interface DocumentExtractor {
  readonly fileType: SupportedFileType;

  /**
   * @param filePath absolute path to the file on disk (already saved by multer)
   * @param documentId the pre-generated ID for this document
   * @param fileName the original, user-supplied file name (for display only)
   */
  extract(filePath: string, documentId: string, fileName: string): Promise<ExtractionResult>;
}
