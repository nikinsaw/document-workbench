import type { AnalysisResult, DocumentRecord } from "../types/shared";
import { FindingCard } from "./FindingCard";

interface ResultsViewProps {
  analysis: AnalysisResult | null;
  documents: DocumentRecord[];
  onViewSource: (documentId: string) => void;
  onCopy: () => void;
  copied: boolean;
}

export function ResultsView({ analysis, documents, onViewSource, onCopy, copied }: ResultsViewProps) {
  const documentsById = new Map(documents.map((d) => [d.documentId, d]));

  if (!analysis) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span>Findings</span>
        </div>
        <div className="results-empty">
          <span className="results-empty-mark">§</span>
          Select documents and describe what you'd like analyzed. Every finding here will
          trace back to the document(s) it came from.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Findings</span>
        <button className="btn-ghost" onClick={onCopy}>
          {copied ? "Copied ✓" : "Copy results"}
        </button>
      </div>
      <div className="panel-body">
        {analysis.anyTruncated && (
          <div className="truncation-note">
            One or more documents exceeded the size budget and were truncated before analysis.
          </div>
        )}

        <p className="synthesis-summary">{analysis.synthesis.summary}</p>

        {analysis.synthesis.findings.length > 0 && (
          <>
            <div className="section-label">Cross-document synthesis</div>
            {analysis.synthesis.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                documentsById={documentsById}
                onViewSource={onViewSource}
              />
            ))}
          </>
        )}

        {analysis.perDocument.map((perDoc) => {
          const doc = documentsById.get(perDoc.documentId);
          return (
            <div key={perDoc.documentId}>
              <div className="section-label">{doc ? doc.fileName : perDoc.documentId}</div>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: -4 }}>{perDoc.summary}</p>
              {perDoc.findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  documentsById={documentsById}
                  onViewSource={onViewSource}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
