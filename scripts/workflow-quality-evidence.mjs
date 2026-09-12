export const qualityWorkflowPath = '.github/workflows/quality-gate.yml';
const requiredJobs = ['static-and-release-contracts', 'browser-smoke', 'postgres-transactions'];
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

// Workflow success alone also describes documentation runs with expensive jobs
// skipped. Only a complete, bounded job listing from this attempt is evidence.
export function qualityJobsPassed(run, listing) {
  if (!positiveInteger(run?.id) || !positiveInteger(run?.run_attempt)
    || !Array.isArray(listing?.jobs) || !Number.isSafeInteger(listing.total_count)
    || listing.total_count !== listing.jobs.length || listing.total_count > 100
    || new Set(listing.jobs.map((job) => job?.id)).size !== listing.jobs.length) return false;
  return requiredJobs.every((name) => {
    const matches = listing.jobs.filter((job) => job?.name === name);
    return matches.length === 1 && matches.every((job) => positiveInteger(job.id)
      && job.run_id === run.id && job.run_attempt === run.run_attempt
      && job.head_sha === run.head_sha && job.status === 'completed' && job.conclusion === 'success');
  });
}
