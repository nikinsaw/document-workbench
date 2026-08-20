import type { Finding, DocumentRecord } from "../types/shared";

interface FindingCardProps {
  finding: Finding;
  documentsById: Map<string, DocumentRecord>;
  onViewSource: (documentId: string) => void;
}

export function FindingCard({ finding, documentsById, onViewSource }: FindingCardProps) {
  return (
    <div className={`finding-card category-${finding.category}`}>
      <div className="finding-header">
        <p className="finding-title">{finding.title}</p>
        <span className="finding-category">
          {finding.confidence && (
            <span className={`confidence-dot confidence-${finding.confidence}`} title={`${finding.confidence} confidence`} />
          )}
          {finding.category}
        </span>
      </div>

      {finding.extractedFacts.length > 0 && (
        <>
          <div className="finding-block-label">Extracted facts</div>
          <ul className="finding-facts">
            {finding.extractedFacts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </>
      )}

      <div className="finding-block-label">AI interpretation</div>
      <p className="finding-interpretation">{finding.aiInterpretation}</p>

      <div className="source-tags">
        {finding.sourceDocumentIds.map((docId) => {
          const doc = documentsById.get(docId);
          return (
            <span key={docId} className="source-tag" onClick={() => onViewSource(docId)}>
              {doc ? doc.fileName : docId.slice(0, 8)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
