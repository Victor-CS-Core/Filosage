export default function EnvironmentPill() {
  return (
    <span
      className="environment-pill"
      role="status"
      aria-label="QA environment — isolated test data"
      title="QA environment — isolated test data"
    >
      <span className="environment-pill-dot" aria-hidden="true" />
      <span>QA</span>
      <span className="environment-pill-detail" aria-hidden="true">isolated data</span>
    </span>
  );
}
