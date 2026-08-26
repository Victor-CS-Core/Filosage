export function releaseSafetyBillingState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.enabled === false
    && value.checkoutReady === false
    && value.ready === false
    && (value.rolloutMode === "closed" || value.rolloutMode === "configured");
}
