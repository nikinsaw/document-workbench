import { useRef, useState } from "react";
import type { DocumentRecord } from "../types/shared";

interface UploadPanelProps {
  documents: DocumentRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (documentId: string) => void;
  onFilesSelected: (files: File[]) => void;
  onViewSource: (documentId: string) => void;
  uploading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPanel({
  documents,
  selectedIds,
  onToggleSelect,
  onFilesSelected,
  onViewSource,
  uploading,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Source Documents</span>
        <span>{documents.length} uploaded</span>
      </div>
      <div className="panel-body">
        <div
          className={`dropzone${dragging ? " dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
        >
          <p className="dropzone-label">{uploading ? "Uploading…" : "Drop files, or click to browse"}</p>
          <p className="dropzone-sub">PDF · CSV · TXT · PNG/JPG (image OCR not yet implemented)</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden-input"
            accept=".pdf,.csv,.txt,.png,.jpg,.jpeg"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {documents.length > 0 && (
          <ul className="doc-list">
            {documents.map((doc) => (
              <li
                key={doc.documentId}
                className={`doc-row${selectedIds.has(doc.documentId) ? " selected" : ""}`}
                onClick={() => doc.status === "parsed" && onToggleSelect(doc.documentId)}
              >
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={selectedIds.has(doc.documentId)}
                  disabled={doc.status !== "parsed"}
                  onChange={() => onToggleSelect(doc.documentId)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="doc-row-info">
                  <div className="doc-row-name" title={doc.fileName}>
                    {doc.fileName}
                  </div>
                  <div className="doc-row-meta">
                    {doc.fileType} · {formatBytes(doc.sizeBytes)}
                    {doc.status === "failed" && doc.errorMessage ? ` · ${doc.errorMessage}` : ""}
                  </div>
                </div>
                {doc.status === "parsed" && (
                  <button
                    className="btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewSource(doc.documentId);
                    }}
                  >
                    View
                  </button>
                )}
                <span className={`status-chip ${doc.status}`}>{doc.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
