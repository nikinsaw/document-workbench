import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CsvExtractor } from "../src/extractors/CsvExtractor";
import { TxtExtractor } from "../src/extractors/TxtExtractor";
import { buildMockAnalysis, type MockDocument } from "../src/services/mockAnalysis";

const SAMPLES_DIR = path.join(__dirname, "..", "..", "sample-documents");
const csvExtractor = new CsvExtractor();
const txtExtractor = new TxtExtractor();

async function loadDoc(fileName: string, documentId: string): Promise<MockDocument> {
  const filePath = path.join(SAMPLES_DIR, fileName);
  const extractor = fileName.endsWith(".csv") ? csvExtractor : txtExtractor;
  const result = await extractor.extract(filePath, documentId, fileName);
  return { documentId, fileName, fileType: result.fileType, text: result.extractedText };
}

function findingTitles(findings: { title: string }[]): string[] {
  return findings.map((f) => f.title);
}

describe("buildMockAnalysis", () => {
  it("falls back to a generic placeholder finding for unrecognized content", () => {
    const doc: MockDocument = { documentId: "doc-generic", fileName: "note.txt", fileType: "txt", text: "Just some ordinary notes." };
    const { perDocument, synthesis } = buildMockAnalysis([doc]);

    expect(perDocument).toHaveLength(1);
    expect(perDocument[0].findings).toHaveLength(1);
    expect(perDocument[0].findings[0].title).toBe("Mock finding");
    expect(perDocument[0].findings[0].sourceDocumentIds).toEqual(["doc-generic"]);
    expect(synthesis.summary).toMatch(/only one document/i);
  });

  it("flags the applicant name mismatch in the mismatched loan/identity/bank-statement sample set", async () => {
    const loan = await loadDoc("loan-application.txt", "doc-loan");
    const identity = await loadDoc("identity-verification-form.txt", "doc-identity");
    const bank = await loadDoc("bank-statement.csv", "doc-bank");

    const { perDocument, synthesis } = buildMockAnalysis([loan, identity, bank]);

    expect(perDocument).toHaveLength(3);
    for (const doc of perDocument) {
      expect(doc.findings.length).toBeGreaterThan(0);
    }

    const titles = findingTitles(synthesis.findings);
    expect(titles).toContain("Applicant name mismatch between loan application and identity verification");
    expect(titles).toContain("Salary credit corroborates declared employer");
    expect(titles).toContain("Salary credit amount matches declared income");

    const nameMismatch = synthesis.findings.find((f) => f.title.includes("name mismatch"));
    expect(nameMismatch?.category).toBe("discrepancy");
    expect(nameMismatch?.sourceDocumentIds).toEqual(["doc-loan", "doc-identity"]);
    expect(synthesis.summary).toMatch(/discrepancy/i);
  });

  it("finds no discrepancies in the clean loan/identity/bank-statement sample set", async () => {
    const loan = await loadDoc("loan-application-clean.txt", "doc-loan-2");
    const identity = await loadDoc("identity-verification-clean.txt", "doc-identity-2");
    const bank = await loadDoc("bank-statement-clean.csv", "doc-bank-2");

    const { synthesis } = buildMockAnalysis([loan, identity, bank]);

    for (const finding of synthesis.findings) {
      expect(finding.category).not.toBe("discrepancy");
    }
    const titles = findingTitles(synthesis.findings);
    expect(titles).toContain("Applicant name is consistent across documents");
    expect(synthesis.summary).toMatch(/consistent/i);
  });

  it("flags the quantity-driven total mismatch between the purchase order and vendor invoice", async () => {
    const po = await loadDoc("purchase-order.txt", "doc-po");
    const inv = await loadDoc("vendor-invoice.txt", "doc-inv");

    const { synthesis } = buildMockAnalysis([po, inv]);

    const mismatch = synthesis.findings.find((f) => f.title === "Invoice total does not match purchase order");
    expect(mismatch).toBeDefined();
    expect(mismatch?.category).toBe("discrepancy");
    expect(mismatch?.sourceDocumentIds).toEqual(["doc-po", "doc-inv"]);
    expect(mismatch?.extractedFacts.join(" ")).toMatch(/250,632/);
    expect(mismatch?.extractedFacts.join(" ")).toMatch(/245,676/);
  });
});
