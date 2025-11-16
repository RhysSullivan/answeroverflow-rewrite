import type { PaginationOptions } from "convex/server";
import type { Infer } from "convex/values";
import { asyncMap } from "convex-helpers";
import { getManyFrom } from "convex-helpers/server/relationships";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../client";
import {
	extractDiscordLinks,
	extractMentionIds,
	findAttachmentsByMessageId,
	findMessagesByChannelId,
	findReactionsByMessageId,
	findSolutionsByQuestionId,
	getDiscordAccountById,
	getInternalLinksMetadata,
	getMentionMetadata,
} from "./shared";
import { attachmentSchema, messageSchema } from "../schema";

type Message = Infer<typeof messageSchema>;
type Attachment = Infer<typeof attachmentSchema>;

type MentionMetadataResult = Awaited<ReturnType<typeof getMentionMetadata>>;
type InternalLinkMetadata = Awaited<
	ReturnType<typeof getInternalLinksMetadata>
>;

type DiscordLinkReference = ReturnType<typeof extractDiscordLinks>[number];
type AuthorRecord = NonNullable<
	Awaited<ReturnType<typeof getDiscordAccountById>>
>;

type MessageMetadata = {
	users?: MentionMetadataResult["users"];
	channels?: MentionMetadataResult["channels"];
	internalLinks?: InternalLinkMetadata;
};

export type MessageWithRelations = {
	message: Message;
	author: { id: string; name: string; avatar: string | null } | null;
	attachments: Attachment[];
	reactions: Awaited<ReturnType<typeof findReactionsByMessageId>>;
	solutions: Awaited<ReturnType<typeof findSolutionsByQuestionId>>;
	metadata?: MessageMetadata;
};

type MessageReferenceTargets = Map<
	Id<"servers">,
	{
		userIds: Set<string>;
		channelIds: Set<string>;
	}
>;

type ServerMapValue = Doc<"servers">;

type SearchMessagesArgs = {
	type: "search";
	query: string;
	pagination: PaginationOptions;
	pageSize?: number;
};

type ProvidedMessagesArgs = {
	type: "messages";
	messages: Message[];
};

type ChannelMessagesArgs = {
	type: "channel";
	channelId: string;
	limit?: number;
	after?: string;
};

type ThreadMessagesArgs = {
	type: "thread";
	threadId: string;
	limit?: number;
	after?: string;
};

type ParentChannelMessagesArgs = {
	type: "parentChannel";
	parentChannelId: string;
	limit?: number;
};

type ServerMessagesArgs = {
	type: "server";
	serverId: Id<"servers">;
	limit?: number;
};

type MessageIdsArgs = {
	type: "ids";
	ids: string[];
};

type GetMessagesArgs =
	| SearchMessagesArgs
	| ProvidedMessagesArgs
	| ChannelMessagesArgs
	| ThreadMessagesArgs
	| ParentChannelMessagesArgs
	| ServerMessagesArgs
	| MessageIdsArgs;

export type PaginatedMessagesResult = {
	page: MessageWithRelations[];
	isDone: boolean;
	continueCursor: string | null;
};

function collectMessageReferenceTargets(
	messages: Array<Message>,
): {
	referenceTargets: MessageReferenceTargets;
	discordLinks: Array<DiscordLinkReference>;
} {
	const referenceTargets = new Map<
		Id<"servers">,
		{ userIds: Set<string>; channelIds: Set<string> }
	>();
	const discordLinks: Array<DiscordLinkReference> = [];

	for (const message of messages) {
		const mentionIds = extractMentionIds(message.content);
		const entry =
			referenceTargets.get(message.serverId) ??
			({ userIds: new Set<string>(), channelIds: new Set<string>() });
		for (const userId of mentionIds.userIds) {
			entry.userIds.add(userId);
		}
		for (const channelId of mentionIds.channelIds) {
			entry.channelIds.add(channelId);
		}
		referenceTargets.set(message.serverId, entry);
		discordLinks.push(...extractDiscordLinks(message.content));
	}

	return { referenceTargets, discordLinks };
}

async function buildAuthorMap(
	ctx: QueryCtx | MutationCtx,
	messages: Array<Message>,
): Promise<Map<string, AuthorRecord>> {
	const uniqueAuthorIds = Array.from(
		new Set(messages.map((message) => message.authorId)),
	);
	const authors = await asyncMap(uniqueAuthorIds, (id) =>
		getDiscordAccountById(ctx, id),
	);
	const map = new Map<string, AuthorRecord>();
	for (let i = 0; i < uniqueAuthorIds.length; i++) {
		const author = authors[i];
		const authorId = uniqueAuthorIds[i];
		if (author && authorId) {
			map.set(authorId, author);
		}
	}
	return map;
}

