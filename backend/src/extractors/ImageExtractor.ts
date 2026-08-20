import type { DocumentExtractor } from "./DocumentExtractor";
import type { ExtractionResult } from "../types/shared";

/**
 * Stub implementation. A real implementation would run OCR (e.g. Tesseract.js
 * for a fully local pipeline, or a cloud Vision API) and return the
 * recognized text. It is wired into the same DocumentExtractor interface as
 * every other file type so swapping in a real OCR engine later requires no
 * changes to the upload route, pipeline orchestration, or analysis service —
 * only this file.
 *
 * It does not throw: an "unimplemented" status is a legitimate, expected
 * outcome for this file type today, not a pipeline failure.
 */
export class ImageExtractor implements DocumentExtractor {
  readonly fileType = "image" as const;

  async extract(_filePath: string, documentId: string, fileName: string): Promise<ExtractionResult> {
    return {
      documentId,
      fileName,
      fileType: "image",
      extractedText: "",
      metadata: {
        notes: "OCR is not implemented in this build. Image was stored but not processed.",
      },
    };
  }
}
