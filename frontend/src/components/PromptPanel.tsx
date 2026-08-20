interface PromptPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  maxLength: number;
  selectedCount: number;
  submitting: boolean;
}

export function PromptPanel({
  prompt,
  onPromptChange,
  onSubmit,
  maxLength,
  selectedCount,
  submitting,
}: PromptPanelProps) {
  const canSubmit = prompt.trim().length >= 3 && selectedCount > 0 && !submitting;

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <div className="panel-header">
        <span>Analysis Request</span>
        <span>{selectedCount} document{selectedCount === 1 ? "" : "s"} selected</span>
      </div>
      <div className="panel-body">
        <textarea
          className="prompt-textarea"
          placeholder='e.g. "Compare financial position across these documents" or "Find inconsistencies in names and addresses"'
          value={prompt}
          maxLength={maxLength}
          onChange={(e) => onPromptChange(e.target.value)}
        />
        <div className="char-count">
          {prompt.length} / {maxLength}
        </div>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={onSubmit}>
          {submitting ? "Analyzing…" : "Run Analysis"}
        </button>
      </div>
    </div>
  );
}
