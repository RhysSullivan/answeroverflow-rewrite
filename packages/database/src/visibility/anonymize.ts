import type { DiscordAccount } from "../../convex/schema";

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
