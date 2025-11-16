import type { ServerVisibilityContext, UserVisibilityContext } from "./types";

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
