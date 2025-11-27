import { v } from "convex/values";
import { internalMutation } from "../client";
import {
	attachmentSchema,
	channelSchema,
	channelSettingsSchema,
	discordAccountSchema,
	emojiSchema,
	messageSchema,
	serverSchema,
	userServerSettingsSchema,
} from "../schema";

// Server preferences schema (not exported from schema.ts)
const serverPreferencesSchema = v.object({
	serverId: v.int64(),
	readTheRulesConsentEnabled: v.optional(v.boolean()),
	considerAllMessagesPublicEnabled: v.optional(v.boolean()),
	anonymizeMessagesEnabled: v.optional(v.boolean()),
	customDomain: v.optional(v.string()),
	subpath: v.optional(v.string()),
});

/**
 * Test-only mutation to insert a server directly into the database.
 * Use this in tests to bypass business logic and quickly set up test data.
 */
export const testOnlyInsertServer = internalMutation({
	args: { server: serverSchema },
	handler: async (ctx, args) => {
		return await ctx.db.insert("servers", args.server);
	},
});

/**
 * Test-only mutation to insert server preferences.
 */
export const testOnlyInsertServerPreferences = internalMutation({
	args: { preferences: serverPreferencesSchema },
	handler: async (ctx, args) => {
		return await ctx.db.insert("serverPreferences", args.preferences);
	},
});

/**
 * Test-only mutation to insert a channel directly into the database.
 */
export const testOnlyInsertChannel = internalMutation({
	args: { channel: channelSchema },
	handler: async (ctx, args) => {
		return await ctx.db.insert("channels", args.channel);
	},
});

/**
 * Test-only mutation to insert channel settings.
 */
export const testOnlyInsertChannelSettings = internalMutation({
	args: { settings: channelSettingsSchema },
	handler: async (ctx, args) => {
		return await ctx.db.insert("channelSettings", args.settings);
	},
});

/**
 * Test-only mutation to insert a discord account.
 */
export const testOnlyInsertDiscordAccount = internalMutation({
	args: { account: discordAccountSchema },
	handler: async (ctx, args) => {
		return await ctx.db.insert("discordAccounts", args.account);
	},
});

/**
 * Test-only mutation to insert user server settings.
 */
export const testOnlyInsertUserServerSettings = internalMutation({
	args: { settings: userServerSettingsSchema },
	handler: async (ctx, args) => {
		return await ctx.db.insert("userServerSettings", args.settings);
	},
});

/**
 * Test-only mutation to insert a message with optional attachments and reactions.
 */
export const testOnlyInsertMessage = internalMutation({
	args: {
		message: messageSchema,
		attachments: v.optional(v.array(attachmentSchema)),
		reactions: v.optional(
			v.array(
				v.object({
					userId: v.int64(),
					emoji: emojiSchema,
				}),
			),
		),
	},
	handler: async (ctx, args) => {
		const messageId = await ctx.db.insert("messages", args.message);

		if (args.attachments) {
			for (const attachment of args.attachments) {
				await ctx.db.insert("attachments", attachment);
			}
		}

		if (args.reactions) {
			// Insert emojis first
			const emojiSet = new Set<bigint>();
			for (const reaction of args.reactions) {
				if (!emojiSet.has(reaction.emoji.id)) {
					emojiSet.add(reaction.emoji.id);
					await ctx.db.insert("emojis", reaction.emoji);
				}
			}

			// Insert reactions
			for (const reaction of args.reactions) {
				await ctx.db.insert("reactions", {
					messageId: args.message.id,
					userId: reaction.userId,
					emojiId: reaction.emoji.id,
				});
			}
		}

		return messageId;
	},
});

/**
 * Test-only mutation to clear all data from a table.
 */
export const testOnlyClearTable = internalMutation({
	args: {
		table: v.union(
			v.literal("servers"),
			v.literal("serverPreferences"),
			v.literal("channels"),
			v.literal("channelSettings"),
			v.literal("discordAccounts"),
			v.literal("userServerSettings"),
			v.literal("messages"),
			v.literal("attachments"),
			v.literal("reactions"),
			v.literal("emojis"),
			v.literal("ignoredDiscordAccounts"),
			v.literal("anonymousSessions"),
		),
	},
	handler: async (ctx, args) => {
		const docs = await ctx.db.query(args.table).collect();
		for (const doc of docs) {
			await ctx.db.delete(doc._id);
		}
		return docs.length;
	},
});

/**
 * Test-only mutation to clear all test data from the database.
 */
export const testOnlyClearAllData = internalMutation({
	args: {},
	handler: async (ctx) => {
		const tables = [
			"reactions",
			"attachments",
			"messages",
			"emojis",
			"userServerSettings",
			"channelSettings",
			"channels",
			"serverPreferences",
			"servers",
			"discordAccounts",
			"ignoredDiscordAccounts",
			"anonymousSessions",
		] as const;

		let totalDeleted = 0;
		for (const table of tables) {
			const docs = await ctx.db.query(table).collect();
			for (const doc of docs) {
				await ctx.db.delete(doc._id);
			}
			totalDeleted += docs.length;
		}

		return totalDeleted;
	},
});
