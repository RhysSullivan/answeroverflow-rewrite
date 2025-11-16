import type { QueryCtx, MutationCtx } from "../client";
import type { Id } from "../_generated/dataModel";
import type { DiscordAccount, Message } from "../schema";
import { getOneFrom } from "convex-helpers/server/relationships";
import { findUserServerSettingsById } from "./shared";

export type ServerVisibilityContext = {
	considerAllMessagesPublicEnabled: boolean;
	anonymizeMessagesEnabled: boolean;
};

export type UserVisibilityContext = {
	canPubliclyDisplayMessages: boolean;
};

export type VisibilityContext = {
	server: ServerVisibilityContext;
	user: UserVisibilityContext | null;
};

export type VisibleAuthor = {
	id: string;
	name: string;
	avatar: string | null;
	public: boolean;
};

export type AnonymousAuthor = {
	id: string;
	name: string;
	avatar: null;
	public: false;
};

export type SanitizedAuthor = VisibleAuthor | AnonymousAuthor;

export type SanitizedMessage = Message & {
	public: boolean;
};

export function computeServerVisibility(
	considerAllMessagesPublicEnabled: boolean | undefined,
	anonymizeMessagesEnabled: boolean | undefined,
): ServerVisibilityContext {
	return {
		considerAllMessagesPublicEnabled: considerAllMessagesPublicEnabled ?? false,
		anonymizeMessagesEnabled: anonymizeMessagesEnabled ?? false,
	};
}

export function computeUserVisibility(
	canPubliclyDisplayMessages: boolean | undefined,
): UserVisibilityContext | null {
	if (canPubliclyDisplayMessages === undefined) {
		return null;
	}
	return {
		canPubliclyDisplayMessages,
	};
}

export async function getServerVisibilityContext(
	ctx: QueryCtx | MutationCtx,
	serverId: Id<"servers">,
): Promise<ServerVisibilityContext> {
	const serverPreferences = await getOneFrom(
		ctx.db,
		"serverPreferences",
		"by_serverId",
		serverId,
	);

	return computeServerVisibility(
		serverPreferences?.considerAllMessagesPublicEnabled,
		serverPreferences?.anonymizeMessagesEnabled,
	);
}

export async function getVisibilityContext(
	ctx: QueryCtx | MutationCtx,
	serverId: Id<"servers">,
	userId: string | null,
): Promise<VisibilityContext> {
	const serverVisibility = await getServerVisibilityContext(ctx, serverId);

	let userVisibility: UserVisibilityContext | null = null;
	if (userId) {
		const userSettings = await findUserServerSettingsById(ctx, userId, serverId);
		userVisibility = computeUserVisibility(
			userSettings?.canPubliclyDisplayMessages,
		);
	}

	return {
		server: serverVisibility,
		user: userVisibility,
	};
}

export function isMessagePublic(
	serverVisibility: ServerVisibilityContext,
	userVisibility: UserVisibilityContext | null,
): boolean {
	if (serverVisibility.considerAllMessagesPublicEnabled) {
		return true;
	}
	return userVisibility?.canPubliclyDisplayMessages ?? false;
}

export function shouldAnonymizeAuthor(
	serverVisibility: ServerVisibilityContext,
	userVisibility: UserVisibilityContext | null,
	isPublic: boolean,
): boolean {
	if (!isPublic) {
		return true;
	}
	return serverVisibility.anonymizeMessagesEnabled;
}

function generateAnonymousName(authorId: string): string {
	const hash = simpleHash(authorId);
	const adjectives = [
		"Anonymous",
		"Unknown",
		"Mysterious",
		"Hidden",
		"Secret",
		"Private",
		"Unnamed",
		"Unidentified",
	];
	const adjective = adjectives[hash % adjectives.length];
	return `${adjective} User`;
}

function simpleHash(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash);
}

export function anonymizeAuthor(
	author: DiscordAccount,
): { id: string; name: string; avatar: null } {
	return {
		id: author.id,
		name: generateAnonymousName(author.id),
		avatar: null,
	};
}

