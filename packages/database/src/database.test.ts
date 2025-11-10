import { expect, it } from "@effect/vitest";
import { Cause, Chunk, Effect, Exit, Layer, Scope, TestClock } from "effect";
import type { Channel, Server } from "../convex/schema";
import { ConvexClientTest } from "./convex-client-test";
import {
	ConvexClientUnified,
	ConvexError,
	type WrappedUnifiedClient,
} from "./convex-unified-client";
import { Database, DatabaseTestLayer, service } from "./database";

const server: Server = {
	name: "Test Server",
	description: "Test Description",
	icon: "https://example.com/icon.png",
	vanityInviteCode: "test",
	vanityUrl: "test",
	discordId: "123",
	plan: "FREE",
	approximateMemberCount: 0,
};

const server2: Server = {
	name: "Test Server 2",
	description: "Test Description 2",
	icon: "https://example.com/icon2.png",
	vanityInviteCode: "test2",
	vanityUrl: "test2",
	discordId: "456",
	plan: "STARTER",
	approximateMemberCount: 100,
};

it.scoped("live data updates when server is modified", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Initial upsert
		yield* database.servers.upsertServer(server);

		// Get live data
		const liveData = yield* database.servers.getServerByDiscordId("123");

		// Advance time to allow setTimeout callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Data should already be loaded due to defer mechanism
		expect(liveData?.data?.discordId).toBe("123");
		expect(liveData?.data?.description).toBe("Test Description");

		// Update the server
		const updatedDescription = `A brand new description ${Math.random()}`;
		yield* database.servers.upsertServer({
			...server,
			description: updatedDescription,
		});

		// Advance time to allow setTimeout callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Verify live data has updated
		expect(liveData?.data?.description).toBe(updatedDescription);
		expect(liveData?.data?.discordId).toBe("123");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"deduplication: multiple requests for same query+args return same LiveData",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;
			const testClient = yield* ConvexClientTest;

			// Reset query call counts
			testClient.resetQueryCallCounts();

			// Initial upsert
			yield* database.servers.upsertServer(server);

			// Get live data multiple times with same args
			const liveData1 = yield* database.servers.getServerByDiscordId("123");
			const liveData2 = yield* database.servers.getServerByDiscordId("123");
			const liveData3 = yield* database.servers.getServerByDiscordId("123");

			// Advance time to allow callbacks to fire
			yield* TestClock.adjust("10 millis");

			// All should be the same instance (deduplication)
			expect(liveData1).toBe(liveData2);
			expect(liveData2).toBe(liveData3);

			// All should have the same data
			expect(liveData1?.data?.discordId).toBe("123");
			expect(liveData2?.data?.discordId).toBe("123");
			expect(liveData3?.data?.discordId).toBe("123");

			// Verify onUpdate was only called once (deduplication)
			// Note: We can't directly access the query call count from the test client
			// because it's wrapped, but we can verify behavior through updates
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("different args create different LiveData instances", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Initial upserts
		yield* database.servers.upsertServer(server);
		yield* database.servers.upsertServer(server2);

		// Get live data for different servers
		const liveData1 = yield* database.servers.getServerByDiscordId("123");
		const liveData2 = yield* database.servers.getServerByDiscordId("456");

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should be different instances
		expect(liveData1).not.toBe(liveData2);

		// Should have different data
		expect(liveData1?.data?.discordId).toBe("123");
		expect(liveData2?.data?.discordId).toBe("456");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("different queries create different LiveData instances", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Initial upsert
		yield* database.servers.upsertServer(server);

		// Get live data from different queries
		const liveData1 = yield* database.servers.getServerByDiscordId("123");
		const liveData2 = yield* database.servers.publicGetAllServers();

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should be different instances
		expect(liveData1).not.toBe(liveData2);

		// Should have different data structures
		expect(liveData1?.data?.discordId).toBe("123");
		expect(Array.isArray(liveData2?.data)).toBe(true);
		expect(liveData2?.data?.length).toBeGreaterThan(0);
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("reference counting: multiple acquisitions increment refCount", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Initial upsert
		yield* database.servers.upsertServer(server);

		// Create separate scopes for each acquisition to test reference counting
		const scope1 = yield* Scope.make();
		const scope2 = yield* Scope.make();
		const scope3 = yield* Scope.make();

		// Acquire multiple times in separate scopes
		const liveData1 = yield* Scope.extend(
			database.servers.getServerByDiscordId("123"),
			scope1,
		);
		const liveData2 = yield* Scope.extend(
			database.servers.getServerByDiscordId("123"),
			scope2,
		);
		const liveData3 = yield* Scope.extend(
			database.servers.getServerByDiscordId("123"),
			scope3,
		);

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// All should be the same instance (deduplication)
		expect(liveData1).toBe(liveData2);
		expect(liveData2).toBe(liveData3);

		// Release one reference - watch should still be active
		yield* Scope.close(scope1, Exit.succeed(undefined));

		// Advance time
		yield* TestClock.adjust("10 millis");

		// Remaining instances should still work
		expect(liveData2?.data?.discordId).toBe("123");
		expect(liveData3?.data?.discordId).toBe("123");

		// Release another reference - watch should still be active
		yield* Scope.close(scope2, Exit.succeed(undefined));

		// Advance time
		yield* TestClock.adjust("10 millis");

		// Last instance should still work
		expect(liveData3?.data?.discordId).toBe("123");

		// Release last reference - watch should be cleaned up
		yield* Scope.close(scope3, Exit.succeed(undefined));

		// Advance time
		yield* TestClock.adjust("10 millis");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"updates propagate to all LiveData instances watching same query+args",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Initial upsert
			yield* database.servers.upsertServer(server);

			// Get multiple LiveData instances for the same query+args
			const liveData1 = yield* database.servers.getServerByDiscordId("123");
			const liveData2 = yield* database.servers.getServerByDiscordId("123");
			const liveData3 = yield* database.servers.getServerByDiscordId("123");

			// Advance time to allow callbacks to fire
			yield* TestClock.adjust("10 millis");

			// All should have initial data
			expect(liveData1?.data?.description).toBe("Test Description");
			expect(liveData2?.data?.description).toBe("Test Description");
			expect(liveData3?.data?.description).toBe("Test Description");

			// Update the server
			const updatedDescription = `Updated description ${Math.random()}`;
			yield* database.servers.upsertServer({
				...server,
				description: updatedDescription,
			});

			// Advance time to allow callbacks to fire
			yield* TestClock.adjust("10 millis");

			// All instances should have updated data
			expect(liveData1?.data?.description).toBe(updatedDescription);
			expect(liveData2?.data?.description).toBe(updatedDescription);
			expect(liveData3?.data?.description).toBe(updatedDescription);
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"updates only affect LiveData instances watching the affected query+args",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Initial upserts
			yield* database.servers.upsertServer(server);
			yield* database.servers.upsertServer(server2);

			// Get LiveData instances for different servers
			const liveData1 = yield* database.servers.getServerByDiscordId("123");
			const liveData2 = yield* database.servers.getServerByDiscordId("456");

			// Advance time to allow callbacks to fire
			yield* TestClock.adjust("10 millis");

			// Both should have their initial data
			expect(liveData1?.data?.discordId).toBe("123");
			expect(liveData2?.data?.discordId).toBe("456");

			// Update only server 1
			const updatedDescription = `Updated description ${Math.random()}`;
			yield* database.servers.upsertServer({
				...server,
				description: updatedDescription,
			});

			// Advance time to allow callbacks to fire
			yield* TestClock.adjust("10 millis");

			// Only liveData1 should be updated
			expect(liveData1?.data?.description).toBe(updatedDescription);
			expect(liveData2?.data?.description).toBe("Test Description 2");
			expect(liveData2?.data?.discordId).toBe("456");
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("LiveData can be reacquired after cleanup", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Initial upsert
		yield* database.servers.upsertServer(server);

		// Create a scope for the first acquisition
		const scope1 = yield* Scope.make();

		// Acquire in first scope
		const liveData1 = yield* Scope.extend(
			database.servers.getServerByDiscordId("123"),
			scope1,
		);
		yield* TestClock.adjust("10 millis");
		expect(liveData1?.data?.discordId).toBe("123");

		// Release first scope
		yield* Scope.close(scope1, Exit.succeed(undefined));
		yield* TestClock.adjust("10 millis");

		// Reacquire in new scope - should create a new watch
		const scope2 = yield* Scope.make();
		const liveData2 = yield* Scope.extend(
			database.servers.getServerByDiscordId("123"),
			scope2,
		);
		yield* TestClock.adjust("10 millis");

		// Should still work
		expect(liveData2?.data?.discordId).toBe("123");

		// Should be a different instance (old one was cleaned up)
		expect(liveData1).not.toBe(liveData2);

		// Clean up second scope
		yield* Scope.close(scope2, Exit.succeed(undefined));
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("publicGetAllServers updates when any server changes", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Initial upsert
		yield* database.servers.upsertServer(server);

		// Get live data for all servers
		const liveData = yield* database.servers.publicGetAllServers();

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should have one server
		expect(liveData?.data?.length).toBe(1);
		expect(liveData?.data?.[0]?.discordId).toBe("123");

		// Add another server
		yield* database.servers.upsertServer(server2);

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should have two servers
		expect(liveData?.data?.length).toBe(2);
		expect(liveData?.data?.some((s) => s.discordId === "123")).toBe(true);
		expect(liveData?.data?.some((s) => s.discordId === "456")).toBe(true);

		// Update first server
		const updatedDescription = `Updated description ${Math.random()}`;
		yield* database.servers.upsertServer({
			...server,
			description: updatedDescription,
		});

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should still have two servers, but first one updated
		expect(liveData?.data?.length).toBe(2);
		const updatedServer = liveData?.data?.find((s) => s.discordId === "123");
		expect(updatedServer?.description).toBe(updatedDescription);
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("LiveData handles queries with no args", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Initial upsert
		yield* database.servers.upsertServer(server);

		// Get live data for query with no args
		const liveData1 = yield* database.servers.publicGetAllServers();
		const liveData2 = yield* database.servers.publicGetAllServers();

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should be the same instance (deduplication)
		expect(liveData1).toBe(liveData2);

		// Should have data
		expect(liveData1?.data?.length).toBe(1);
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("LiveData handles null query results", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Get live data for non-existent server
		const liveData = yield* database.servers.getServerByDiscordId("nonexistent");

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should return null
		expect(liveData?.data).toBeNull();
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("LiveData updates when null result becomes non-null", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Get live data for non-existent server
		const liveData = yield* database.servers.getServerByDiscordId("789");

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should return null
		expect(liveData?.data).toBeNull();

		// Create the server
		const newServer: Server = {
			...server,
			discordId: "789",
			name: "New Server",
		};
		yield* database.servers.upsertServer(newServer);

		// Advance time to allow callbacks to fire
		yield* TestClock.adjust("10 millis");

		// Should now have data
		expect(liveData?.data?.discordId).toBe("789");
		expect(liveData?.data?.name).toBe("New Server");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

// Mock layer that simulates ConvexError
const mockConvexClientWithError: Partial<WrappedUnifiedClient> = {
	use: () => {
		return Effect.fail(new ConvexError({ cause: "Simulated ConvexError" }));
	},
};

const MockConvexClientErrorLayer = Layer.succeed(
	ConvexClientUnified,
	mockConvexClientWithError as WrappedUnifiedClient,
);

const MockDatabaseLayerWithError = Layer.effect(Database, service).pipe(
	Layer.provide(MockConvexClientErrorLayer),
);

it("LiveData propagates ConvexError from .use()", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Try to get live data - should fail with ConvexError
		const result = yield* Effect.scoped(
			database.servers.getServerByDiscordId("123"),
		).pipe(Effect.exit);

		// Verify that the Effect failed with a ConvexError
		expect(Exit.isFailure(result)).toBe(true);
		if (Exit.isFailure(result)) {
			const failures = Cause.failures(result.cause);
			const maybeError = Chunk.head(failures);
			expect(maybeError._tag).toBe("Some");
			if (maybeError._tag === "Some") {
				const error = maybeError.value;
				expect(error).toBeInstanceOf(ConvexError);
				if (error instanceof ConvexError) {
					expect(error.cause).toBe("Simulated ConvexError");
				}
			}
		}
	}).pipe(Effect.provide(MockDatabaseLayerWithError)));

// Tests for new server functions

it.scoped("getServerById returns server by Convex ID", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create server
		yield* database.servers.upsertServer(server);

		// Get server by Discord ID first to get the Convex ID
		const serverByDiscordId =
			yield* database.servers.getServerByDiscordId("123");
		const serverId = serverByDiscordId?.data?._id;

		if (!serverId) {
			throw new Error("Server not found");
		}

		// Get server by Convex ID
		const liveData = yield* database.servers.getServerById(serverId);
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?._id).toBe(serverId);
		expect(liveData?.data?.discordId).toBe("123");
		expect(liveData?.data?.name).toBe("Test Server");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("findServerByAlias returns server by vanity URL", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create server with vanity URL
		yield* database.servers.upsertServer(server);

		// Find by alias
		const liveData = yield* database.servers.findServerByAlias("test");
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.vanityUrl).toBe("test");
		expect(liveData?.data?.discordId).toBe("123");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("findServerByAliasOrId finds by vanity URL", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create server
		yield* database.servers.upsertServer(server);

		// Find by alias
		const liveData = yield* database.servers.findServerByAliasOrId("test");
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.vanityUrl).toBe("test");
		expect(liveData?.data?.discordId).toBe("123");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("findServerByAliasOrId finds by Discord ID", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create server
		yield* database.servers.upsertServer(server);

		// Find by Discord ID
		const liveData = yield* database.servers.findServerByAliasOrId("123");
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.discordId).toBe("123");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("findServerByStripeCustomerId returns server", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		const serverWithStripe: Server = {
			...server,
			stripeCustomerId: "cus_test123",
		};

		// Create server with Stripe customer ID
		yield* database.servers.upsertServer(serverWithStripe);

		// Find by Stripe customer ID
		const liveData =
			yield* database.servers.findServerByStripeCustomerId("cus_test123");
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.stripeCustomerId).toBe("cus_test123");
		expect(liveData?.data?.discordId).toBe("123");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("findServerByStripeSubscriptionId returns server", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		const serverWithStripe: Server = {
			...server,
			stripeSubscriptionId: "sub_test123",
		};

		// Create server with Stripe subscription ID
		yield* database.servers.upsertServer(serverWithStripe);

		// Find by Stripe subscription ID
		const liveData = yield* database.servers.findServerByStripeSubscriptionId(
			"sub_test123",
		);
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.stripeSubscriptionId).toBe("sub_test123");
		expect(liveData?.data?.discordId).toBe("123");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("findManyServersById returns multiple servers", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create multiple servers
		yield* database.servers.upsertServer(server);
		yield* database.servers.upsertServer(server2);

		// Get server IDs
		const server1LiveData =
			yield* database.servers.getServerByDiscordId("123");
		const server2LiveData =
			yield* database.servers.getServerByDiscordId("456");
		yield* TestClock.adjust("10 millis");

		const server1Id = server1LiveData?.data?._id;
		const server2Id = server2LiveData?.data?._id;

		if (!server1Id || !server2Id) {
			throw new Error("Servers not found");
		}

		// Find many by IDs
		const liveData = yield* database.servers.findManyServersById([
			server1Id,
			server2Id,
		]);
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.length).toBe(2);
		expect(
			liveData?.data?.some((s) => s.discordId === "123"),
		).toBe(true);
		expect(
			liveData?.data?.some((s) => s.discordId === "456"),
		).toBe(true);
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("getBiggestServers returns servers ordered by member count", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		const serverSmall: Server = {
			...server,
			discordId: "small",
			approximateMemberCount: 10,
		};
		const serverMedium: Server = {
			...server2,
			discordId: "medium",
			approximateMemberCount: 100,
		};
		const serverLarge: Server = {
			...server,
			discordId: "large",
			approximateMemberCount: 1000,
		};

		// Create servers with different member counts
		yield* database.servers.upsertServer(serverSmall);
		yield* database.servers.upsertServer(serverMedium);
		yield* database.servers.upsertServer(serverLarge);

		// Get biggest servers
		const liveData = yield* database.servers.getBiggestServers(2);
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.length).toBe(2);
		// Should be ordered by member count descending
		expect(liveData?.data?.[0]?.discordId).toBe("large");
		expect(liveData?.data?.[1]?.discordId).toBe("medium");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("createServer creates new server", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		const newServer: Server = {
			...server,
			discordId: "new123",
			name: "New Server",
		};

		// Create server
		const serverId = yield* database.servers.createServer(newServer);

		// Verify it was created
		const liveData =
			yield* database.servers.getServerByDiscordId("new123");
		yield* TestClock.adjust("10 millis");

		expect(liveData?.data?.discordId).toBe("new123");
		expect(liveData?.data?.name).toBe("New Server");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("updateServer updates existing server", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create server
		yield* database.servers.upsertServer(server);

		// Get server ID
		const serverLiveData =
			yield* database.servers.getServerByDiscordId("123");
		yield* TestClock.adjust("10 millis");
		const serverId = serverLiveData?.data?._id;

		if (!serverId) {
			throw new Error("Server not found");
		}

		// Update server
		const updatedServer: Server = {
			...server,
			name: "Updated Server Name",
			description: "Updated Description",
		};
		yield* database.servers.updateServer(serverId, updatedServer);

		// Verify update
		const updatedLiveData =
			yield* database.servers.getServerByDiscordId("123");
		yield* TestClock.adjust("10 millis");

		expect(updatedLiveData?.data?.name).toBe("Updated Server Name");
		expect(updatedLiveData?.data?.description).toBe("Updated Description");
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

// Complex tests with data changes

it.scoped(
	"findServerByIdWithChannels returns server with channels and updates when channels change",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Create server
			yield* database.servers.upsertServer(server);

			// Get server ID
			const serverLiveData =
				yield* database.servers.getServerByDiscordId("123");
			yield* TestClock.adjust("10 millis");
			const serverId = serverLiveData?.data?._id;

			if (!serverId) {
				throw new Error("Server not found");
			}

			// Get server with channels (should be empty initially)
			const liveData =
				yield* database.servers.findServerByIdWithChannels(serverId);
			yield* TestClock.adjust("10 millis");

			expect(liveData?.data?.channels).toBeDefined();
			expect(liveData?.data?.channels?.length).toBe(0);

			// Add a channel
			const channel: Channel = {
				id: "channel123",
				serverId,
				name: "Test Channel",
				type: 0, // GuildText
			};
			yield* database.channels.upsertChannelWithSettings({ channel });
			yield* TestClock.adjust("10 millis");

			// Should now have one channel
			expect(liveData?.data?.channels?.length).toBe(1);
			expect(liveData?.data?.channels?.[0]?.id).toBe("channel123");

			// Add another channel (forum type)
			const forumChannel: Channel = {
				id: "channel456",
				serverId,
				name: "Forum Channel",
				type: 15, // GuildForum
			};
			yield* database.channels.upsertChannelWithSettings({
				channel: forumChannel,
			});
			yield* TestClock.adjust("10 millis");

			// Should have two channels, forum first (sorted)
			expect(liveData?.data?.channels?.length).toBe(2);
			expect(liveData?.data?.channels?.[0]?.type).toBe(15); // Forum first
			expect(liveData?.data?.channels?.[1]?.type).toBe(0); // Text second
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"multiple queries update correctly when server data changes",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Create server
			yield* database.servers.upsertServer(server);

			// Set up multiple queries watching the same server
			const byDiscordId =
				yield* database.servers.getServerByDiscordId("123");
			const byAlias = yield* database.servers.findServerByAlias("test");
			const allServers = yield* database.servers.publicGetAllServers();

			yield* TestClock.adjust("10 millis");

			// All should have initial data
			expect(byDiscordId?.data?.name).toBe("Test Server");
			expect(byAlias?.data?.name).toBe("Test Server");
			expect(allServers?.data?.length).toBe(1);

			// Update server via updateServer
			const serverLiveData =
				yield* database.servers.getServerByDiscordId("123");
			yield* TestClock.adjust("10 millis");
			const serverId = serverLiveData?.data?._id;

			if (!serverId) {
				throw new Error("Server not found");
			}

			const updatedServer: Server = {
				...server,
				name: "Updated Name",
				vanityUrl: "updated-alias",
			};
			yield* database.servers.updateServer(serverId, updatedServer);
			yield* TestClock.adjust("10 millis");

			// All queries should reflect the update
			expect(byDiscordId?.data?.name).toBe("Updated Name");
			expect(byAlias?.data).toBeNull(); // Old alias no longer exists
			expect(allServers?.data?.[0]?.name).toBe("Updated Name");

			// New alias should work
			const newByAlias =
				yield* database.servers.findServerByAlias("updated-alias");
			yield* TestClock.adjust("10 millis");
			expect(newByAlias?.data?.name).toBe("Updated Name");
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"getBiggestServers updates when member counts change",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			const serverA: Server = {
				...server,
				discordId: "serverA",
				approximateMemberCount: 100,
			};
			const serverB: Server = {
				...server2,
				discordId: "serverB",
				approximateMemberCount: 200,
			};

			// Create servers
			yield* database.servers.upsertServer(serverA);
			yield* database.servers.upsertServer(serverB);

			// Get biggest servers
			const liveData = yield* database.servers.getBiggestServers(2);
			yield* TestClock.adjust("10 millis");

			// Should be ordered: B (200), A (100)
			expect(liveData?.data?.length).toBe(2);
			expect(liveData?.data?.[0]?.discordId).toBe("serverB");
			expect(liveData?.data?.[1]?.discordId).toBe("serverA");

			// Update serverA to have more members
			const serverALiveData =
				yield* database.servers.getServerByDiscordId("serverA");
			yield* TestClock.adjust("10 millis");
			const serverAId = serverALiveData?.data?._id;

			if (!serverAId) {
				throw new Error("Server not found");
			}

			const updatedServerA: Server = {
				...serverA,
				approximateMemberCount: 300,
			};
			yield* database.servers.updateServer(serverAId, updatedServerA);
			yield* TestClock.adjust("10 millis");

			// Order should change: A (300), B (200)
			expect(liveData?.data?.[0]?.discordId).toBe("serverA");
			expect(liveData?.data?.[1]?.discordId).toBe("serverB");
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"findManyServersById handles partial updates correctly",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Create three servers
			const server1: Server = { ...server, discordId: "s1" };
			const server2: Server = { ...server2, discordId: "s2" };
			const server3: Server = {
				...server,
				discordId: "s3",
				name: "Server 3",
			};

			yield* database.servers.upsertServer(server1);
			yield* database.servers.upsertServer(server2);
			yield* database.servers.upsertServer(server3);

			// Get IDs
			const s1Live = yield* database.servers.getServerByDiscordId("s1");
			const s2Live = yield* database.servers.getServerByDiscordId("s2");
			const s3Live = yield* database.servers.getServerByDiscordId("s3");
			yield* TestClock.adjust("10 millis");

			const s1Id = s1Live?.data?._id;
			const s2Id = s2Live?.data?._id;
			const s3Id = s3Live?.data?._id;

			if (!s1Id || !s2Id || !s3Id) {
				throw new Error("Servers not found");
			}

			// Get many by IDs
			const liveData = yield* database.servers.findManyServersById([
				s1Id,
				s2Id,
				s3Id,
			]);
			yield* TestClock.adjust("10 millis");

			expect(liveData?.data?.length).toBe(3);

			// Update one server
			const updatedS1: Server = {
				...server1,
				name: "Updated Server 1",
			};
			yield* database.servers.updateServer(s1Id, updatedS1);
			yield* TestClock.adjust("10 millis");

			// LiveData should reflect the update
			const updatedServer = liveData?.data?.find((s) => s._id === s1Id);
			expect(updatedServer?.name).toBe("Updated Server 1");
			expect(liveData?.data?.length).toBe(3);
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"createServer throws error if server already exists",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Create server
			yield* database.servers.createServer(server);

			// Try to create again with same discordId - should fail
			const result = yield* database.servers
				.createServer(server)
				.pipe(Effect.exit);

			expect(Exit.isFailure(result)).toBe(true);
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"updateServer throws error if server does not exist",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Try to update non-existent server
			const fakeId = "j9z8y7x6w5v4u3t2s1r0q" as any;
			const result = yield* database.servers
				.updateServer(fakeId, server)
				.pipe(Effect.exit);

			expect(Exit.isFailure(result)).toBe(true);
		}).pipe(Effect.provide(DatabaseTestLayer)),
);
