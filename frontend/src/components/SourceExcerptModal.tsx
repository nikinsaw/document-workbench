import { useEffect, useState } from "react";
import { fetchSourceExcerpt } from "../api/client";
import type { SourceExcerptResponse } from "../types/shared";

interface SourceExcerptModalProps {
  documentId: string;
  onClose: () => void;
}

export function SourceExcerptModal({ documentId, onClose }: SourceExcerptModalProps) {
  const [data, setData] = useState<SourceExcerptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSourceExcerpt(documentId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load source excerpt.");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {error && <div className="error-banner">{error}</div>}
        {!data && !error && <div className="loading-line">Loading source excerpt…</div>}
        {data && (
          <>
            <p className="modal-title">{data.fileName}</p>
            <p className="modal-sub">document id: {data.documentId}</p>
            <div className="modal-excerpt">{data.excerpt}</div>
          </>
        )}
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
