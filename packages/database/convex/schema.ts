import { defineSchema, defineTable } from "convex/server";
import { type Infer, v } from "convex/values";

const serverPreferencesSchema = v.object({
	serverId: v.id("servers"),
	readTheRulesConsentEnabled: v.optional(v.boolean()),
	considerAllMessagesPublicEnabled: v.optional(v.boolean()),
	anonymizeMessagesEnabled: v.optional(v.boolean()),
	customDomain: v.optional(v.string()),
	subpath: v.optional(v.string()),
});

export const serverSchema = v.object({
	discordId: v.string(),
	name: v.string(),
	icon: v.optional(v.string()),
	description: v.optional(v.string()),
	vanityInviteCode: v.optional(v.string()),
	kickedTime: v.optional(v.number()),
	vanityUrl: v.optional(v.string()),
	stripeCustomerId: v.optional(v.string()),
	stripeSubscriptionId: v.optional(v.string()),
	plan: v.union(
		v.literal("FREE"),
		v.literal("STARTER"),
		v.literal("ADVANCED"),
		v.literal("PRO"),
		v.literal("ENTERPRISE"),
		v.literal("OPEN_SOURCE"),
	),
	approximateMemberCount: v.number(),
	preferencesId: v.optional(v.id("serverPreferences")),
});

export const userServerSettings = v.object({
	serverId: v.id("servers"),
	userId: v.id("users"),
	permissions: v.number(),
	canPubliclyDisplayMessages: v.boolean(),
	messageIndexingDisabled: v.boolean(),
});

export const channelSchema = v.object({
	id: v.string(),
	serverId: v.id("servers"),
	name: v.string(),
	type: v.number(),
	parentId: v.optional(v.string()),
	inviteCode: v.optional(v.string()),
	archivedTimestamp: v.optional(v.number()),
	solutionTagId: v.optional(v.string()),
	lastIndexedSnowflake: v.optional(v.string()),
});

export const channelSettingsSchema = v.object({
	channelId: v.string(),
	indexingEnabled: v.boolean(),
	markSolutionEnabled: v.boolean(),
	sendMarkSolutionInstructionsInNewThreads: v.boolean(),
	autoThreadEnabled: v.boolean(),
	forumGuidelinesConsentEnabled: v.boolean(),
});

export type Server = Infer<typeof serverSchema>;
export type Channel = Infer<typeof channelSchema>;
export type ChannelSettings = Infer<typeof channelSettingsSchema>;

export default defineSchema({
	servers: defineTable(serverSchema),
	serverPreferences: defineTable(serverPreferencesSchema),
	channels: defineTable(channelSchema),
	channelSettings: defineTable(channelSettingsSchema),
});
