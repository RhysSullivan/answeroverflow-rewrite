import { Effect } from "effect";
import { ConvexClientTest } from "../convex-client-test";
import type {
	Attachment,
	Channel,
	ChannelSettings,
	DiscordAccount,
	Message,
	Server,
	ServerPreferences,
	UserServerSettings,
} from "../../convex/schema";
import {
	channel,
	channelSettings,
	discordAccount,
	message,
	server,
	serverPreferences,
	userServerSettings,
} from "./builders";

// Type-safe wrapper around the test client mutation calls
const callTestMutation = <T = void>(
	client: Effect.Effect.Success<typeof ConvexClientTest>,
	functionName: string,
	args: Record<string, unknown>,
): Effect.Effect<T, Error> =>
	Effect.promise(
		() =>
			client.client.mutation(
				`testHelpers/factories:${functionName}` as any,
				args,
			) as Promise<T>,
	).pipe(Effect.mapError((error) => new Error(String(error))));

/**
 * Creates a test server in the database and returns the server data and its ID.
 *
 * @example
 * const { server, serverId } = yield* createTestServer();
 * const { server, serverId } = yield* createTestServer({ name: "Custom Server" });
 */
export const createTestServer = (overrides?: Partial<Server>) =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		const testServer = server().build();
		const serverData = { ...testServer, ...overrides };

		yield* callTestMutation(convexClient, "testOnlyInsertServer", {
			server: serverData,
		});

		return { server: serverData, serverId: serverData.discordId };
	});

/**
 * Creates test server preferences in the database.
 *
 * @example
 * const { preferences } = yield* createTestServerPreferences({ serverId });
 */
export const createTestServerPreferences = (
	overrides?: Partial<ServerPreferences>,
) =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		const testPreferences = serverPreferences().build();
		const preferencesData = { ...testPreferences, ...overrides };

		const preferencesId = yield* callTestMutation(
			convexClient,
			"testOnlyInsertServerPreferences",
			{
				preferences: preferencesData,
			},
		);

		return { preferences: preferencesData, preferencesId };
	});

/**
 * Creates a test Discord account in the database.
 *
 * @example
 * const { account, accountId } = yield* createTestDiscordAccount();
 * const { account, accountId } = yield* createTestDiscordAccount({ name: "John" });
 */
export const createTestDiscordAccount = (overrides?: Partial<DiscordAccount>) =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		const testAccount = discordAccount().build();
		const accountData = { ...testAccount, ...overrides };

		yield* callTestMutation(convexClient, "testOnlyInsertDiscordAccount", {
			account: accountData,
		});

		return { account: accountData, accountId: accountData.id };
	});

/**
 * Creates a test channel in the database.
 *
 * @example
 * const { channel, channelId } = yield* createTestChannel({ serverId });
 */
export const createTestChannel = (overrides?: Partial<Channel>) =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		const testChannel = channel().build();
		const channelData = { ...testChannel, ...overrides };

		yield* callTestMutation(convexClient, "testOnlyInsertChannel", {
			channel: channelData,
		});

		return { channel: channelData, channelId: channelData.id };
	});

/**
 * Creates test channel settings in the database.
 *
 * @example
 * const { settings } = yield* createTestChannelSettings({ channelId, indexingEnabled: true });
 */
export const createTestChannelSettings = (
	overrides?: Partial<ChannelSettings>,
) =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		const testSettings = channelSettings().build();
		const settingsData = { ...testSettings, ...overrides };

		yield* callTestMutation(convexClient, "testOnlyInsertChannelSettings", {
			settings: settingsData,
		});

		return { settings: settingsData };
	});

/**
 * Creates a test message in the database.
 *
 * @example
 * const { message, messageId } = yield* createTestMessage({ serverId, channelId, authorId });
 */
export const createTestMessage = (opts: {
	serverId?: bigint;
	channelId?: bigint;
	authorId?: bigint;
	overrides?: Partial<Message>;
	attachments?: Array<Omit<Attachment, "url">>;
}) =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		const testMessage = message()
			.withServerId(opts.serverId ?? BigInt(0))
			.withChannelId(opts.channelId ?? BigInt(0))
			.withAuthorId(opts.authorId ?? BigInt(0))
			.build();

		const messageData = { ...testMessage, ...opts.overrides };

		yield* callTestMutation(convexClient, "testOnlyInsertMessage", {
			message: messageData,
			attachments: opts.attachments,
		});

		return { message: messageData, messageId: messageData.id };
	});

/**
 * Creates test user server settings in the database.
 *
 * @example
 * const { settings } = yield* createTestUserServerSettings({ serverId, userId });
 */
export const createTestUserServerSettings = (
	overrides?: Partial<UserServerSettings>,
) =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		const testSettings = userServerSettings().build();
		const settingsData = { ...testSettings, ...overrides };

		yield* callTestMutation(convexClient, "testOnlyInsertUserServerSettings", {
			settings: settingsData,
		});

		return { settings: settingsData };
	});

