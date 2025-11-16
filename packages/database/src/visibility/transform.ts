import type { DiscordAccount, Message } from "../../convex/schema";
import type {
	SanitizedAuthor,
	SanitizedMessage,
	SanitizedThread,
	ServerVisibilityContext,
	UserVisibilityContext,
	VisibilityContext,
} from "./types";
import { anonymizeAuthor } from "./anonymize";
import { isMessagePublic, shouldAnonymizeAuthor } from "./compute";

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

export function applyVisibilityToThread(
	thread: {
		id: string;
		name: string;
		serverId: string;
		type: number;
		parentId: string | undefined;
		inviteCode: string | undefined;
		archivedTimestamp: number | undefined;
		solutionTagId: string | undefined;
		lastIndexedSnowflake: string | undefined;
	},
	serverVisibility: ServerVisibilityContext,
	userVisibility: UserVisibilityContext | null,
): SanitizedThread {
	const isPublic = isMessagePublic(serverVisibility, userVisibility);
	return {
		...thread,
		public: isPublic,
	};
}
