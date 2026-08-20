import fs from "node:fs/promises";
import type { DocumentExtractor } from "./DocumentExtractor";
import type { ExtractionResult } from "../types/shared";
import { ExtractionError } from "../errors";

// pdf-parse's typings are poor and it has a habit of running its own debug
// codepath when required at the top of a file in some bundler setups, so it's
// required lazily inside the function instead.
type PdfParseFn = (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

export class PdfExtractor implements DocumentExtractor {
  readonly fileType = "pdf" as const;

  async extract(filePath: string, documentId: string, fileName: string): Promise<ExtractionResult> {
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (err) {
      throw new ExtractionError(`Could not read uploaded PDF file: ${(err as Error).message}`);
    }

    let parsed: { text: string; numpages: number };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require("pdf-parse") as PdfParseFn;
      parsed = await pdfParse(buffer);
    } catch (err) {
      throw new ExtractionError(
        `Failed to parse PDF "${fileName}" — the file may be corrupt, encrypted, or not a valid PDF.`,
        { cause: (err as Error).message }
      );
    }

    const text = parsed.text?.trim() ?? "";
    if (text.length === 0) {
      throw new ExtractionError(
        `PDF "${fileName}" contained no extractable text (it may be a scanned image without OCR).`
      );
    }

    return {
      documentId,
      fileName,
      fileType: "pdf",
      extractedText: text,
      metadata: {
        pageCount: parsed.numpages,
        charCount: text.length,
      },
    };
  }
}