function createInternalLinkLookup(
	internalLinks: InternalLinkMetadata,
): Map<string, InternalLinkMetadata[number]> {
	const lookup = new Map<string, InternalLinkMetadata[number]>();
	for (const link of internalLinks) {
		if (!lookup.has(link.original)) {
			lookup.set(link.original, link);
		}
	}
	return lookup;
}

function buildMessageMetadataRecord(
	mentionMetadata: MentionMetadataResult,
	serverDiscordId: string,
	mentionIds: ReturnType<typeof extractMentionIds>,
	internalLinkLookup: Map<string, InternalLinkMetadata[number]>,
	messageDiscordLinks: Array<DiscordLinkReference>,
): MessageMetadata | undefined {
	const users: MentionMetadataResult["users"] = {};
	for (const userId of mentionIds.userIds) {
		const user = mentionMetadata.users[userId];
		if (user) {
			users[userId] = user;
		}
	}

	const channels: MentionMetadataResult["channels"] = {};
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

	const internalLinks: Array<InternalLinkMetadata[number]> = [];
	for (const link of messageDiscordLinks) {
		const metadata = internalLinkLookup.get(link.original);
		if (metadata) {
			internalLinks.push(metadata);
		}
	}

	if (
		Object.keys(users).length === 0 &&
		Object.keys(channels).length === 0 &&
		internalLinks.length === 0
	) {
		return undefined;
	}

	return {
		users: Object.keys(users).length === 0 ? undefined : users,
		channels: Object.keys(channels).length === 0 ? undefined : channels,
		internalLinks: internalLinks.length === 0 ? undefined : internalLinks,
	};
}

async function getSolutionsForMessage(
	ctx: QueryCtx | MutationCtx,
	message: Message,
) {
	if (!message.questionId) {
		return [];
	}
	return await findSolutionsByQuestionId(ctx, message.questionId);
}

async function buildServerMap(
	ctx: QueryCtx | MutationCtx,
	messages: Array<Message>,
): Promise<Map<Id<"servers">, ServerMapValue>> {
	const uniqueServerIds = Array.from(
		new Set(messages.map((message) => message.serverId)),
	);
	const servers = await asyncMap(uniqueServerIds, (id) => ctx.db.get(id));
	const map = new Map<Id<"servers">, ServerMapValue>();
	for (let i = 0; i < uniqueServerIds.length; i++) {
		const server = servers[i];
		const serverId = uniqueServerIds[i];
		if (server && serverId) {
			map.set(serverId, server);
		}
	}
	return map;
}

async function buildMentionMetadataByServer(
	ctx: QueryCtx | MutationCtx,
	referenceTargets: MessageReferenceTargets,
	serverMap: Map<Id<"servers">, ServerMapValue>,
) {
	const metadata = new Map<Id<"servers">, MentionMetadataResult>();
	for (const [serverId, targets] of referenceTargets.entries()) {
		const server = serverMap.get(serverId);
		if (!server) {
			continue;
		}
		if (targets.userIds.size === 0 && targets.channelIds.size === 0) {
			continue;
		}
		const mentionMetadata = await getMentionMetadata(
			ctx,
			Array.from(targets.userIds),
			Array.from(targets.channelIds),
			server.discordId,
		);
		metadata.set(serverId, mentionMetadata);
	}
	return metadata;
}

