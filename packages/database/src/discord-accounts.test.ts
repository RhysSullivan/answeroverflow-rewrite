import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Database } from "./database";
import { DatabaseTestLayer } from "./database-test";
import {
	createTestDiscordAccount,
	createTestMessage,
	createTestServer,
	createTestChannel,
	createTestUserServerSettings,
} from "./test-helpers";

describe("Discord Account Queries", () => {
	it.scoped("getDiscordAccountById returns existing account", () =>
		Effect.gen(function* () {
			const { account, accountId } = yield* createTestDiscordAccount({
				name: "Test User",
			});

			const database = yield* Database;
			const result =
				yield* database.private.discord_accounts.getDiscordAccountById({
					id: accountId,
				});

			expect(result).not.toBeNull();
			expect(result?.name).toBe("Test User");
			expect(result?.id).toBe(accountId);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getDiscordAccountById returns null for non-existent account", () =>
		Effect.gen(function* () {
			const database = yield* Database;
			const result =
				yield* database.private.discord_accounts.getDiscordAccountById({
					id: 999999n,
				});

			expect(result).toBeNull();
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);
});

describe("Discord Account Mutations", () => {
	it.scoped("upsertDiscordAccount creates new account", () =>
		Effect.gen(function* () {
			const database = yield* Database;
			const accountId = BigInt(12345);

			const result =
				yield* database.private.discord_accounts.upsertDiscordAccount({
					account: {
						id: accountId,
						name: "New User",
						avatar: "avatar_hash",
					},
				});

			expect(result).not.toBeNull();
			expect(result.name).toBe("New User");
			expect(result.avatar).toBe("avatar_hash");

			// Verify it's in the database
			const fetched =
				yield* database.private.discord_accounts.getDiscordAccountById({
					id: accountId,
				});
			expect(fetched?.name).toBe("New User");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("upsertDiscordAccount updates existing account", () =>
		Effect.gen(function* () {
			const { accountId } = yield* createTestDiscordAccount({
				name: "Original Name",
			});

			const database = yield* Database;
			const result =
				yield* database.private.discord_accounts.upsertDiscordAccount({
					account: {
						id: accountId,
						name: "Updated Name",
						avatar: "new_avatar",
					},
				});

			expect(result.name).toBe("Updated Name");
			expect(result.avatar).toBe("new_avatar");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("updateDiscordAccount updates existing account", () =>
		Effect.gen(function* () {
			const { accountId } = yield* createTestDiscordAccount({
				name: "Old Name",
			});

			const database = yield* Database;
			const result =
				yield* database.private.discord_accounts.updateDiscordAccount({
					account: {
						id: accountId,
						name: "New Name",
					},
				});

			expect(result.name).toBe("New Name");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("deleteDiscordAccount removes account and related data", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount({
				name: "To Delete",
			});

			// Create a message from this account
			const { messageId } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: accountId,
			});

			// Create user server settings
			yield* createTestUserServerSettings({
				serverId,
				userId: accountId,
			});

			const database = yield* Database;

			// Verify account exists
			const beforeDelete =
				yield* database.private.discord_accounts.getDiscordAccountById({
					id: accountId,
				});
			expect(beforeDelete).not.toBeNull();

			// Verify message exists
			const beforeDeleteMsg = yield* database.private.messages.getMessageById({
				id: messageId,
			});
			expect(beforeDeleteMsg).not.toBeNull();

			// Delete the account
			yield* database.private.discord_accounts.deleteDiscordAccount({
				id: accountId,
			});

			// Verify account is gone
			const afterDelete =
				yield* database.private.discord_accounts.getDiscordAccountById({
					id: accountId,
				});
			expect(afterDelete).toBeNull();

			// Verify message is also deleted (cascade)
			const afterDeleteMsg = yield* database.private.messages.getMessageById({
				id: messageId,
			});
			expect(afterDeleteMsg).toBeNull();
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);
});
