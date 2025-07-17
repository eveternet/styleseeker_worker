import { db } from "../../../server/db";
import { apiKeys } from "../../../server/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

// Private utility function
async function getApiKey(appId: number): Promise<string | null> {
  const result = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.appId, appId), eq(apiKeys.isActive, true)),
  });
  return result?.apiKey ?? null;
}

export async function createApiKey(appId: number): Promise<string> {
  // Generate a random API key
  const apiKey = randomBytes(32).toString("hex");

  // Check if an API key already exists for this app
  // We'll search for *any* key for the appId, not just an active one,
  // so we can properly deactivate it.
  const existingKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.appId, appId),
  });

  if (existingKey) {
    // Found an existing key for this appId.
    // Instead of updating it directly, we will deactivate it and insert a new one.

    // 1. Deactivate the old key
    await db
      .update(apiKeys)
      .set({
        isActive: false,
        // Optionally set a deactivation date if your schema has one
        // dateDeactivated: new Date(),
      })
      .where(eq(apiKeys.appId, appId));

    // 2. Insert the new key
    await db.insert(apiKeys).values({
      appId,
      apiKey: apiKey,
      isActive: true,
      // dateCreated defaults in schema or add here if needed
    });
  } else {
    // If no existing key, create a brand new one
    await db.insert(apiKeys).values({
      appId,
      apiKey: apiKey,
      isActive: true,
    });
  }

  return apiKey;
}

export async function verifyApiKey(
  request: Request,
  appId: number,
): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const apiKey = authHeader.substring(7);
  const existingKey = await getApiKey(appId);
  if (!existingKey) return false;

  return existingKey === apiKey;
}
