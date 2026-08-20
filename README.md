# Multi-Document Intelligence Workbench

Upload a batch of documents (PDF / CSV / TXT, image stubbed), describe what you want analyzed,
and get back findings — both per-document and synthesized across the whole set — where every
single finding is traceable to the exact document(s) it came from.

## Quick start

```bash
# Backend
cd backend
cp .env.example .env       # optional: add ANTHROPIC_API_KEY to use the real model
npm install
npm run dev                # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Without `ANTHROPIC_API_KEY` set, the backend automatically falls back to a deterministic,
**content-aware** `MockLlmClient` so the whole upload → extract → analyze → trace flow can be
exercised end to end offline (this is also what the automated tests run against). It recognizes
the document shapes used in `sample-documents/` — loan application / identity verification /
bank statement, and purchase order / vendor invoice — and returns findings that actually reflect
what's in the text, including cross-document discrepancy detection. Anything else it doesn't
recognize still gets a valid, schema-conformant placeholder finding, so arbitrary uploads never
break.

Run backend tests: `cd backend && npm test`.

## Sample documents

`sample-documents/` has two independent scenarios, each demonstrating a different mock outcome:

| Files | Scenario | Mock result |
|---|---|---|
| `loan-application.txt`, `identity-verification-form.txt`, `bank-statement.csv` | Applicant's name is abbreviated on the loan form ("Rohan A. Mehta") vs spelled out on the KYC form ("Rohan Ashok Mehta"); declared income/employer are corroborated by the bank statement | 1 `discrepancy` finding (name mismatch) + 2 `comparison` findings (employer & income corroborated) |
| `loan-application-clean.txt`, `identity-verification-clean.txt`, `bank-statement-clean.csv` | Same three-document shape, but every field agrees across all three documents | 0 `discrepancy` findings — only `comparison` findings confirming consistency |
| `purchase-order.txt`, `vendor-invoice.txt` | The vendor invoiced 10 units of a line item the PO ordered 12 of, so the totals don't reconcile (`INR 250,632` ordered vs `INR 245,676` billed) | 1 `discrepancy` finding citing both totals and the differing line item |

Upload any of these sets (or mix documents across scenarios, or upload something unrelated) and
run analysis to see the mock respond accordingly — recognized documents get targeted, schema-valid
findings; anything unrecognized falls back to a generic placeholder finding.

### Worked example

Upload the first (mismatched) scenario's three files, select all three, and run this prompt:

> Check whether the applicant details are consistent and whether the declared income is
> corroborated by the bank statement.

The mock returns (abridged — full response also includes a `perDocument` entry per file):

```json
{
  "synthesis": {
    "summary": "Cross-document synthesis across 3 documents found at least one discrepancy worth reviewing — see findings below.",
    "findings": [
      {
        "category": "discrepancy",
        "title": "Applicant name mismatch between loan application and identity verification",
        "extractedFacts": [
          "Loan application name: \"Rohan A. Mehta\"",
          "Identity verification name: \"Rohan Ashok Mehta\""
        ],
        "aiInterpretation": "The name on file differs between the loan application and the identity verification record. This may be a benign abbreviation, but should be confirmed with the applicant before proceeding.",
        "confidence": "medium"
      },
      {
        "category": "comparison",
        "title": "Salary credit corroborates declared employer",
        "confidence": "high"
      },
      {
        "category": "comparison",
        "title": "Salary credit amount matches declared income",
        "confidence": "high"
      }
    ]
  }
}
```

Re-run the same prompt against the `-clean` scenario's three files and every synthesis finding
comes back `category: "comparison"` — no `discrepancy` — since all the fields agree. Swap in
`purchase-order.txt` + `vendor-invoice.txt` instead and you'll get a single `discrepancy` finding
citing both totals (`INR 250,632` vs `INR 245,676`) and the mismatched line item.

See `backend/src/services/mockAnalysis.ts` for the detection logic and
`backend/tests/mockAnalysis.test.ts` for tests covering all three scenarios above.

## Architecture overview

```
shared/types.ts          — canonical types, mirrored into backend/src/types and frontend/src/types
backend/
  src/
    types/                — shared.ts (mirror of shared/types.ts)
    db/                   — schema.sql, db.ts (connection), repository.ts (all queries)
    extractors/            — DocumentExtractor interface + one impl per file type
    middleware/            — multer upload config, centralized error handler
    validation/schemas.ts  — Zod schemas for API requests AND the LLM's JSON output
    services/
      LlmClient.ts              — provider-agnostic interface
      AnthropicLlmClient.ts     — real implementation (Anthropic SDK)
      MockLlmClient.ts          — deterministic offline implementation (parses [DOCUMENT] blocks)
      mockAnalysis.ts           — content-aware detectors the mock uses to build realistic findings
      promptBuilder.ts          — builds the system prompt + per-document-tagged user prompt
      AnalysisService.ts        — orchestrates LLM call → schema validation → retry → persistence shape
      DocumentPipeline.ts       — orchestrates extraction → DB persistence per uploaded file
    routes/                — documents.ts, analysis.ts (thin — delegate to services)
    app.ts / server.ts
  tests/                  — extractor unit tests, mock-analysis unit tests, analysis API contract test
