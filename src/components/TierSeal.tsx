/**
 * TierSeal — a small engraved-plate seal identifying a course created by a
 * Plus or Pro account. Rendered on the top-right corner of course artwork.
 * Free-tier and legacy courses have no seal.
 */
export default function TierSeal({ tier }: { tier: "plus" | "pro" }) {
  const label = tier === "pro" ? "Pro creator course" : "Plus creator course";
  return (
    <span className={`tier-seal tier-seal-${tier}`} role="img" aria-label={label}>
      <span aria-hidden="true">{tier === "pro" ? "PRO" : "PLUS"}</span>
    </span>
  );
}
