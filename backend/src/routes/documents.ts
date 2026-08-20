import { Router } from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import { upload } from "../middleware/upload";
import { asyncHandler } from "../middleware/errorHandler";
import { processUploadedFiles } from "../services/DocumentPipeline";
import { fileTypeFromName } from "../extractors";
import { getDocumentById, listDocuments, getDocumentExtraction } from "../db/repository";
import { NotFoundError, ValidationError } from "../errors";
import type { UploadResponse, SourceExcerptResponse } from "../types/shared";
import { config } from "../config";

export const documentsRouter = Router();

documentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ documents: listDocuments() });
  })
);

documentsRouter.post(
  "/upload",
  upload.array("files", config.maxFilesPerUpload),
  asyncHandler(async (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw new ValidationError("No files were uploaded. Attach at least one file under the 'files' field.");
    }

    const inputs = files.map((file) => ({
      documentId: crypto.randomUUID(),
      fileName: file.originalname,
      fileType: fileTypeFromName(file.originalname),
      sizeBytes: file.size,
      storedPath: file.path,
    }));

    const documents = await processUploadedFiles(inputs);

    // Clean up temp files now that extraction has run and text is persisted
    // in the DB — we don't need the originals on disk afterwards. (A
    // production deployment would instead move originals to object storage;
    // see README.)
    for (const file of files) {
      fs.promises.unlink(file.path).catch(() => {
        /* best-effort cleanup; failure here shouldn't fail the request */
      });
    }

    const body: UploadResponse = { documents };
    res.status(201).json(body);
  })
);

documentsRouter.get(
  "/:documentId",
  asyncHandler(async (req, res) => {
    const record = getDocumentById(req.params.documentId);
    if (!record) throw new NotFoundError(`Document ${req.params.documentId} not found.`);
    res.json(record);
  })
);

/** Returns the source excerpt for a document, used by the frontend's "view source" modal. */
documentsRouter.get(
  "/:documentId/excerpt",
  asyncHandler(async (req, res) => {
    const extraction = getDocumentExtraction(req.params.documentId);
    if (!extraction) throw new NotFoundError(`Document ${req.params.documentId} not found.`);
    if (extraction.status !== "parsed") {
      throw new ValidationError(`Document ${req.params.documentId} has not been successfully parsed.`);
    }

    const body: SourceExcerptResponse = {
      documentId: extraction.documentId,
      fileName: extraction.fileName,
      excerpt: extraction.extractedText.slice(0, 5000),
    };
    res.json(body);
  })
);
