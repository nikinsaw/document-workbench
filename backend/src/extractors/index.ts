import path from "node:path";
import type { DocumentExtractor } from "./DocumentExtractor";
import { PdfExtractor } from "./PdfExtractor";
import { CsvExtractor } from "./CsvExtractor";
import { TxtExtractor } from "./TxtExtractor";
import { ImageExtractor } from "./ImageExtractor";
import type { SupportedFileType } from "../types/shared";
import { ValidationError } from "../errors";

const EXTRACTORS: Record<SupportedFileType, DocumentExtractor> = {
  pdf: new PdfExtractor(),
  csv: new CsvExtractor(),
  txt: new TxtExtractor(),
  image: new ImageExtractor(),
};

const EXTENSION_MAP: Record<string, SupportedFileType> = {
  ".pdf": "pdf",
  ".csv": "csv",
  ".txt": "txt",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
};

export function fileTypeFromName(fileName: string): SupportedFileType {
  const ext = path.extname(fileName).toLowerCase();
  const fileType = EXTENSION_MAP[ext];
  if (!fileType) {
    throw new ValidationError(
      `Unsupported file extension "${ext}". Supported types: PDF, CSV, TXT, PNG/JPG (image, stubbed).`
    );
  }
  return fileType;
}

export function getExtractor(fileType: SupportedFileType): DocumentExtractor {
  return EXTRACTORS[fileType];
}

export { EXTRACTORS };
