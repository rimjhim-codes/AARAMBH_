export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-mark" aria-hidden="true">A</span>
      <div>
        <strong>ARAMBH</strong>
        <span>Loading your workspace…</span>
      </div>
    </div>
  );
}
