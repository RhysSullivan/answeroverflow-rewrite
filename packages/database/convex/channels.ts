import { type Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { channelSchema, channelSettingsSchema } from "./schema";

type Channel = Infer<typeof channelSchema>;
type ChannelSettings = Infer<typeof channelSettingsSchema>;

export const getChannelByDiscordId = query({
	args: {
		discordId: v.string(),
	},
	handler: async (ctx, args) => {
		const channel = await ctx.db
			.query("channels")
			.filter((q) => q.eq(q.field("id"), args.discordId))
			.first();

		if (!channel) {
			return null;
		}

		const settings = await ctx.db
			.query("channelSettings")
			.filter((q) => q.eq(q.field("channelId"), args.discordId))
			.first();

		const defaultSettings: ChannelSettings = {
			channelId: args.discordId,
			indexingEnabled: false,
			markSolutionEnabled: false,
			sendMarkSolutionInstructionsInNewThreads: false,
			autoThreadEnabled: false,
			forumGuidelinesConsentEnabled: false,
		};

		return {
			...channel,
			flags: settings ?? defaultSettings,
		};
	},
});

// Mutation for inserting/updating channel with settings
export const upsertChannelWithSettings = mutation({
	args: {
		channel: channelSchema,
		settings: v.optional(channelSettingsSchema),
	},
	handler: async (ctx, args) => {
		// Upsert channel
		const existingChannel = await ctx.db
			.query("channels")
			.filter((q) => q.eq(q.field("id"), args.channel.id))
			.first();

		if (existingChannel) {
			await ctx.db.patch(existingChannel._id, args.channel);
		} else {
			await ctx.db.insert("channels", args.channel);
		}

		// Upsert settings if provided
		if (args.settings) {
			const existingSettings = await ctx.db
				.query("channelSettings")
				.filter((q) => q.eq(q.field("channelId"), args.channel.id))
				.first();

			if (existingSettings) {
				await ctx.db.patch(existingSettings._id, args.settings);
			} else {
				await ctx.db.insert("channelSettings", args.settings);
			}
		}

		return args.channel.id;
	},
});
