import { useCallback, useMemo, useState } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { PromptPanel } from "./components/PromptPanel";
import { ResultsView } from "./components/ResultsView";
import { SourceExcerptModal } from "./components/SourceExcerptModal";
import { uploadDocuments, runAnalysis, ApiClientError } from "./api/client";
import type { DocumentRecord, AnalysisResult } from "./types/shared";

const MAX_PROMPT_LENGTH = 2000;

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingSourceId, setViewingSourceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadDocuments(files);
      setDocuments((prev) => [...uploaded, ...prev]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const doc of uploaded) {
          if (doc.status === "parsed") next.add(doc.documentId);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  const toggleSelect = useCallback((documentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const result = await runAnalysis({ documentIds: Array.from(selectedIds), prompt });
      setAnalysis(result);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Analysis failed. Please try again.");
      }
    } finally {
      setAnalyzing(false);
    }
  }, [selectedIds, prompt]);

  const handleCopy = useCallback(() => {
    if (!analysis) return;
    const text = [
      `Analysis: ${analysis.prompt}`,
      "",
      "SYNTHESIS",
      analysis.synthesis.summary,
      ...analysis.synthesis.findings.map(
        (f) => `- [${f.category}] ${f.title}\n  Facts: ${f.extractedFacts.join("; ")}\n  Interpretation: ${f.aiInterpretation}\n  Sources: ${f.sourceDocumentIds.join(", ")}`
      ),
      "",
      ...analysis.perDocument.flatMap((d) => [
        `PER-DOCUMENT: ${d.documentId}`,
        d.summary,
        ...d.findings.map(
          (f) => `- [${f.category}] ${f.title}\n  Facts: ${f.extractedFacts.join("; ")}\n  Interpretation: ${f.aiInterpretation}`
        ),
        "",
      ]),
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [analysis]);

  const selectedParsedCount = useMemo(
    () => documents.filter((d) => selectedIds.has(d.documentId) && d.status === "parsed").length,
    [documents, selectedIds]
  );

  return (
    <div className="app-shell">
      <header className="masthead">
        <h1 className="masthead-title">
          Multi-Document <span>Intelligence</span> Workbench
        </h1>
        <span className="masthead-meta">v1.0 · local instance</span>
      </header>
      <div className="masthead-rule">
        <span>upload → extract → analyze → trace</span>
        <span>{documents.length} document{documents.length === 1 ? "" : "s"} in session</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="workbench-grid">
        <div>
          <UploadPanel
            documents={documents}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onFilesSelected={handleFilesSelected}
            onViewSource={setViewingSourceId}
            uploading={uploading}
          />
          <PromptPanel
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={handleSubmit}
            maxLength={MAX_PROMPT_LENGTH}
            selectedCount={selectedParsedCount}
            submitting={analyzing}
          />
        </div>

        <ResultsView
          analysis={analysis}
          documents={documents}
          onViewSource={setViewingSourceId}
          onCopy={handleCopy}
          copied={copied}
        />
      </div>

      {viewingSourceId && (
        <SourceExcerptModal documentId={viewingSourceId} onClose={() => setViewingSourceId(null)} />
      )}
    </div>
  );
}
