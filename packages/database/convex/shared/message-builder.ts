import { asyncMap } from "convex-helpers";
import type { QueryCtx, MutationCtx } from "../client";
import type { Id } from "../_generated/dataModel";
import type { Message } from "../schema";
import type { SanitizedAuthor, SanitizedMessage } from "./visibility";
import {
	extractDiscordLinks,
	extractMentionIds,
	findAttachmentsByMessageId,
	findReactionsByMessageId,
	findSolutionsByQuestionId,
	getInternalLinksMetadata,
	getMentionMetadata,
} from "./shared";

type MessageMetadata = {
	users?: Record<
		string,
		{ username: string; globalName: string | null; url: string }
	>;
	channels?: Record<
		string,
		{
			name: string;
			type: number;
			url: string;
			indexingEnabled?: boolean;
			exists?: boolean;
		}
	>;
	internalLinks?: Array<{
		original: string;
		guild: { id: string; name: string };
		channel: {
			parent?: { name?: string; type?: number; parentId?: string };
			id: string;
			type: number;
			name: string;
		};
		message?: string;
	}>;
};

type MessageWithFullData = {
	message: SanitizedMessage;
	author: SanitizedAuthor | null;
	attachments: Awaited<ReturnType<typeof findAttachmentsByMessageId>>;
	reactions: Awaited<ReturnType<typeof findReactionsByMessageId>>;
	solutions: Awaited<ReturnType<typeof findSolutionsByQuestionId>>;
	metadata?: MessageMetadata;
};

function createInternalLinkLookup(
	internalLinks: Awaited<ReturnType<typeof getInternalLinksMetadata>>,
): Map<string, Awaited<ReturnType<typeof getInternalLinksMetadata>>[number]> {
	const lookup = new Map();
	for (const link of internalLinks) {
		if (!lookup.has(link.original)) {
			lookup.set(link.original, link);
		}
	}
	return lookup;
}

function buildMessageMetadataRecord(
	mentionMetadata: Awaited<ReturnType<typeof getMentionMetadata>>,
	serverDiscordId: string,
	mentionIds: ReturnType<typeof extractMentionIds>,
	internalLinkLookup: Map<
		string,
		Awaited<ReturnType<typeof getInternalLinksMetadata>>[number]
	>,
	messageDiscordLinks: ReturnType<typeof extractDiscordLinks>,
): MessageMetadata {
	const users: Awaited<ReturnType<typeof getMentionMetadata>>["users"] = {};
	for (const userId of mentionIds.userIds) {
		const user = mentionMetadata.users[userId];
		if (user) {
			users[userId] = user;
		}
	}

	const channels: Awaited<ReturnType<typeof getMentionMetadata>>["channels"] = {};
	for (const channelId of mentionIds.channelIds) {
		const channelMeta = mentionMetadata.channels[channelId];
		if (channelMeta) {
			channels[channelId] = channelMeta;
		} else {
			channels[channelId] = {
				name: "Unknown Channel",
				type: 0,
				url: `https://discord.com/channels/${serverDiscordId}/${channelId}`,
				indexingEnabled: false,
				exists: false,
			};
		}
	}

	const internalLinks: Array<
		Awaited<ReturnType<typeof getInternalLinksMetadata>>[number]
	> = [];
	for (const link of messageDiscordLinks) {
		const metadata = internalLinkLookup.get(link.original);
		if (metadata) {
			internalLinks.push(metadata);
		}
	}

	return {
		users: Object.keys(users).length === 0 ? undefined : users,
		channels: Object.keys(channels).length === 0 ? undefined : channels,
		internalLinks: internalLinks.length === 0 ? undefined : internalLinks,
	};
}

export async function buildMessagesWithFullData(
	ctx: QueryCtx | MutationCtx,
	sanitizedMessages: Array<{ message: SanitizedMessage; author: SanitizedAuthor | null }>,
	serverDiscordIdMap: Map<Id<"servers">, string>,
): Promise<MessageWithFullData[]> {
	if (sanitizedMessages.length === 0) {
		return [];
	}

	const allUserIds = new Set<string>();
	const allChannelIds = new Set<string>();
	const allDiscordLinks: Array<{
		original: string;
		guildId: string;
		channelId: string;
		messageId?: string;
	}> = [];

	for (const { message } of sanitizedMessages) {
		const { userIds, channelIds } = extractMentionIds(message.content);
		for (const userId of userIds) {
			allUserIds.add(userId);
		}
		for (const channelId of channelIds) {
			allChannelIds.add(channelId);
		}
		const discordLinks = extractDiscordLinks(message.content);
		allDiscordLinks.push(...discordLinks);
	}

	const messagesByServer = new Map<string, typeof sanitizedMessages>();
	for (const sm of sanitizedMessages) {
		const serverId = sm.message.serverId;
		const serverDiscordId = serverDiscordIdMap.get(serverId);
		if (serverDiscordId) {
			if (!messagesByServer.has(serverDiscordId)) {
				messagesByServer.set(serverDiscordId, []);
			}
			messagesByServer.get(serverDiscordId)!.push(sm);
		}
	}

	const [mentionMetadataByServer, internalLinks] = await Promise.all([
		Promise.all(
			Array.from(messagesByServer.entries()).map(async ([serverDiscordId, msgs]) => {
				const serverUserIds = new Set<string>();
				const serverChannelIds = new Set<string>();

				for (const { message } of msgs) {
					const { userIds, channelIds } = extractMentionIds(message.content);
					for (const userId of userIds) {
						serverUserIds.add(userId);
					}
					for (const channelId of channelIds) {
						serverChannelIds.add(channelId);
					}
				}

				const metadata = await getMentionMetadata(
					ctx,
					Array.from(serverUserIds),
					Array.from(serverChannelIds),
					serverDiscordId,
				);
				return [serverDiscordId, metadata] as const;
			}),
		),
		getInternalLinksMetadata(ctx, allDiscordLinks),
	]);

	const mentionMetadataMap = new Map(mentionMetadataByServer);
	const internalLinkLookup = createInternalLinkLookup(internalLinks);

	return await asyncMap(
		sanitizedMessages,
		async ({ message, author }) => {
			const serverDiscordId = serverDiscordIdMap.get(message.serverId);
			const mentionIds = extractMentionIds(message.content);
			const messageDiscordLinks = extractDiscordLinks(message.content);

			let metadata: MessageMetadata | undefined;
			if (serverDiscordId) {
				const mentionMetadata = mentionMetadataMap.get(serverDiscordId);
				if (mentionMetadata) {
					metadata = buildMessageMetadataRecord(
						mentionMetadata,
						serverDiscordId,
						mentionIds,
						internalLinkLookup,
						messageDiscordLinks,
					);
				}
			}

			const [attachments, reactions, solutions] = await Promise.all([
				findAttachmentsByMessageId(ctx, message.id),
				findReactionsByMessageId(ctx, message.id),
				message.questionId
					? findSolutionsByQuestionId(ctx, message.questionId)
					: [],
			]);

			return {
				message,
				author,
				attachments,
				reactions,
				solutions,
				metadata,
			};
		},
	);
}
