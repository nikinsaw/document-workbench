import type {
  UploadResponse,
  AnalysisRequest,
  AnalysisResult,
  DocumentRecord,
  SourceExcerptResponse,
  ApiErrorBody,
} from "../types/shared";

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiErrorBody;
    try {
      body = await res.json();
    } catch {
      body = { error: { code: "UNKNOWN", message: `Request failed with status ${res.status}` } };
    }
    throw new ApiClientError(res.status, body);
  }
  return res.json() as Promise<T>;
}

export async function uploadDocuments(files: File[]): Promise<DocumentRecord[]> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  const res = await fetch("/api/documents/upload", {
    method: "POST",
    body: formData,
  });
  const data = await handleResponse<UploadResponse>(res);
  return data.documents;
}

export async function fetchDocuments(): Promise<DocumentRecord[]> {
  const res = await fetch("/api/documents");
  const data = await handleResponse<{ documents: DocumentRecord[] }>(res);
  return data.documents;
}

export async function fetchSourceExcerpt(documentId: string): Promise<SourceExcerptResponse> {
  const res = await fetch(`/api/documents/${documentId}/excerpt`);
  return handleResponse<SourceExcerptResponse>(res);
}

export async function runAnalysis(request: AnalysisRequest): Promise<AnalysisResult> {
  const res = await fetch("/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return handleResponse<AnalysisResult>(res);
}
