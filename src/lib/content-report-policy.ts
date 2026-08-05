export function contentReportDisposition(input: {
  courseIsPublic: boolean;
  serious: boolean;
  reporterIsOwner: boolean;
  seriousReporterCount: number;
}) {
  return {
    quarantine: input.courseIsPublic && input.serious && input.reporterIsOwner,
    escalate: input.courseIsPublic && input.serious && input.seriousReporterCount >= 2,
  };
}
