import { type Infer, v } from "convex/values";
import { asyncMap } from "convex-helpers";
import { getManyFrom, getOneFrom } from "convex-helpers/server/relationships";
import { ChannelType } from "discord-api-types/v10";
import { Array as Arr, Predicate } from "effect";
import type { MutationCtx, QueryCtx } from "../client";
import { channelSchema, channelSettingsSchema } from "../schema";
import { enrichMessages } from "../shared/dataAccess";
import {
	getChannelWithSettings,
	getFirstMessagesInChannels,
} from "../shared/shared";
import { publicQuery } from "./custom_functions";

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

export const getChannelPageData = publicQuery({
	args: {
		serverDiscordId: v.string(),
		channelDiscordId: v.string(),
	},
	handler: async (ctx, args) => {
		const serverDiscordId = BigInt(args.serverDiscordId);
		const channelDiscordId = BigInt(args.channelDiscordId);

		const server = await getOneFrom(
			ctx.db,
			"servers",
			"by_discordId",
			serverDiscordId,
		);

		if (!server) return null;

		const [channel, allChannels, threads] = await Promise.all([
			getChannelWithSettings(ctx, channelDiscordId),
			getManyFrom(ctx.db, "channels", "by_serverId", server.discordId),
			getManyFrom(ctx.db, "channels", "by_parentId", channelDiscordId),
		]);

		if (!channel || channel.serverId !== server.discordId) return null;

		const ROOT_CHANNEL_TYPES = [
			ChannelType.AnnouncementThread,
			ChannelType.PublicThread,
			ChannelType.PrivateThread,
			ChannelType.GuildStageVoice,
			ChannelType.GuildForum,
		] as const;
		const rootChannels = allChannels.filter((c) =>
			ROOT_CHANNEL_TYPES.includes(
				c.type as (typeof ROOT_CHANNEL_TYPES)[number],
			),
		);

		const channelIds = rootChannels.map((c) => c.id);
		const allSettings = await asyncMap(channelIds, (id) =>
			getOneFrom(ctx.db, "channelSettings", "by_channelId", id),
		);

		const indexedChannels = rootChannels
			.map((c, idx) => ({
				...c,
				flags: allSettings[idx] ?? {
					...DEFAULT_CHANNEL_SETTINGS,
					channelId: c.id,
				},
			}))
			.filter((c) => c.flags.indexingEnabled)
			.sort((a, b) => {
				if (a.type === ChannelType.GuildForum) return -1;
				if (b.type === ChannelType.GuildForum) return 1;
				if (a.type === ChannelType.GuildAnnouncement) return -1;
				if (b.type === ChannelType.GuildAnnouncement) return 1;
				return 0;
			})
			.map((c) => {
				const { flags: _flags, ...chan } = c;
				return chan;
			});

		const sortedThreads = threads
			.sort((a, b) => {
				return BigInt(b.id) > BigInt(a.id)
					? 1
					: BigInt(b.id) < BigInt(a.id)
						? -1
						: 0;
			})
			.slice(0, 50);

		const threadIds = sortedThreads.map((t) => t.id);
		const firstMessages = await getFirstMessagesInChannels(ctx, threadIds);

		const messages = Arr.filter(
			Arr.map(
				sortedThreads,
				(thread) => firstMessages[thread.id.toString()] ?? null,
			),
			Predicate.isNotNull,
		);

		const enrichedMessages = await enrichMessages(ctx, messages);

		const enrichedMessagesMap = new Map(
			enrichedMessages.map((em) => [em.message.id, em]),
		);

		const threadsWithMessages = Arr.filter(
			Arr.map(sortedThreads, (thread) => {
				const message = firstMessages[thread.id.toString()];
				if (!message) return null;
				const enrichedMessage = enrichedMessagesMap.get(message.id);
				if (!enrichedMessage) return null;
				return {
					thread,
					message: enrichedMessage,
				};
			}),
			Predicate.isNotNull,
		);

		return {
			server: {
				...server,
				channels: indexedChannels,
			},
			channels: indexedChannels,
			selectedChannel: channel,
			threads: threadsWithMessages,
		};
	},
});
