import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Configure postgres connection for long-running operations
const connectionConfig = {
  max: 10, // Maximum number of connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 60, // Connection timeout in seconds
  socket_timeout: 300, // Socket timeout in seconds (5 minutes for long operations)
  prepare: false, // Disable prepared statements for better compatibility
};

const conn =
  globalForDb.conn ?? postgres(process.env.DATABASE_URL, connectionConfig);
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
