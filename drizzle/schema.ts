import {
  pgTable,
  index,
  foreignKey,
  integer,
  varchar,
  timestamp,
  boolean,
  unique,
  text,
  jsonb,
  date,
  primaryKey,
  real,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const searchAiApp = pgTable(
  "search_ai_app",
  {
    appId: integer("app_id").primaryKey().generatedByDefaultAsIdentity({
      name: "search_ai_app_app_id_seq",
      startWith: 1,
      increment: 1,
      minValue: 1,
      maxValue: 2147483647,
      cache: 1,
    }),
    appName: varchar("app_name", { length: 255 }).notNull(),
    dateCreated: timestamp("date_created", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    dateUpdated: timestamp("date_updated", {
      withTimezone: true,
      mode: "string",
    }),
    organisationId: integer("organisation_id").notNull(),
    subscriptionPlan: varchar("subscription_plan", { length: 100 }),
    billingStatus: varchar("billing_status", { length: 50 }),
    pluginName: varchar("plugin_name", { length: 100 }),
  },
  (table) => [
    index("app_organisation_idx").using(
      "btree",
      table.organisationId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.organisationId],
      foreignColumns: [searchAiOrganisation.organisationId],
      name: "search_ai_app_organisation_id_search_ai_organisation_organisati",
    }),
  ],
);

export const searchAiApiKey = pgTable(
  "search_ai_api_key",
  {
    keyId: integer("key_id").primaryKey().generatedByDefaultAsIdentity({
      name: "search_ai_api_key_key_id_seq",
      startWith: 1,
      increment: 1,
      minValue: 1,
      maxValue: 2147483647,
      cache: 1,
    }),
    appId: integer("app_id").notNull(),
    apiKey: varchar("api_key", { length: 255 }).notNull(),
    dateCreated: timestamp("date_created", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    dateUpdated: timestamp("date_updated", {
      withTimezone: true,
      mode: "string",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    isActive: boolean("is_active").default(true).notNull(),
    creatorClerkUserId: varchar("creator_clerk_user_id", { length: 255 }),
  },
  (table) => [
    index("api_key_app_idx").using(
      "btree",
      table.appId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.appId],
      foreignColumns: [searchAiApp.appId],
      name: "search_ai_api_key_app_id_search_ai_app_app_id_fk",
    }),
  ],
);

export const searchAiOrganisation = pgTable(
  "search_ai_organisation",
  {
    organisationId: integer("organisation_id")
      .primaryKey()
      .generatedByDefaultAsIdentity({
        name: "search_ai_organisation_organisation_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        maxValue: 2147483647,
        cache: 1,
      }),
    clerkOrgId: varchar("clerk_org_id", { length: 255 }).notNull(),
    organisationName: varchar("organisation_name", { length: 255 }).notNull(),
    dateCreated: timestamp("date_created", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    dateUpdated: timestamp("date_updated", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    unique("search_ai_organisation_clerk_org_id_unique").on(table.clerkOrgId),
  ],
);

export const searchAiPluginConfigShopcada = pgTable(
  "search_ai_plugin_config_shopcada",
  {
    appId: integer("app_id").primaryKey().notNull(),
    apiKey: varchar("api_key", { length: 255 }).notNull(),
    apiHostname: varchar("api_hostname", { length: 255 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.appId],
      foreignColumns: [searchAiApp.appId],
      name: "search_ai_plugin_config_shopcada_app_id_search_ai_app_app_id_fk",
    }),
  ],
);

export const searchAiQuery = pgTable(
  "search_ai_query",
  {
    queryId: integer("query_id").primaryKey().generatedByDefaultAsIdentity({
      name: "search_ai_query_query_id_seq",
      startWith: 1,
      increment: 1,
      minValue: 1,
      maxValue: 2147483647,
      cache: 1,
    }),
    appId: integer("app_id").notNull(),
    queryText: text("query_text").notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    sessionId: varchar("session_id", { length: 255 }),
    dateCreated: timestamp("date_created", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("query_app_idx").using(
      "btree",
      table.appId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.appId],
      foreignColumns: [searchAiApp.appId],
      name: "search_ai_query_app_id_search_ai_app_app_id_fk",
    }),
  ],
);

export const searchAiQueryResult = pgTable(
  "search_ai_query_result",
  {
    resultId: integer("result_id").primaryKey().generatedByDefaultAsIdentity({
      name: "search_ai_query_result_result_id_seq",
      startWith: 1,
      increment: 1,
      minValue: 1,
      maxValue: 2147483647,
      cache: 1,
    }),
    queryId: integer("query_id").notNull(),
    productIdsReturned: jsonb("product_ids_returned"),
    responseTimeMs: integer("response_time_ms"),
    dateCreated: timestamp("date_created", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => [
    index("query_result_query_idx").using(
      "btree",
      table.queryId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.queryId],
      foreignColumns: [searchAiQuery.queryId],
      name: "search_ai_query_result_query_id_search_ai_query_query_id_fk",
    }),
  ],
);

export const searchAiUsageSummary = pgTable(
  "search_ai_usage_summary",
  {
    summaryId: integer("summary_id").primaryKey().generatedByDefaultAsIdentity({
      name: "search_ai_usage_summary_summary_id_seq",
      startWith: 1,
      increment: 1,
      minValue: 1,
      maxValue: 2147483647,
      cache: 1,
    }),
    appId: integer("app_id").notNull(),
    queryCount: integer("query_count").notNull(),
    date: date().notNull(),
    billingPeriod: varchar("billing_period", { length: 50 }),
  },
  (table) => [
    index("usage_summary_app_idx").using(
      "btree",
      table.appId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.appId],
      foreignColumns: [searchAiApp.appId],
      name: "search_ai_usage_summary_app_id_search_ai_app_app_id_fk",
    }),
  ],
);

export const searchAiVector = pgTable(
  "search_ai_vector",
  {
    appId: integer("app_id").notNull(),
    productId: varchar("product_id", { length: 255 }).notNull(),
    productName: varchar("product_name", { length: 255 }),
    embedding: real().array(),
    dateCreated: timestamp("date_created", {
      withTimezone: true,
      mode: "string",
    })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    dateUpdated: timestamp("date_updated", {
      withTimezone: true,
      mode: "string",
    }),
    firstImageUrl: varchar("first_image_url", { length: 1024 }),
    imageUrlChecksum: varchar("image_url_checksum", { length: 64 }),
    imageDescription: text("image_description"),
  },
  (table) => [
    foreignKey({
      columns: [table.appId],
      foreignColumns: [searchAiApp.appId],
      name: "search_ai_vector_app_id_search_ai_app_app_id_fk",
    }),
    primaryKey({
      columns: [table.appId, table.productId],
      name: "search_ai_vector_app_id_product_id_pk",
    }),
  ],
);
