import "./loading-state.css";

export function LoadingState({ label, rows = 0 }: { label: string; rows?: number }) {
  return <span className="loti-loading" role="status">
    <span className="loti-loading-label"><span className="loti-loading-indicator" aria-hidden="true" />{label}</span>
    {rows > 0 && <span className="loti-loading-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => <span className="loti-loading-row" key={index}>
        <span className="loti-loading-marker" />
        <span className="loti-loading-lines"><span /><span /></span>
        <span className="loti-loading-value" />
      </span>)}
    </span>}
  </span>;
}