async function buildMessagesWithRelations(
	ctx: QueryCtx | MutationCtx,
	messages: Array<Message>,
): Promise<Array<MessageWithRelations>> {
	if (messages.length === 0) {
		return [];
	}

	const authorMap = await buildAuthorMap(ctx, messages);
	const serverMap = await buildServerMap(ctx, messages);
	const { referenceTargets, discordLinks } =
		collectMessageReferenceTargets(messages);
	const [mentionMetadataByServer, internalLinks] = await Promise.all([
		buildMentionMetadataByServer(ctx, referenceTargets, serverMap),
		getInternalLinksMetadata(ctx, discordLinks),
	]);
	const internalLinkLookup = createInternalLinkLookup(internalLinks);

	return await asyncMap(messages, async (message) => {
		const mentionMetadata = mentionMetadataByServer.get(message.serverId);
		const server = serverMap.get(message.serverId);
		const mentionIds = extractMentionIds(message.content);
		const messageDiscordLinks = extractDiscordLinks(message.content);
		const metadata =
			mentionMetadata && server
				? buildMessageMetadataRecord(
						mentionMetadata,
						server.discordId,
						mentionIds,
						internalLinkLookup,
						messageDiscordLinks,
					)
				: undefined;

		const [attachments, reactions, solutions] = await Promise.all([
			findAttachmentsByMessageId(ctx, message.id),
			findReactionsByMessageId(ctx, message.id),
			getSolutionsForMessage(ctx, message),
		]);

		const author = authorMap.get(message.authorId) ?? null;

		return {
			message,
			author: author
				? {
						id: author.id,
						name: author.name,
						avatar: author.avatar,
					}
				: null,
			attachments,
			reactions,
			solutions,
			metadata,
		};
	});
}

async function getMessagesByParentChannelId(
	ctx: QueryCtx | MutationCtx,
	parentChannelId: string,
	limit?: number,
) {
	const messages = await getManyFrom(
		ctx.db,
		"messages",
		"by_parentChannelId",
		parentChannelId,
	);
	return messages.slice(0, limit ?? 100);
}

async function getMessagesByServerId(
	ctx: QueryCtx | MutationCtx,
	serverId: Id<"servers">,
	limit?: number,
) {
	const messages = await getManyFrom(
		ctx.db,
		"messages",
		"by_serverId",
		serverId,
	);
	return messages.slice(0, limit ?? 100);
}

async function getMessagesByIds(
	ctx: QueryCtx | MutationCtx,
	ids: string[],
) {
	if (ids.length === 0) {
		return [];
	}
	const docs = await asyncMap(ids, async (id) =>
		ctx.db
			.query("messages")
			.withIndex("by_messageId", (q) => q.eq("id", id))
			.first(),
	);
	return docs.filter((doc): doc is Message => doc !== null);
}

export function getMessages(
	ctx: QueryCtx | MutationCtx,
	args: SearchMessagesArgs,
): Promise<PaginatedMessagesResult>;
export function getMessages(
	ctx: QueryCtx | MutationCtx,
	args:
		| ProvidedMessagesArgs
		| ChannelMessagesArgs
		| ThreadMessagesArgs
		| ParentChannelMessagesArgs
		| ServerMessagesArgs
		| MessageIdsArgs,
): Promise<Array<MessageWithRelations>>;
export async function getMessages(
	ctx: QueryCtx | MutationCtx,
	args: GetMessagesArgs,
): Promise<
	PaginatedMessagesResult | Array<MessageWithRelations>
> {
	if (args.type === "search") {
		const cappedPagination = {
			...args.pagination,
			numItems: Math.min(args.pagination.numItems, args.pageSize ?? 10),
		};
		const paginatedResult = await ctx.db
			.query("messages")
			.withSearchIndex("search_content", (q) =>
				q.search("content", args.query),
			)
			.paginate(cappedPagination);
		const page = await buildMessagesWithRelations(ctx, paginatedResult.page);
		return {
			...paginatedResult,
			page,
		};
	}

	if (args.type === "messages") {
		return await buildMessagesWithRelations(ctx, args.messages);
	}

	let fetchedMessages: Array<Message> = [];
	if (args.type === "channel") {
		fetchedMessages = await findMessagesByChannelId(
			ctx,
			args.channelId,
			args.limit,
			args.after,
		);
	} else if (args.type === "thread") {
		fetchedMessages = await findMessagesByChannelId(
			ctx,
			args.threadId,
			args.limit,
			args.after,
		);
	} else if (args.type === "parentChannel") {
		fetchedMessages = await getMessagesByParentChannelId(
			ctx,
			args.parentChannelId,
			args.limit,
		);
	} else if (args.type === "server") {
		fetchedMessages = await getMessagesByServerId(
			ctx,
			args.serverId,
			args.limit,
		);
	} else if (args.type === "ids") {
		fetchedMessages = await getMessagesByIds(ctx, args.ids);
	}

	return await buildMessagesWithRelations(ctx, fetchedMessages);
}

export async function getMessage(
	ctx: QueryCtx | MutationCtx,
	id: string,
): Promise<MessageWithRelations | null> {
	const results = await getMessages(ctx, { type: "ids", ids: [id] });
	return results[0] ?? null;
}
