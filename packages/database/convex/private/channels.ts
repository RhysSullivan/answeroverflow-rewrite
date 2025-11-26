import { type Infer, v } from "convex/values";
import { asyncMap } from "convex-helpers";
import { getManyFrom, getOneFrom } from "convex-helpers/server/relationships";
import {
	type MutationCtx,
	privateMutation,
	privateQuery,
	type QueryCtx,
} from "../client";
import { channelSchema, channelSettingsSchema } from "../schema";
import {
	deleteChannelInternalLogic,
	getChannelWithSettings,
} from "../shared/shared";

type Channel = Infer<typeof channelSchema>;
type ChannelSettings = Infer<typeof channelSettingsSchema>;

const DEFAULT_CHANNEL_SETTINGS: ChannelSettings = {
	channelId: 0n,
	indexingEnabled: false,
	markSolutionEnabled: false,
	sendMarkSolutionInstructionsInNewThreads: false,
	autoThreadEnabled: false,
	forumGuidelinesConsentEnabled: false,
};

async function addSettingsToChannels(
	ctx: QueryCtx | MutationCtx,
	channels: Channel[],
): Promise<Array<Channel & { flags: ChannelSettings }>> {
	if (channels.length === 0) return [];

	const channelIds = channels.map((c) => c.id);
	const allSettings = await asyncMap(channelIds, (id) =>
		getOneFrom(ctx.db, "channelSettings", "by_channelId", id),
	);

	return channels.map((channel, idx) => ({
		...channel,
		flags: allSettings[idx] ?? {
			...DEFAULT_CHANNEL_SETTINGS,
			channelId: channel.id,
		},
	}));
}

export const findChannelByInviteCode = privateQuery({
	args: {
		inviteCode: v.string(),
	},
	handler: async (ctx, args) => {
		const channel = await ctx.db
			.query("channels")
			.filter((q) => q.eq(q.field("inviteCode"), args.inviteCode))
			.first();

		if (!channel) {
			return null;
		}

		return await getChannelWithSettings(ctx, channel.id);
	},
});

export const findChannelByDiscordId = privateQuery({
	args: {
		discordId: v.int64(),
	},
	handler: async (ctx, args) => {
		return await getChannelWithSettings(ctx, args.discordId);
	},
});

export const findAllChannelsByServerId = privateQuery({
	args: {
		serverId: v.int64(),
	},
	handler: async (ctx, args) => {
		const channels = await getManyFrom(
			ctx.db,
			"channels",
			"by_serverId",
			args.serverId,
		);

		return await addSettingsToChannels(ctx, channels);
	},
});

export const updateChannel = privateMutation({
	args: {
		id: v.int64(),
		channel: channelSchema,
		settings: v.optional(channelSettingsSchema),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("channels")
			.filter((q) => q.eq(q.field("id"), args.id))
			.first();

		if (!existing) {
			throw new Error(`Channel with id ${args.id} not found`);
		}

		await ctx.db.replace(existing._id, {
			...args.channel,
			_id: existing._id,
			_creationTime: existing._creationTime,
		});

		if (args.settings) {
			const existingSettings = await getOneFrom(
				ctx.db,
				"channelSettings",
				"by_channelId",
				args.id,
			);

			if (existingSettings) {
				await ctx.db.patch(existingSettings._id, args.settings);
			} else {
				await ctx.db.insert("channelSettings", args.settings);
			}
		}

		return args.id;
	},
});

export const updateManyChannels = privateMutation({
	args: {
		channels: v.array(channelSchema),
	},
	handler: async (ctx, args) => {
		const ids: bigint[] = [];
		for (const channel of args.channels) {
			const existing = await ctx.db
				.query("channels")
				.filter((q) => q.eq(q.field("id"), channel.id))
				.first();

			if (existing) {
				await ctx.db.patch(existing._id, channel);
			} else {
				await ctx.db.insert("channels", channel);
			}
			ids.push(channel.id);
		}
		return ids;
	},
});

export const deleteChannel = privateMutation({
	args: {
		id: v.int64(),
	},
	handler: async (ctx, args) => {
		await deleteChannelInternalLogic(ctx, args.id);
		return null;
	},
});

export const upsertManyChannels = privateMutation({
	args: {
		channels: v.array(
			v.object({
				create: channelSchema,
				update: v.optional(channelSchema),
				settings: v.optional(channelSettingsSchema),
			}),
		),
	},
	handler: async (ctx, args) => {
		const ids: bigint[] = [];

		const existingChannels = await Promise.all(
			args.channels.map((item) =>
				ctx.db
					.query("channels")
					.filter((q) => q.eq(q.field("id"), item.create.id))
					.first(),
			),
		);

		for (let i = 0; i < args.channels.length; i++) {
			const item = args.channels[i];
			if (!item) continue;

			const existing = existingChannels[i];

			if (existing) {
				const updateData = item.update ?? item.create;
				await ctx.db.patch(existing._id, updateData);

				if (item.settings) {
					const existingSettings = await getOneFrom(
						ctx.db,
						"channelSettings",
						"by_channelId",
						item.create.id,
					);

					if (existingSettings) {
						await ctx.db.patch(existingSettings._id, item.settings);
					} else {
						await ctx.db.insert("channelSettings", item.settings);
					}
				}
			} else {
				await ctx.db.insert("channels", item.create);
				if (item.settings) {
					const existingSettings = await getOneFrom(
						ctx.db,
						"channelSettings",
						"by_channelId",
						item.create.id,
					);

					if (!existingSettings) {
						await ctx.db.insert("channelSettings", item.settings);
					} else {
						await ctx.db.patch(existingSettings._id, item.settings);
					}
				}
			}

			ids.push(item.create.id);
		}

		return ids;
	},
});

export const upsertChannelWithSettings = privateMutation({
	args: {
		channel: channelSchema,
		settings: v.optional(channelSettingsSchema),
	},
	handler: async (ctx, args) => {
		const existingChannel = await ctx.db
			.query("channels")
			.filter((q) => q.eq(q.field("id"), args.channel.id))
			.first();

		if (existingChannel) {
			await ctx.db.patch(existingChannel._id, args.channel);
		} else {
			await ctx.db.insert("channels", args.channel);
		}

		if (args.settings) {
			const existingSettings = await getOneFrom(
				ctx.db,
				"channelSettings",
				"by_channelId",
				args.channel.id,
			);

			if (existingSettings) {
				await ctx.db.patch(existingSettings._id, args.settings);
			} else {
				await ctx.db.insert("channelSettings", args.settings);
			}
		}

		return args.channel.id;
	},
});
