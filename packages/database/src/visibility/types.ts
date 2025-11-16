import type { Id } from "../../convex/_generated/dataModel";
import type { Message } from "../../convex/schema";

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

export type SanitizedThread = {
	id: string;
	name: string;
	serverId: Id<"servers">;
	type: number;
	parentId: string | undefined;
	inviteCode: string | undefined;
	archivedTimestamp: number | undefined;
	solutionTagId: string | undefined;
	lastIndexedSnowflake: string | undefined;
	public: boolean;
};
