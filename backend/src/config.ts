import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  port: intFromEnv("PORT", 4000),
  dbPath: process.env.DB_PATH ?? path.join(__dirname, "..", "data", "workbench.db"),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(__dirname, "..", "uploads"),

  // File upload limits
  maxFileSizeBytes: intFromEnv("MAX_FILE_SIZE_BYTES", 15 * 1024 * 1024), // 15 MB
  maxFilesPerUpload: intFromEnv("MAX_FILES_PER_UPLOAD", 10),

  // Prompt limits
  maxPromptLength: intFromEnv("MAX_PROMPT_LENGTH", 2000),

  // LLM
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "claude-sonnet-4-6",
  /** Use the mock LLM client instead of calling a real API — handy for local dev/tests. */
  useMockLlm: process.env.USE_MOCK_LLM === "true" || !process.env.ANTHROPIC_API_KEY,

  // Token budget: rough character budget per document before we truncate.
  // ~4 chars/token, targeting a conservative per-document slice of a larger context window.
  maxCharsPerDocument: intFromEnv("MAX_CHARS_PER_DOCUMENT", 24000),

  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
