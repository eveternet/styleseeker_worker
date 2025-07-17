/**
 * Validates and parses appId from request body
 * @param appId - Raw appId from request
 * @returns Parsed integer appId
 * @throws Error if appId is invalid
 */
export function validateAppId(appId: unknown): number {
  if (appId === null || appId === undefined) {
    throw new Error("appId is required");
  }

  if (typeof appId !== "string" && typeof appId !== "number") {
    throw new Error("appId must be a string or number");
  }

  const parsed = parseInt(String(appId));
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error("appId must be a positive integer");
  }

  return parsed;
}
