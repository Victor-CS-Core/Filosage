type Environment = Record<string, string | undefined>;

export function isQaEnvironment(environment: Environment = process.env) {
  return environment.OPERATIONS_ENVIRONMENT?.trim().toLowerCase() === "qa"
    || environment.DEPLOYMENT_ENVIRONMENT?.trim().toLowerCase() === "qa";
}
