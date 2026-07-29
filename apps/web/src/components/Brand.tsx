export function Brand({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        M
      </span>
      {!compact && (
        <span>
          <strong>Marktake</strong>
          <small>review the cut, mark the moment</small>
        </span>
      )}
    </div>
  );
}
