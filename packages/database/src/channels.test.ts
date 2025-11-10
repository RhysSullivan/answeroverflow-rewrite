import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Channel, ChannelSettings, Server } from "../convex/schema";
import { Database, DatabaseTestLayer } from "./database";

const testServer: Server = {
	name: "Test Server",
	description: "Test Description",
	icon: "https://example.com/icon.png",
	vanityInviteCode: "test",
	vanityUrl: "test",
	discordId: "server123",
	plan: "FREE",
	approximateMemberCount: 0,
};

it.scoped("getChannelByDiscordId returns channel with flags decoded", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create server
		yield* database.servers.upsertServer(testServer);

		// Get the server LiveData to find its ID
		const serverLiveData =
			yield* database.servers.getServerByDiscordId("server123");
		const serverId = serverLiveData?.data?._id;

		if (!serverId) {
			throw new Error("Server not found");
		}

		const channel: Channel = {
			id: "channel123",
			serverId,
			name: "Test Channel",
			type: 0, // GuildText
			parentId: undefined,
			inviteCode: undefined,
			archivedTimestamp: undefined,
			solutionTagId: undefined,
			lastIndexedSnowflake: undefined,
		};

		const settings: ChannelSettings = {
			channelId: "channel123",
			indexingEnabled: false,
			markSolutionEnabled: false,
			sendMarkSolutionInstructionsInNewThreads: false,
			autoThreadEnabled: true,
			forumGuidelinesConsentEnabled: false,
		};

		// Insert channel with settings using database service
		yield* database.channels.upsertChannelWithSettings({
			channel,
			settings,
		});

		const liveData =
			yield* database.channels.getChannelByDiscordId("channel123");

		expect(liveData?.data).not.toBeNull();
		expect(liveData?.data?.id).toBe("channel123");
		expect(liveData?.data?.flags).toBeDefined();
		expect(liveData?.data?.flags.autoThreadEnabled).toBe(true);
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("getChannelByDiscordId returns null for non-existent channel", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		const liveData =
			yield* database.channels.getChannelByDiscordId("nonexistent");

		expect(liveData?.data).toBeNull();
	}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped(
	"getChannelByDiscordId correctly decodes autoThreadEnabled flag",
	() =>
		Effect.gen(function* () {
			const database = yield* Database;

			// Create server
			yield* database.servers.upsertServer(testServer);

			// Get the server LiveData to find its ID
			const serverLiveData =
				yield* database.servers.getServerByDiscordId("server123");
			const serverId = serverLiveData?.data?._id;

			if (!serverId) {
				throw new Error("Server not found");
			}

			const channelWithAutoThread: Channel = {
				id: "channel123",
				serverId,
				name: "Test Channel",
				type: 0, // GuildText
				parentId: undefined,
				inviteCode: undefined,
				archivedTimestamp: undefined,
				solutionTagId: undefined,
				lastIndexedSnowflake: undefined,
			};

			const settingsWithAutoThread: ChannelSettings = {
				channelId: "channel123",
				indexingEnabled: false,
				markSolutionEnabled: false,
				sendMarkSolutionInstructionsInNewThreads: false,
				autoThreadEnabled: true,
				forumGuidelinesConsentEnabled: false,
			};

			const channelWithoutAutoThread: Channel = {
				id: "channel456",
				serverId,
				name: "Test Channel 2",
				type: 0, // GuildText
				parentId: undefined,
				inviteCode: undefined,
				archivedTimestamp: undefined,
				solutionTagId: undefined,
				lastIndexedSnowflake: undefined,
			};

			// Insert channel with autoThreadEnabled flag
			yield* database.channels.upsertChannelWithSettings({
				channel: channelWithAutoThread,
				settings: settingsWithAutoThread,
			});

			const liveData1 =
				yield* database.channels.getChannelByDiscordId("channel123");

			expect(liveData1?.data?.flags.autoThreadEnabled).toBe(true);

			// Insert channel without settings (should default to false)
			yield* database.channels.upsertChannelWithSettings({
				channel: channelWithoutAutoThread,
			});

			const liveData2 =
				yield* database.channels.getChannelByDiscordId("channel456");

			expect(liveData2?.data?.flags.autoThreadEnabled).toBe(false);
		}).pipe(Effect.provide(DatabaseTestLayer)),
);

it.scoped("getChannelByDiscordId decodes all flags correctly", () =>
	Effect.gen(function* () {
		const database = yield* Database;

		// Create server
		yield* database.servers.upsertServer(testServer);

		// Get the server LiveData to find its ID
		const serverLiveData =
			yield* database.servers.getServerByDiscordId("server123");
		const serverId = serverLiveData?.data?._id;

		if (!serverId) {
			throw new Error("Server not found");
		}

		const channel: Channel = {
			id: "channel789",
			serverId,
			name: "Test Channel 3",
			type: 0, // GuildText
			parentId: undefined,
			inviteCode: undefined,
			archivedTimestamp: undefined,
			solutionTagId: undefined,
			lastIndexedSnowflake: undefined,
		};

		const settings: ChannelSettings = {
			channelId: "channel789",
			indexingEnabled: true,
			markSolutionEnabled: false,
			sendMarkSolutionInstructionsInNewThreads: false,
			autoThreadEnabled: true,
			forumGuidelinesConsentEnabled: false,
		};

		yield* database.channels.upsertChannelWithSettings({
			channel,
			settings,
		});

		const liveData =
			yield* database.channels.getChannelByDiscordId("channel789");

		expect(liveData?.data?.flags.indexingEnabled).toBe(true);
		expect(liveData?.data?.flags.markSolutionEnabled).toBe(false);
		expect(liveData?.data?.flags.sendMarkSolutionInstructionsInNewThreads).toBe(
			false,
		);
		expect(liveData?.data?.flags.autoThreadEnabled).toBe(true);
		expect(liveData?.data?.flags.forumGuidelinesConsentEnabled).toBe(false);
	}).pipe(Effect.provide(DatabaseTestLayer)),
);
