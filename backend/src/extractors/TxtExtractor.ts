import fs from "node:fs/promises";
import type { DocumentExtractor } from "./DocumentExtractor";
import type { ExtractionResult } from "../types/shared";
import { ExtractionError } from "../errors";

export class TxtExtractor implements DocumentExtractor {
  readonly fileType = "txt" as const;

  async extract(filePath: string, documentId: string, fileName: string): Promise<ExtractionResult> {
    let text: string;
    try {
      text = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      throw new ExtractionError(`Could not read uploaded text file: ${(err as Error).message}`);
    }

    // A file that fails to decode as UTF-8 text (e.g. someone renamed a binary
    // file to .txt) commonly contains the Unicode replacement character.
    if (text.trim().length === 0) {
      throw new ExtractionError(`Text file "${fileName}" is empty.`);
    }
    const replacementCharRatio = (text.match(/\uFFFD/g)?.length ?? 0) / text.length;
    if (replacementCharRatio > 0.05) {
      throw new ExtractionError(
        `"${fileName}" does not appear to be valid UTF-8 text (it may be a renamed binary file).`
      );
    }

    return {
      documentId,
      fileName,
      fileType: "txt",
      extractedText: text.trim(),
      metadata: {
        charCount: text.length,
      },
    };
  }
}