export function applyVisibilityToAuthor(
	author: DiscordAccount | null,
	visibility: VisibilityContext,
	isPublic: boolean,
): SanitizedAuthor | null {
	if (!author) {
		return null;
	}

	const shouldAnonymize = shouldAnonymizeAuthor(
		visibility.server,
		visibility.user,
		isPublic,
	);

	if (shouldAnonymize) {
		return {
			...anonymizeAuthor(author),
			public: false,
		};
	}

	return {
		id: author.id,
		name: author.name,
		avatar: author.avatar ?? null,
		public: isPublic,
	};
}

export async function getAuthorVisibilityContexts(
	ctx: QueryCtx | MutationCtx,
	serverId: Id<"servers">,
	authorIds: string[],
): Promise<Map<string, UserVisibilityContext | null>> {
	const uniqueAuthorIds = Array.from(new Set(authorIds));
	const authorVisibilityMap = new Map<string, UserVisibilityContext | null>();

	for (const authorId of uniqueAuthorIds) {
		const userSettings = await findUserServerSettingsById(ctx, authorId, serverId);
		const userVisibility = computeUserVisibility(
			userSettings?.canPubliclyDisplayMessages,
		);
		authorVisibilityMap.set(authorId, userVisibility);
	}

	return authorVisibilityMap;
}

export function applyVisibilityToMessages(
	messages: Message[],
	serverVisibility: ServerVisibilityContext,
	authorMap: Map<string, DiscordAccount>,
	authorVisibilityMap: Map<string, UserVisibilityContext | null>,
): Array<{
	message: SanitizedMessage;
	author: SanitizedAuthor | null;
}> {
	return messages.map((message) => {
		const author = authorMap.get(message.authorId) ?? null;
		const authorVisibility = authorVisibilityMap.get(message.authorId) ?? null;
		const isPublic = isMessagePublic(serverVisibility, authorVisibility);

		const visibility: VisibilityContext = {
			server: serverVisibility,
			user: authorVisibility,
		};

		const authorVisibilityResult = applyVisibilityToAuthor(
			author,
			visibility,
			isPublic,
		);

		return {
			message: {
				...message,
				public: isPublic,
			},
			author: authorVisibilityResult,
		};
	});
}

export async function getSanitizedMessages(
	ctx: QueryCtx | MutationCtx,
	messages: Message[],
	authorMap: Map<string, DiscordAccount>,
): Promise<Array<{ message: SanitizedMessage; author: SanitizedAuthor | null }>> {
	if (messages.length === 0) {
		return [];
	}

	const messagesByServer = new Map<Id<"servers">, Message[]>();
	for (const message of messages) {
		const serverId = message.serverId;
		if (!messagesByServer.has(serverId)) {
			messagesByServer.set(serverId, []);
		}
		messagesByServer.get(serverId)!.push(message);
	}

	const sanitizedMessagesByServer = await Promise.all(
		Array.from(messagesByServer.entries()).map(
			async ([serverId, serverMessages]) => {
				const serverAuthorIds = Array.from(
					new Set(serverMessages.map((m) => m.authorId)),
				);
				const [serverVisibility, authorVisibilityMap] = await Promise.all([
					getServerVisibilityContext(ctx, serverId),
					getAuthorVisibilityContexts(ctx, serverId, serverAuthorIds),
				]);

				const serverAuthorMap = new Map(
					serverAuthorIds
						.map((id) => {
							const author = authorMap.get(id);
							return author ? [id, author] : null;
						})
						.filter(
							(
								entry,
							): entry is [string, DiscordAccount] =>
								entry !== null,
						),
				);

				return applyVisibilityToMessages(
					serverMessages,
					serverVisibility,
					serverAuthorMap,
					authorVisibilityMap,
				);
			},
		),
	);

	return sanitizedMessagesByServer.flat();
}

export async function getSanitizedMessagesForServer(
	ctx: QueryCtx | MutationCtx,
	messages: Message[],
	serverId: Id<"servers">,
	authorMap: Map<string, DiscordAccount>,
): Promise<Array<{ message: SanitizedMessage; author: SanitizedAuthor | null }>> {
	if (messages.length === 0) {
		return [];
	}

	const authorIds = Array.from(new Set(messages.map((m) => m.authorId)));
	const [serverVisibility, authorVisibilityMap] = await Promise.all([
		getServerVisibilityContext(ctx, serverId),
		getAuthorVisibilityContexts(ctx, serverId, authorIds),
	]);

	return applyVisibilityToMessages(
		messages,
		serverVisibility,
		authorMap,
		authorVisibilityMap,
	);
}
