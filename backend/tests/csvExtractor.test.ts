import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CsvExtractor } from "../src/extractors/CsvExtractor";
import { TxtExtractor } from "../src/extractors/TxtExtractor";

const tmpFiles: string[] = [];

function writeTmpFile(name: string, content: string): string {
  const filePath = path.join(os.tmpdir(), `${Date.now()}-${name}`);
  fs.writeFileSync(filePath, content, "utf-8");
  tmpFiles.push(filePath);
  return filePath;
}

afterAll(() => {
  for (const f of tmpFiles) {
    fs.rmSync(f, { force: true });
  }
});

describe("CsvExtractor", () => {
  const extractor = new CsvExtractor();

  it("parses a well-formed CSV into normalized rows", async () => {
    const filePath = writeTmpFile("good.csv", "name,age,city\nJane Doe,34,Mumbai\nJohn Roe,29,Pune\n");
    const result = await extractor.extract(filePath, "doc-1", "good.csv");

    expect(result.fileType).toBe("csv");
    expect(result.extractedRows).toHaveLength(2);
    expect(result.extractedRows?.[0]).toEqual({ name: "Jane Doe", age: "34", city: "Mumbai" });
    expect(result.metadata.columns).toEqual(["name", "age", "city"]);
    expect(result.metadata.rowCount).toBe(2);
    expect(result.extractedText).toContain("Jane Doe");
  });

  it("throws an ExtractionError for an empty file rather than crashing", async () => {
    const filePath = writeTmpFile("empty.csv", "");
    await expect(extractor.extract(filePath, "doc-2", "empty.csv")).rejects.toThrow(/empty/i);
  });

  it("throws an ExtractionError when no header/columns can be detected", async () => {
    const filePath = writeTmpFile("junk.csv", "\n\n\n");
    await expect(extractor.extract(filePath, "doc-3", "junk.csv")).rejects.toThrow();
  });
});

describe("TxtExtractor", () => {
  const extractor = new TxtExtractor();

  it("extracts plain text content", async () => {
    const filePath = writeTmpFile("note.txt", "Hello, this is a test document.");
    const result = await extractor.extract(filePath, "doc-4", "note.txt");
    expect(result.extractedText).toBe("Hello, this is a test document.");
    expect(result.metadata.charCount).toBeGreaterThan(0);
  });

  it("throws an ExtractionError for an empty text file", async () => {
    const filePath = writeTmpFile("empty.txt", "   \n  ");
    await expect(extractor.extract(filePath, "doc-5", "empty.txt")).rejects.toThrow(/empty/i);
  });
});
