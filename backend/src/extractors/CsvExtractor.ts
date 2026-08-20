import fs from "node:fs/promises";
import Papa from "papaparse";
import type { DocumentExtractor } from "./DocumentExtractor";
import type { ExtractionResult, ExtractedRow } from "../types/shared";
import { ExtractionError } from "../errors";

export class CsvExtractor implements DocumentExtractor {
  readonly fileType = "csv" as const;

  async extract(filePath: string, documentId: string, fileName: string): Promise<ExtractionResult> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      throw new ExtractionError(`Could not read uploaded CSV file: ${(err as Error).message}`);
    }

    if (raw.trim().length === 0) {
      throw new ExtractionError(`CSV "${fileName}" is empty.`);
    }

    const parseResult = Papa.parse<Record<string, string>>(raw, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    // Papaparse reports row-level errors rather than throwing; treat a
    // completely unparseable file (no fields detected) as a hard failure,
    // but tolerate row-level warnings (e.g. "too many fields" on one line).
    const fields = parseResult.meta.fields ?? [];
    if (fields.length === 0) {
      throw new ExtractionError(
        `CSV "${fileName}" could not be parsed — no header row / columns were detected.`,
        { errors: parseResult.errors.slice(0, 5) }
      );
    }

    const rows: ExtractedRow[] = parseResult.data.map((row) => {
      const normalized: ExtractedRow = {};
      for (const field of fields) {
        normalized[field] = row[field] ?? null;
      }
      return normalized;
    });

    // Build a compact textual representation too, so the CSV can be reasoned
    // about by the LLM alongside PDF/TXT documents without special-casing.
    const textLines = [fields.join(", "), ...rows.map((r) => fields.map((f) => String(r[f] ?? "")).join(", "))];
    const extractedText = textLines.join("\n");

    return {
      documentId,
      fileName,
      fileType: "csv",
      extractedText,
      extractedRows: rows,
      metadata: {
        rowCount: rows.length,
        columns: fields,
        charCount: extractedText.length,
        notes:
          parseResult.errors.length > 0
            ? `${parseResult.errors.length} row-level parse warning(s) were encountered and skipped.`
            : undefined,
      },
    };
  }
}
