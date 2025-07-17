import { db } from "../../../server/db";
import { apps } from "../../../server/db/schema";
import { eq } from "drizzle-orm";

export default async function get_plugin_name(
  appId: string,
): Promise<string | null> {
  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.appId, parseInt(appId)))
    .limit(1);

  return app?.pluginName ?? null;
}
