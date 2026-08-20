import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config";
import { fileTypeFromName } from "../extractors";

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".csv": ["text/csv", "application/vnd.ms-excel", "text/plain"],
  ".txt": ["text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    // Never trust the client-supplied filename for the on-disk name — sanitize
    // and generate a fresh random name to eliminate any path-traversal or
    // overwrite risk. The original name is preserved separately (req body /
    // multer's file.originalname) purely for display.
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${crypto.randomUUID()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter: NonNullable<multer.Options["fileFilter"]> = (_req, file, cb) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedMimes = ALLOWED_MIME_TYPES[ext];
    if (!allowedMimes) {
      cb(new Error(`Unsupported file extension "${ext}".`));
      return;
    }
    // Validate the extension resolves to one of our known document types.
    fileTypeFromName(file.originalname);

    if (!allowedMimes.includes(file.mimetype)) {
      cb(new Error(`File "${file.originalname}" has extension "${ext}" but MIME type "${file.mimetype}", which doesn't match.`));
      return;
    }
    cb(null, true);
  } catch (err) {
    cb(err as Error);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSizeBytes,
    files: config.maxFilesPerUpload,
  },
});