/**
 * Composable: Creates a server with channel and settings.
 *
 * @example
 * const { server, channel, settings } = yield* createTestServerWithChannel();
 */
export const createTestServerWithChannel = (opts?: {
	serverOverrides?: Partial<Server>;
	channelOverrides?: Partial<Channel>;
	settingsOverrides?: Partial<ChannelSettings>;
}) =>
	Effect.gen(function* () {
		const { server: serverData, serverId } = yield* createTestServer(
			opts?.serverOverrides,
		);
		const { channel: channelData, channelId } = yield* createTestChannel({
			serverId,
			...opts?.channelOverrides,
		});
		const { settings: settingsData } = yield* createTestChannelSettings({
			channelId,
			...opts?.settingsOverrides,
		});

		return {
			server: serverData,
			serverId,
			channel: channelData,
			channelId,
			settings: settingsData,
		};
	});

/**
 * Composable: Creates a complete message thread setup (server, channel, author, messages).
 *
 * @example
 * const { server, channel, author, messages } = yield* createTestServerWithMessages(5);
 */
export const createTestServerWithMessages = (messageCount: number = 3) =>
	Effect.gen(function* () {
		const { server: serverData, serverId } = yield* createTestServer();
		const { channel: channelData, channelId } = yield* createTestChannel({
			serverId,
		});
		const { account: authorData, accountId: authorId } =
			yield* createTestDiscordAccount();

		const messages = yield* Effect.all(
			Array.from({ length: messageCount }, (_, i) =>
				createTestMessage({
					serverId,
					channelId,
					authorId,
					overrides: { content: `Test message ${i + 1}` },
				}),
			),
		);

		return {
			server: serverData,
			serverId,
			channel: channelData,
			channelId,
			author: authorData,
			authorId,
			messages: messages.map((m) => m.message),
		};
	});

/**
 * Composable: Creates a server with browsable settings (enough consenting users or public messages enabled).
 *
 * @example
 * const { server, users } = yield* createTestBrowsableServer();
 */
export const createTestBrowsableServer = (consentingUserCount: number = 15) =>
	Effect.gen(function* () {
		const { server: serverData, serverId } = yield* createTestServer();

		const users = yield* Effect.all(
			Array.from({ length: consentingUserCount }, () =>
				Effect.gen(function* () {
					const { account, accountId } = yield* createTestDiscordAccount();
					yield* createTestUserServerSettings({
						serverId,
						userId: accountId,
						canPubliclyDisplayMessages: true,
					});
					return account;
				}),
			),
		);

		return { server: serverData, serverId, users };
	});

/**
 * Composable: Creates a message thread with starter message and thread messages.
 *
 * @example
 * const { server, channel, thread, starterMessage, threadMessages } = yield* createTestMessageThread();
 */
export const createTestMessageThread = (threadMessageCount: number = 3) =>
	Effect.gen(function* () {
		const { server: serverData, serverId } = yield* createTestServer();
		const { channel: parentChannel, channelId: parentChannelId } =
			yield* createTestChannel({ serverId });
		// Create channel settings for parent channel (required by getMessagePageData)
		yield* createTestChannelSettings({
			channelId: parentChannelId,
			indexingEnabled: true,
		});

		const { account: authorData, accountId: authorId } =
			yield* createTestDiscordAccount();

		// Create thread channel
		const { channel: threadChannel, channelId: threadId } =
			yield* createTestChannel({
				serverId,
				parentId: parentChannelId,
				type: 11, // Public thread
			});
		// Create channel settings for thread channel (required by getMessagePageData)
		yield* createTestChannelSettings({
			channelId: threadId,
			indexingEnabled: true,
		});

		// Create thread starter message
		const { message: starterMessage } = yield* createTestMessage({
			serverId,
			channelId: parentChannelId,
			authorId,
			overrides: {
				childThreadId: threadId,
				content: "Thread starter message",
			},
		});

		// Create messages in thread
		const threadMessages = yield* Effect.all(
			Array.from({ length: threadMessageCount }, (_, i) =>
				createTestMessage({
					serverId,
					channelId: threadId,
					authorId,
					overrides: {
						parentChannelId,
						content: `Thread message ${i + 1}`,
					},
				}),
			),
		);

		return {
			server: serverData,
			serverId,
			channel: parentChannel,
			channelId: parentChannelId,
			thread: threadChannel,
			threadId,
			author: authorData,
			authorId,
			starterMessage,
			threadMessages: threadMessages.map((m) => m.message),
		};
	});

/**
 * Deletes all test data from the database.
 * Use this in afterEach hooks or at the start of tests for cleanup.
 */
export const cleanupTestData = () =>
	Effect.gen(function* () {
		const convexClient = yield* ConvexClientTest;
		yield* callTestMutation(convexClient, "testOnlyClearAllData", {});
	});
