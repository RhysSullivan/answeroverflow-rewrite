import { type Infer, v } from "convex/values";
import { getOneFrom } from "convex-helpers/server/relationships";
import { messageSchema } from "../schema";
import { enrichMessages } from "../shared/dataAccess";
import {
	compareIds,
	findMessagesByChannelId,
	getChannelWithSettings,
	getMessageById as getMessageByIdShared,
} from "../shared/shared";
import { publicQuery } from "./custom_functions";

type Message = Infer<typeof messageSchema>;

function getThreadIdOfMessage(
	message: Pick<Message, "channelId"> &
		Partial<Pick<Message, "childThreadId" | "parentChannelId">>,
): bigint | null {
	if (message.childThreadId) {
		return message.childThreadId;
	}
	if (message.parentChannelId) {
		return message.channelId;
	}
	return null;
}

function getParentChannelOfMessage(
	message: Pick<Message, "channelId"> &
		Partial<Pick<Message, "parentChannelId">>,
): bigint {
	return message.parentChannelId ?? message.channelId;
}

function selectMessagesForDisplay(
	messages: Array<Message>,
	threadId: bigint | null,
	targetMessageId: bigint,
) {
	if (threadId) {
		return messages;
	}

	return messages.filter(
		(message) => compareIds(message.id, targetMessageId) >= 0,
	);
}

export const getMessageById = publicQuery({
	args: {
		id: v.string(),
	},
	handler: async (ctx, args) => {
		return await getMessageByIdShared(ctx, BigInt(args.id));
	},
});

export const getMessagePageData = publicQuery({
	args: {
		messageId: v.string(),
	},
	handler: async (ctx, args) => {
		const targetMessage = await getMessageByIdShared(
			ctx,
			BigInt(args.messageId),
		);

		if (!targetMessage) {
			return null;
		}

		const threadId = getThreadIdOfMessage(targetMessage);
		const parentId = getParentChannelOfMessage(targetMessage);
		const channelId = threadId ?? parentId;
		const channel = await getChannelWithSettings(ctx, channelId);

		if (!channel) {
			return null;
		}

		const thread = threadId
			? await getOneFrom(
					ctx.db,
					"channels",
					"by_discordChannelId",
					threadId,
					"id",
				)
			: null;

		let allMessages = await findMessagesByChannelId(
			ctx,
			channelId,
			threadId ? undefined : 50,
		);

		if (threadId) {
			const threadStarterMessages = await ctx.db
				.query("messages")
				.withIndex("by_channelId", (q) => q.eq("channelId", parentId))
				.filter((q) => q.eq(q.field("childThreadId"), threadId))
				.collect();

			const existingIds = new Set(allMessages.map((m) => m.id));
			const newMessages = threadStarterMessages.filter(
				(m) => !existingIds.has(m.id),
			);
			allMessages = [...allMessages, ...newMessages].sort((a, b) =>
				compareIds(a.id, b.id),
			);
		}

		const messagesToShow = selectMessagesForDisplay(
			allMessages,
			threadId,
			targetMessage.id,
		);

		const [enrichedMessages, server] = await Promise.all([
			enrichMessages(ctx, messagesToShow),
			getOneFrom(
				ctx.db,
				"servers",
				"by_discordId",
				targetMessage.serverId,
				"discordId",
			),
		]);

		if (enrichedMessages.length === 0 || !server) {
			return null;
		}

		const serverPreferences = server.preferencesId
			? await ctx.db.get(server.preferencesId)
			: null;

		return {
			messages: enrichedMessages,
			server: {
				_id: server._id,
				discordId: server.discordId,
				name: server.name,
				icon: server.icon,
				description: server.description,
				approximateMemberCount: server.approximateMemberCount,
				customDomain: serverPreferences?.customDomain,
				subpath: serverPreferences?.subpath,
				vanityInviteCode: server.vanityInviteCode,
			},
			channel: {
				id: channel.id,
				name: channel.name,
				type: channel.type,
				inviteCode: channel.inviteCode,
			},
			thread,
		};
	},
});