frontend/
  src/
    api/client.ts          — typed fetch wrapper
    components/            — UploadPanel, PromptPanel, ResultsView, FindingCard, SourceExcerptModal
    App.tsx
```

**Request flow:** a file is uploaded → multer validates type/size/MIME and stores it under a
random UUID filename → `DocumentPipeline` inserts a `pending` DB row, hands the file to the
matching `DocumentExtractor`, and persists either the extracted text/rows (`parsed`) or an
error message (`failed`) — a single bad file can never take down the rest of the batch or crash
the server. When the user submits a prompt, `AnalysisService` pulls the already-extracted text
for each selected document, truncates each document's text *independently* against a character
budget (so no single huge document starves the others), wraps each in an explicit
`[DOCUMENT id=... ]...[/DOCUMENT]` block, and sends one request to the LLM asking for both a
per-document pass and a cross-document synthesis pass in a single structured JSON response. That
response is validated against a Zod schema — including a check that every finding's
`sourceDocumentIds` only references document IDs that were actually sent — retried once on
failure, and only persisted/returned once it passes.

## Key design decisions / assumptions

- **Document boundaries are structural, not just requested.** The explicit constraint was "don't
  concatenate documents into an unstructured blob." Boundaries are preserved with tagged blocks
  carrying real document IDs, and provenance is *enforced* post-hoc by rejecting (as a schema
  validation failure, eligible for the one retry) any finding that cites a document ID not
  present in the request — the model can't hallucinate a source.
- **`extractedFacts` vs `aiInterpretation` are separate fields, not separate sentences in one
  string.** The system prompt instructs the model to keep verbatim/near-verbatim facts distinct
  from its own judgment, and the Zod schema requires both.
- **Extraction failures are data, not exceptions.** `DocumentExtractor` implementations throw an
  `ExtractionError` for genuinely bad input (corrupt PDF, empty file, binary renamed to `.txt`),
  and the pipeline layer catches that and writes a `failed` status row rather than letting it
  propagate — the API and UI both treat "failed to parse" as a normal, displayable state.
  Assumption: a document that failed extraction is excluded from analysis entirely (the API
  rejects an analysis request referencing a non-`parsed` document) rather than being silently
  skipped, so the user always knows exactly which documents an analysis result covers.
  Multiple `parsed` documents are required to unlock true cross-document synthesis; a single
  document still runs (per-document pass + a degenerate "synthesis" over one input).
- **CSV rows are preserved structurally (`extractedRows`) in addition to a flattened text
  view.** The flattened text is what's sent to the LLM (kept consistent with how PDF/TXT are
  sent), but the structured rows are stored and returned in case a future feature wants to do
  programmatic (non-LLM) comparison across tabular data.
- **better-sqlite3 was chosen over Prisma** for zero setup friction in an assessment context; the
  schema deliberately avoids SQLite-only constructs (UUID text keys, ISO timestamp strings, JSON
  stored as TEXT) so moving to Postgres is a driver swap + `JSON` → `JSONB` column type change,
  not a schema redesign.
- **Sequential (not parallel) extraction** for a given upload batch — predictable resource use
  and avoids concurrent-writer contention against SQLite's single-writer model. See
  "Productionizing" for how this changes with a queue.

## Completed functionality

- Multi-file upload (PDF, CSV, TXT; PNG/JPG accepted and stored but not OCR'd) with type/size
  validation, sanitized on-disk filenames, and no path traversal risk.
- Per-file extraction with graceful, per-document error handling.
- Free-text prompt → per-document analysis pass + cross-document synthesis pass in one
  LLM round trip, both against a strict Zod-validated JSON schema, with one retry on
  validation/provenance failure.
- Per-document character-budget truncation, flagged in both the API response
  (`anyTruncated`) and per-document metadata/summary.
- Full persistence: documents and analyses (plus a normalized `findings` table for future
  querying) are stored in SQLite, linked by document/analysis IDs.
- Frontend: drag-and-drop upload with live per-file status, document selection, prompt input
  with character counter, a results view separating synthesis from per-document findings, a
  clickable source-document tag on every finding that opens the original extracted excerpt,
  and copy-to-clipboard for the full result set.
- Automated tests: extractor unit tests (CSV/TXT, including corrupt/empty-input handling), mock
  analysis unit tests covering the generic fallback plus all three `sample-documents/` scenarios
  (mismatch detection, clean/no-discrepancy case, PO/invoice total mismatch), and an API contract
  test that uploads a document, runs it through `/api/analysis` against the mock LLM, and asserts
  every returned finding's provenance is valid.

## Known limitations

- **No OCR.** `ImageExtractor` is a genuine stub — it stores the file and returns an explicit
  "not implemented" note rather than text. It's wired into the same `DocumentExtractor`
  interface as every real extractor specifically so a real OCR engine can be dropped in later
  without touching the upload route, pipeline, or analysis service.
- **No auth.** Anyone who can reach the API can upload/analyze/read anything in it — acceptable
  for a local assessment build, not for anything multi-tenant (see Productionizing).
  For local dev, that's fine, but see below for how it should change before production.
- **Local disk storage**, cleaned up immediately after extraction. There's no durable copy of
  the original file after that point — only the extracted text/rows persist. That's a deliberate
  simplification; a production build would keep the original in object storage (see below).
- **Single SQLite file, WAL mode, no connection pooling** — fine for the single-process,
  single-user scope of this build, not for concurrent multi-user load.
- **The character-budget truncation is a rough proxy for a token budget** (a fixed
  chars-per-document limit, not an actual tokenizer count), which is conservative but not exact.
- **The retry-once policy in `AnalysisService`** only retries validation/provenance failures, not
  transient network errors from the LLM provider — a production build would add backoff-based
  retry for those separately.

## Security considerations

- Uploaded files are stored under a fresh `crypto.randomUUID()` filename with the extension
  taken from the *validated* extension list, never derived from client-supplied path text — this
  eliminates path traversal and filename-collision overwrite risk.
- Extension **and** MIME type are cross-checked (`middleware/upload.ts`); a `.txt` file claiming
  to be `application/pdf` is rejected.
- File size and file count are capped per request (`MAX_FILE_SIZE_BYTES`, `MAX_FILES_PER_UPLOAD`)
  and enforced by multer before any extractor runs.
- Uploaded content is never executed or evaluated — extractors only ever read bytes/text out of
  the file (`pdf-parse`, `papaparse`, `fs.readFile`); nothing shells out to the file or `eval`s
  its contents.
- All API request bodies are validated with Zod (`analysisRequestSchema`) before touching the
  DB or LLM — including prompt length and document ID shape.
- The LLM's output is treated as untrusted input: it's schema-validated, and every finding's
  claimed source document IDs are checked against the actual request before persistence, closing
  off prompt-injection-via-document-content as a path to fabricating false provenance.
- Errors are surfaced through a typed `AppError` hierarchy mapped to a consistent JSON shape,
  so internal error details (stack traces, file paths) are never leaked to the client — the
  generic 500 path explicitly logs server-side and returns a static message.

## How this would be productionized

- **Object storage instead of local disk.** Uploads would go to S3/GCS behind a signed-URL flow;
  multer's disk storage would be replaced with direct-to-bucket upload, and the extraction step
  would stream from the bucket rather than local disk.
- **Queueing for large files / batches.** Move extraction (and LLM calls) off the request thread
  onto a job queue (BullMQ/SQS + workers) so a 10-file, 15 MB-each upload doesn't hold an HTTP
  request open; the frontend would poll or subscribe (WebSocket/SSE) for per-document status
  instead of receiving it synchronously in the upload response.
- **Auth + per-user document scoping.** Every table would gain a `user_id` / `org_id` column,
  every query would be scoped accordingly, and routes would sit behind session or API-key auth.
- **Rate limiting**, especially on `/api/documents/upload` and `/api/analysis` (the latter is the
  expensive LLM-calling path) — token-bucket per user/IP.
- **Postgres** in place of SQLite for concurrent multi-user write load, using the schema as
  written (TEXT→UUID, TEXT JSON→JSONB, ISO strings→TIMESTAMPTZ) plus a real migration tool.
- **Structured logging + request tracing** (e.g. pino + a request ID threaded through
  extraction/LLM/DB calls) to make provenance-validation failures and LLM retries debuggable in
  production, not just visible as a 502 to the client.
- **Virus/malware scanning** on uploaded files before they're persisted anywhere durable, given
  this accepts arbitrary user file uploads.
- **Real OCR** behind the existing `ImageExtractor`/`DocumentExtractor` seam.
