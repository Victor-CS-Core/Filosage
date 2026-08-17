export const COMMIT_VELOCITY = 650;

const MAX_SAMPLED_VELOCITY = 12_000;

function clampVelocity(velocity: number) {
  return Math.min(MAX_SAMPLED_VELOCITY, Math.max(-MAX_SAMPLED_VELOCITY, velocity));
}

export function arbitrateCourseDeckReleaseVelocity(
  sampledVelocity: number,
  historicalVelocity: number,
) {
  const sampled = clampVelocity(sampledVelocity);
  const historical = clampVelocity(historicalVelocity);
  const oppositeDirections = sampled !== 0
    && historical !== 0
    && Math.sign(sampled) !== Math.sign(historical);

  if (oppositeDirections) {
    return Math.abs(sampled) >= COMMIT_VELOCITY ? sampled : historical;
  }

  return Math.abs(sampled) > Math.abs(historical) ? sampled : historical;
}

export function arbitrateCourseDeckDragVelocity(
  previousVelocity: number,
  sampledVelocity: number,
  historicalVelocity: number,
) {
  const immediateVelocity = clampVelocity(sampledVelocity);
  const previousDirection = Math.sign(previousVelocity);
  const immediateReversesDirection = previousDirection !== 0
    && Math.abs(immediateVelocity) >= COMMIT_VELOCITY
    && Math.sign(immediateVelocity) !== previousDirection;
  const strongestVelocity = immediateReversesDirection
    ? immediateVelocity
    : arbitrateCourseDeckReleaseVelocity(immediateVelocity, historicalVelocity);
  const currentVelocity = clampVelocity(strongestVelocity);
  const reversesDirection = Math.abs(currentVelocity) >= COMMIT_VELOCITY
    && Math.sign(currentVelocity) !== previousDirection;
  return !reversesDirection && Math.abs(previousVelocity) > Math.abs(currentVelocity)
    ? previousVelocity
    : currentVelocity;
}
