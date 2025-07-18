// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { sql } from "drizzle-orm";
import {
  pgTableCreator,
  varchar,
  integer,
  timestamp,
  text,
  boolean,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * This is the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `search_ai_${name}`);

// APP table
export const apps = createTable("app", {
  appId: integer("app_id").primaryKey().generatedByDefaultAsIdentity(),
  appName: varchar("app_name", { length: 255 }).notNull(),
  dateCreated: timestamp("date_created", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  dateUpdated: timestamp("date_updated", { withTimezone: true }).$onUpdate(
    () => new Date()
  ),
  subscriptionPlan: varchar("subscription_plan", { length: 100 })
    .notNull()
    .default("free"),
  billingStatus: varchar("billing_status", { length: 50 })
    .notNull()
    .default("active"),
  pluginName: varchar("plugin_name", { length: 100 })
    .notNull()
    .default("unknown"),
  webhookId: uuid("webhook_id").notNull().defaultRandom(),
});

// API_KEYS table
export const apiKeys = createTable(
  "api_key",
  {
    keyId: integer("key_id").primaryKey().generatedByDefaultAsIdentity(),
    appId: integer("app_id")
      .notNull()
      .unique()
      .references(() => apps.appId),
    apiKey: varchar("api_key", { length: 255 }).notNull(),
    dateCreated: timestamp("date_created", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    dateUpdated: timestamp("date_updated", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    creatorClerkUserId: varchar("creator_clerk_user_id", { length: 255 })
      .notNull()
      .default("system"),
  },
  (table) => [index("api_key_app_idx").on(table.appId)]
);

// PLUGIN_CONFIG_SHOPCADA table
export const pluginConfigShopcada = createTable("plugin_config_shopcada", {
  appId: integer("app_id")
    .primaryKey()
    .references(() => apps.appId),
  apiKey: varchar("api_key", { length: 255 }).notNull(),
  apiHostname: varchar("api_hostname", { length: 255 }).notNull(),
});

export const pluginConfigShopcadaWebhook = createTable(
  "plugin_config_shopcada_webhook",
  {
    appId: integer("app_id")
      .primaryKey()
      .references(() => apps.appId),
    webhookSecret: varchar("webhook_secret", { length: 255 }).notNull(),
  }
);

// VECTORS table
export const vectors = createTable(
  "vector",
  {
    appId: integer("app_id")
      .notNull()
      .references(() => apps.appId),
    productId: varchar("product_id", { length: 255 }).notNull(),
    productName: varchar("product_name", { length: 255 }).notNull(),
    fullText: varchar("full_text", { length: 64 }).notNull().default(""), // SHA-256 hash of text content
    imageUrls: varchar("image_urls", { length: 64 }).notNull().default(""), // SHA-256 hash of image content
    imageDescription: text("image_description"),
    dateCreated: timestamp("date_created", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    dateUpdated: timestamp("date_updated", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
    isPublished: boolean("is_published").notNull().default(false),
  },
  (table) => [
    // Using a composite primary key with appId and productId
    index("vector_pk_idx").on(table.appId, table.productId),
    index("vector_app_idx").on(table.appId),
    index("vector_full_text_idx").on(table.fullText),
    index("vector_image_urls_idx").on(table.imageUrls),
  ]
);

// Define relationships
export const appsRelations = relations(apps, ({ many }) => ({
  apiKeys: many(apiKeys),
  pluginConfigShopcada: many(pluginConfigShopcada),
  pluginConfigShopcadaWebhook: many(pluginConfigShopcadaWebhook),
  vectors: many(vectors),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  app: one(apps, {
    fields: [apiKeys.appId],
    references: [apps.appId],
  }),
}));

export const pluginConfigShopcadaRelations = relations(
  pluginConfigShopcada,
  ({ one }) => ({
    app: one(apps, {
      fields: [pluginConfigShopcada.appId],
      references: [apps.appId],
    }),
  })
);

export const pluginConfigShopcadaWebhookRelations = relations(
  pluginConfigShopcadaWebhook,
  ({ one }) => ({
    app: one(apps, {
      fields: [pluginConfigShopcadaWebhook.appId],
      references: [apps.appId],
    }),
  })
);

export const vectorsRelations = relations(vectors, ({ one }) => ({
  app: one(apps, {
    fields: [vectors.appId],
    references: [apps.appId],
  }),
}));
