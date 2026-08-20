/**
 * Typed error hierarchy. Every API boundary catches these and maps them to a
 * consistent { error: { code, message, details } } JSON body (see middleware/errorHandler.ts).
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: unknown) {
    super("NOT_FOUND", message, 404, details);
    this.name = "NotFoundError";
  }
}

export class ExtractionError extends AppError {
  constructor(message: string, details?: unknown) {
    super("EXTRACTION_ERROR", message, 422, details);
    this.name = "ExtractionError";
  }
}

export class LlmError extends AppError {
  constructor(message: string, details?: unknown) {
    super("LLM_ERROR", message, 502, details);
    this.name = "LlmError";
  }
}

export class SchemaValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("LLM_SCHEMA_VALIDATION_ERROR", message, 502, details);
    this.name = "SchemaValidationError";
  }
}
