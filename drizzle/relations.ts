import { relations } from "drizzle-orm/relations";
import { searchAiOrganisation, searchAiApp, searchAiApiKey, searchAiPluginConfigShopcada, searchAiQuery, searchAiQueryResult, searchAiUsageSummary, searchAiVector } from "./schema";

export const searchAiAppRelations = relations(searchAiApp, ({one, many}) => ({
	searchAiOrganisation: one(searchAiOrganisation, {
		fields: [searchAiApp.organisationId],
		references: [searchAiOrganisation.organisationId]
	}),
	searchAiApiKeys: many(searchAiApiKey),
	searchAiPluginConfigShopcadas: many(searchAiPluginConfigShopcada),
	searchAiQueries: many(searchAiQuery),
	searchAiUsageSummaries: many(searchAiUsageSummary),
	searchAiVectors: many(searchAiVector),
}));

export const searchAiOrganisationRelations = relations(searchAiOrganisation, ({many}) => ({
	searchAiApps: many(searchAiApp),
}));

export const searchAiApiKeyRelations = relations(searchAiApiKey, ({one}) => ({
	searchAiApp: one(searchAiApp, {
		fields: [searchAiApiKey.appId],
		references: [searchAiApp.appId]
	}),
}));

export const searchAiPluginConfigShopcadaRelations = relations(searchAiPluginConfigShopcada, ({one}) => ({
	searchAiApp: one(searchAiApp, {
		fields: [searchAiPluginConfigShopcada.appId],
		references: [searchAiApp.appId]
	}),
}));

export const searchAiQueryRelations = relations(searchAiQuery, ({one, many}) => ({
	searchAiApp: one(searchAiApp, {
		fields: [searchAiQuery.appId],
		references: [searchAiApp.appId]
	}),
	searchAiQueryResults: many(searchAiQueryResult),
}));

export const searchAiQueryResultRelations = relations(searchAiQueryResult, ({one}) => ({
	searchAiQuery: one(searchAiQuery, {
		fields: [searchAiQueryResult.queryId],
		references: [searchAiQuery.queryId]
	}),
}));

export const searchAiUsageSummaryRelations = relations(searchAiUsageSummary, ({one}) => ({
	searchAiApp: one(searchAiApp, {
		fields: [searchAiUsageSummary.appId],
		references: [searchAiApp.appId]
	}),
}));

export const searchAiVectorRelations = relations(searchAiVector, ({one}) => ({
	searchAiApp: one(searchAiApp, {
		fields: [searchAiVector.appId],
		references: [searchAiApp.appId]
	}),
}));