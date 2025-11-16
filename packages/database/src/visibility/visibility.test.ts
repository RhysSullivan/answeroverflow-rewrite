import { describe, expect, it } from "vitest";
import {
	computeServerVisibility,
	computeUserVisibility,
	isMessagePublic,
	shouldAnonymizeAuthor,
} from "./compute";
import { anonymizeAuthor } from "./anonymize";
import type {
	ServerVisibilityContext,
	UserVisibilityContext,
} from "./types";

describe("computeServerVisibility", () => {
	it("should default to false when preferences are undefined", () => {
		const result = computeServerVisibility(undefined, undefined);
		expect(result.considerAllMessagesPublicEnabled).toBe(false);
		expect(result.anonymizeMessagesEnabled).toBe(false);
	});

	it("should use provided values", () => {
		const result = computeServerVisibility(true, true);
		expect(result.considerAllMessagesPublicEnabled).toBe(true);
		expect(result.anonymizeMessagesEnabled).toBe(true);
	});
});

describe("computeUserVisibility", () => {
	it("should return null when canPubliclyDisplayMessages is undefined", () => {
		const result = computeUserVisibility(undefined);
		expect(result).toBeNull();
	});

	it("should return user visibility when provided", () => {
		const result = computeUserVisibility(true);
		expect(result).toEqual({ canPubliclyDisplayMessages: true });
	});
});

describe("isMessagePublic", () => {
	it("should return true when server has considerAllMessagesPublicEnabled", () => {
		const serverVisibility: ServerVisibilityContext = {
			considerAllMessagesPublicEnabled: true,
			anonymizeMessagesEnabled: false,
		};
		const result = isMessagePublic(serverVisibility, null);
		expect(result).toBe(true);
	});

	it("should return true when user has canPubliclyDisplayMessages", () => {
		const serverVisibility: ServerVisibilityContext = {
			considerAllMessagesPublicEnabled: false,
			anonymizeMessagesEnabled: false,
		};
		const userVisibility: UserVisibilityContext = {
			canPubliclyDisplayMessages: true,
		};
		const result = isMessagePublic(serverVisibility, userVisibility);
		expect(result).toBe(true);
	});

	it("should return false when neither condition is met", () => {
		const serverVisibility: ServerVisibilityContext = {
			considerAllMessagesPublicEnabled: false,
			anonymizeMessagesEnabled: false,
		};
		const userVisibility: UserVisibilityContext = {
			canPubliclyDisplayMessages: false,
		};
		const result = isMessagePublic(serverVisibility, userVisibility);
		expect(result).toBe(false);
	});

	it("should return false when user visibility is null", () => {
		const serverVisibility: ServerVisibilityContext = {
			considerAllMessagesPublicEnabled: false,
			anonymizeMessagesEnabled: false,
		};
		const result = isMessagePublic(serverVisibility, null);
		expect(result).toBe(false);
	});
});

describe("shouldAnonymizeAuthor", () => {
	it("should return true when message is not public", () => {
		const serverVisibility: ServerVisibilityContext = {
			considerAllMessagesPublicEnabled: false,
			anonymizeMessagesEnabled: false,
		};
		const result = shouldAnonymizeAuthor(
			serverVisibility,
			null,
			false,
		);
		expect(result).toBe(true);
	});

	it("should return true when anonymizeMessagesEnabled is true", () => {
		const serverVisibility: ServerVisibilityContext = {
			considerAllMessagesPublicEnabled: true,
			anonymizeMessagesEnabled: true,
		};
		const userVisibility: UserVisibilityContext = {
			canPubliclyDisplayMessages: true,
		};
		const result = shouldAnonymizeAuthor(
			serverVisibility,
			userVisibility,
			true,
		);
		expect(result).toBe(true);
	});

	it("should return false when message is public and anonymization is disabled", () => {
		const serverVisibility: ServerVisibilityContext = {
			considerAllMessagesPublicEnabled: true,
			anonymizeMessagesEnabled: false,
		};
		const userVisibility: UserVisibilityContext = {
			canPubliclyDisplayMessages: true,
		};
		const result = shouldAnonymizeAuthor(
			serverVisibility,
			userVisibility,
			true,
		);
		expect(result).toBe(false);
	});
});

describe("anonymizeAuthor", () => {
	it("should anonymize author with generated name", () => {
		const author = {
			id: "123456789",
			name: "Test User",
			avatar: "https://example.com/avatar.png",
		};
		const result = anonymizeAuthor(author);
		expect(result.id).toBe("123456789");
		expect(result.name).not.toBe("Test User");
		expect(result.name).toContain("User");
		expect(result.avatar).toBeNull();
	});

	it("should generate consistent names for same author ID", () => {
		const author = {
			id: "123456789",
			name: "Test User",
			avatar: undefined,
		};
		const result1 = anonymizeAuthor(author);
		const result2 = anonymizeAuthor(author);
		expect(result1.name).toBe(result2.name);
	});

	it("should generate different names for different author IDs", () => {
		const author1 = {
			id: "123456789",
			name: "Test User",
			avatar: undefined,
		};
		const author2 = {
			id: "987654321",
			name: "Test User",
			avatar: undefined,
		};
		const result1 = anonymizeAuthor(author1);
		const result2 = anonymizeAuthor(author2);
		expect(result1.name).not.toBe(result2.name);
	});
});
