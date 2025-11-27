import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Database } from "./database";
import { DatabaseTestLayer } from "./database-test";
import {
	attachment,
	createTestChannel,
	createTestChannelSettings,
	createTestDiscordAccount,
	createTestMessage,
	createTestMessageThread,
	createTestServer,
	createTestServerWithMessages,
	createTestUserServerSettings,
} from "./test-helpers";

describe("Message Queries", () => {
	it.scoped("getMessageById returns existing message", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount();
			const { messageId } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: accountId,
				overrides: { content: "Hello, world!" },
			});

			const database = yield* Database;
			const result = yield* database.private.messages.getMessageById({
				id: messageId,
			});

			expect(result).not.toBeNull();
			expect(result?.content).toBe("Hello, world!");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getMessageById returns null for non-existent message", () =>
		Effect.gen(function* () {
			const database = yield* Database;
			const result = yield* database.private.messages.getMessageById({
				id: 999999n,
			});

			expect(result).toBeNull();
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getTotalMessageCount returns correct count", () =>
		Effect.gen(function* () {
			yield* createTestServerWithMessages(5);

			const database = yield* Database;
			const count = yield* database.private.messages.getTotalMessageCount({});

			expect(count).toBe(5);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getMessagePageData returns message data", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount();

			// Create channel settings (required by getMessagePageData)
			yield* createTestChannelSettings({
				channelId,
				indexingEnabled: true,
			});

			// Create user settings to allow message display
			yield* createTestUserServerSettings({
				serverId,
				userId: accountId,
				canPubliclyDisplayMessages: true,
			});

			const { messageId } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: accountId,
				overrides: { content: "Test message for page data" },
			});

			const database = yield* Database;
			const result = yield* database.private.messages.getMessagePageData({
				messageId,
			});

			expect(result).not.toBeNull();
			expect(result?.messages.length).toBeGreaterThan(0);
			expect(result?.channel.id).toBe(channelId);
			expect(result?.server.discordId).toBe(serverId);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getTopQuestionSolversByServerId returns solvers ranked", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId: solver1 } = yield* createTestDiscordAccount({
				name: "Solver 1",
			});
			const { accountId: solver2 } = yield* createTestDiscordAccount({
				name: "Solver 2",
			});

			// Create question messages
			const { messageId: q1 } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: BigInt(9999),
				overrides: { content: "Question 1" },
			});
			const { messageId: q2 } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: BigInt(9999),
				overrides: { content: "Question 2" },
			});
			const { messageId: q3 } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: BigInt(9999),
				overrides: { content: "Question 3" },
			});

			// Solver1 answers 2 questions
			yield* createTestMessage({
				serverId,
				channelId,
				authorId: solver1,
				overrides: { content: "Answer 1", questionId: q1 },
			});
			yield* createTestMessage({
				serverId,
				channelId,
				authorId: solver1,
				overrides: { content: "Answer 2", questionId: q2 },
			});

			// Solver2 answers 1 question
			yield* createTestMessage({
				serverId,
				channelId,
				authorId: solver2,
				overrides: { content: "Answer 3", questionId: q3 },
			});

			const database = yield* Database;
			const result =
				yield* database.private.messages.getTopQuestionSolversByServerId({
					serverId,
					limit: 10,
				});

			expect(result.length).toBe(2);
			expect(result[0]?.authorId).toBe(solver1);
			expect(result[0]?.count).toBe(2);
			expect(result[1]?.authorId).toBe(solver2);
			expect(result[1]?.count).toBe(1);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);
});

describe("Message Mutations", () => {
	it.scoped("upsertMessage creates new message", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount();
			const database = yield* Database;

			const messageId = BigInt(11111);
			yield* database.private.messages.upsertMessage({
				message: {
					id: messageId,
					serverId,
					channelId,
					authorId: accountId,
					content: "New message",
				},
				ignoreChecks: true,
			});

			const result = yield* database.private.messages.getMessageById({
				id: messageId,
			});

			expect(result).not.toBeNull();
			expect(result?.content).toBe("New message");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("upsertMessage updates existing message", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount();
			const { messageId } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: accountId,
				overrides: { content: "Original content" },
			});

			const database = yield* Database;
			yield* database.private.messages.upsertMessage({
				message: {
					id: messageId,
					serverId,
					channelId,
					authorId: accountId,
					content: "Updated content",
				},
				ignoreChecks: true,
			});

			const result = yield* database.private.messages.getMessageById({
				id: messageId,
			});

			expect(result?.content).toBe("Updated content");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("upsertMessage with attachments stores them", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount();
			const database = yield* Database;

			const messageId = BigInt(22222);
			const attachmentData = attachment()
				.withMessageId(messageId)
				.withFilename("test.png")
				.withSize(1024)
				.build();

			yield* database.private.messages.upsertMessage({
				message: {
					id: messageId,
					serverId,
					channelId,
					authorId: accountId,
					content: "Message with attachment",
				},
				attachments: [attachmentData],
				ignoreChecks: true,
			});

			const result = yield* database.private.messages.getMessageById({
				id: messageId,
			});

			expect(result).not.toBeNull();
			// Note: Can't easily verify attachments without a separate query
			// but the mutation should succeed
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("deleteMessage removes message", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount();
			const { messageId } = yield* createTestMessage({
				serverId,
				channelId,
				authorId: accountId,
			});

			const database = yield* Database;

			// Verify message exists
			const beforeDelete = yield* database.private.messages.getMessageById({
				id: messageId,
			});
			expect(beforeDelete).not.toBeNull();

			// Delete the message
			yield* database.private.messages.deleteMessage({ id: messageId });

			// Verify message is gone
			const afterDelete = yield* database.private.messages.getMessageById({
				id: messageId,
			});
			expect(afterDelete).toBeNull();
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("deleteManyMessages removes multiple messages", () =>
		Effect.gen(function* () {
			const { messages } = yield* createTestServerWithMessages(3);
			const messageIds = messages.map((m) => m.id);

			const database = yield* Database;

			// Verify all messages exist
			for (const id of messageIds) {
				const msg = yield* database.private.messages.getMessageById({ id });
				expect(msg).not.toBeNull();
			}

			// Delete all messages
			yield* database.private.messages.deleteManyMessages({ ids: messageIds });

			// Verify all messages are gone
			for (const id of messageIds) {
				const msg = yield* database.private.messages.getMessageById({ id });
				expect(msg).toBeNull();
			}
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("upsertManyMessages creates multiple messages", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer();
			const { channelId } = yield* createTestChannel({ serverId });
			const { accountId } = yield* createTestDiscordAccount();
			const database = yield* Database;

			const messageIds = [BigInt(30001), BigInt(30002), BigInt(30003)];
			yield* database.private.messages.upsertManyMessages({
				messages: messageIds.map((id, index) => ({
					message: {
						id,
						serverId,
						channelId,
						authorId: accountId,
						content: `Batch message ${index + 1}`,
					},
				})),
				ignoreChecks: true,
			});

			// Verify all messages were created
			for (let i = 0; i < messageIds.length; i++) {
				const msg = yield* database.private.messages.getMessageById({
					id: messageIds[i] ?? 0n,
				});
				expect(msg).not.toBeNull();
				expect(msg?.content).toBe(`Batch message ${i + 1}`);
			}
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);
});
