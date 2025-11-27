import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { Database } from "./database";
import { DatabaseTestLayer } from "./database-test";
import {
	createTestChannel,
	createTestChannelSettings,
	createTestServer,
	createTestUserServerSettings,
} from "./test-helpers";

describe("Server Queries", () => {
	it.scoped("getServerByDiscordId returns existing server", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer({ name: "My Server" });
			const database = yield* Database;

			const result = yield* database.private.servers.getServerByDiscordId({
				discordId: serverId,
			});

			expect(result).not.toBeNull();
			expect(result?.name).toBe("My Server");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getServerByDiscordId returns null for non-existent server", () =>
		Effect.gen(function* () {
			const database = yield* Database;
			const result = yield* database.private.servers.getServerByDiscordId({
				discordId: 999999n,
			});

			expect(result).toBeNull();
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getAllServers returns all servers", () =>
		Effect.gen(function* () {
			yield* createTestServer({ name: "Server 1" });
			yield* createTestServer({ name: "Server 2" });
			yield* createTestServer({ name: "Server 3" });

			const database = yield* Database;
			const result = yield* database.private.servers.getAllServers({});

			expect(result.length).toBe(3);
			const names = result.map((s) => s.name).sort();
			expect(names).toEqual(["Server 1", "Server 2", "Server 3"]);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("getBrowseServers filters kicked servers", () =>
		Effect.gen(function* () {
			yield* createTestServer({ name: "Active Server" });
			yield* createTestServer({
				name: "Kicked Server",
				kickedTime: Date.now(),
			});

			const database = yield* Database;
			const result = yield* database.private.servers.getBrowseServers({});

			// Neither has enough consenting users, so both are filtered out
			expect(result.length).toBe(0);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped(
		"getBrowseServers includes servers with enough consenting users",
		() =>
			Effect.gen(function* () {
				const { serverId } = yield* createTestServer({
					name: "Popular Server",
				});

				// Create 15 consenting users
				yield* Effect.all(
					Array.from({ length: 15 }, (_, i) =>
						createTestUserServerSettings({
							serverId,
							userId: BigInt(1000 + i),
							canPubliclyDisplayMessages: true,
						}),
					),
				);

				const database = yield* Database;
				const result = yield* database.private.servers.getBrowseServers({});

				expect(result.length).toBe(1);
				expect(result[0]?.name).toBe("Popular Server");
			}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped(
		"getServerByDiscordIdWithChannels includes only indexed channels",
		() =>
			Effect.gen(function* () {
				const { serverId } = yield* createTestServer();
				const { channelId: indexedChannelId } = yield* createTestChannel({
					serverId,
					name: "indexed-channel",
				});
				const { channelId: nonIndexedChannelId } = yield* createTestChannel({
					serverId,
					name: "non-indexed-channel",
				});

				yield* createTestChannelSettings({
					channelId: indexedChannelId,
					indexingEnabled: true,
				});
				yield* createTestChannelSettings({
					channelId: nonIndexedChannelId,
					indexingEnabled: false,
				});

				const database = yield* Database;
				const result =
					yield* database.private.servers.getServerByDiscordIdWithChannels({
						discordId: serverId,
					});

				expect(result).not.toBeNull();
				expect(result?.channels.length).toBe(1);
				expect(result?.channels[0]?.name).toBe("indexed-channel");
			}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped(
		"getServerByDiscordIdWithChannels filters out thread channels",
		() =>
			Effect.gen(function* () {
				const { serverId } = yield* createTestServer();
				const { channelId: regularChannelId } = yield* createTestChannel({
					serverId,
					name: "regular-channel",
					type: 0, // Text channel
				});
				const { channelId: threadChannelId } = yield* createTestChannel({
					serverId,
					name: "thread-channel",
					type: 11, // Public thread
				});

				yield* createTestChannelSettings({
					channelId: regularChannelId,
					indexingEnabled: true,
				});
				yield* createTestChannelSettings({
					channelId: threadChannelId,
					indexingEnabled: true,
				});

				const database = yield* Database;
				const result =
					yield* database.private.servers.getServerByDiscordIdWithChannels({
						discordId: serverId,
					});

				expect(result).not.toBeNull();
				expect(result?.channels.length).toBe(1);
				expect(result?.channels[0]?.name).toBe("regular-channel");
			}).pipe(Effect.provide(DatabaseTestLayer)),
	);
});

describe("Server Mutations", () => {
	it.scoped("upsertServer creates new server", () =>
		Effect.gen(function* () {
			const database = yield* Database;
			const testServerId = BigInt(12345);

			yield* database.private.servers.upsertServer({
				discordId: testServerId,
				name: "New Server",
				approximateMemberCount: 50,
				plan: "FREE",
			});

			const result = yield* database.private.servers.getServerByDiscordId({
				discordId: testServerId,
			});

			expect(result).not.toBeNull();
			expect(result?.name).toBe("New Server");
			expect(result?.approximateMemberCount).toBe(50);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("upsertServer updates existing server", () =>
		Effect.gen(function* () {
			const { serverId } = yield* createTestServer({ name: "Original Name" });
			const database = yield* Database;

			yield* database.private.servers.upsertServer({
				discordId: serverId,
				name: "Updated Name",
				approximateMemberCount: 200,
				plan: "PRO",
			});

			const result = yield* database.private.servers.getServerByDiscordId({
				discordId: serverId,
			});

			expect(result?.name).toBe("Updated Name");
			expect(result?.approximateMemberCount).toBe(200);
			expect(result?.plan).toBe("PRO");
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("findManyServersByDiscordId returns matching servers", () =>
		Effect.gen(function* () {
			const { serverId: id1 } = yield* createTestServer({ name: "Server 1" });
			const { serverId: id2 } = yield* createTestServer({ name: "Server 2" });
			const { serverId: id3 } = yield* createTestServer({ name: "Server 3" });

			const database = yield* Database;
			const result = yield* database.private.servers.findManyServersByDiscordId(
				{
					discordIds: [id1, id3],
				},
			);

			expect(result.length).toBe(2);
			const names = result.map((s) => s.name).sort();
			expect(names).toEqual(["Server 1", "Server 3"]);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);

	it.scoped("findManyServersByDiscordId handles empty array", () =>
		Effect.gen(function* () {
			const database = yield* Database;
			const result = yield* database.private.servers.findManyServersByDiscordId(
				{
					discordIds: [],
				},
			);

			expect(result.length).toBe(0);
		}).pipe(Effect.provide(DatabaseTestLayer)),
	);
});
