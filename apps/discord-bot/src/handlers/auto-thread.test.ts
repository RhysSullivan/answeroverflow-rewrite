import { expect, it } from "@effect/vitest";
import type { Message, TextChannel } from "discord.js";
import { ChannelType, MessageType } from "discord.js";
import { Effect, TestClock } from "effect";
import { describe } from "vitest";
import { handleAutoThread } from "../handlers/auto-thread";

describe("handleAutoThread", () => {
	const createMockMessage = (overrides: Partial<Message> = {}): Message => {
		return {
			channel: {
				type: ChannelType.GuildText,
			} as TextChannel,
			author: {
				bot: false,
				system: false,
				displayName: "TestUser",
			},
			member: {
				nickname: null,
			},
			type: MessageType.Default,
			thread: null,
			cleanContent: "Test message",
			content: "Test message",
			attachments: {
				size: 0,
				first: () => null,
			},
			startThread: async () => {
				return {} as any;
			},
			...overrides,
		} as unknown as Message;
	};

	it.scoped("creates thread when channel has autoThreadEnabled flag", () =>
		Effect.gen(function* () {
			let threadCreated = false;
			const mockMessage = createMockMessage({
				startThread: async () => {
					threadCreated = true;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadCreated).toBe(true);
		}),
	);

	it.scoped("skips when flag is disabled", () =>
		Effect.gen(function* () {
			let threadCreated = false;
			const mockMessage = createMockMessage({
				startThread: async () => {
					threadCreated = true;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: false,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadCreated).toBe(false);
		}),
	);

	it.scoped("skips when channel settings are null", () =>
		Effect.gen(function* () {
			let threadCreated = false;
			const mockMessage = createMockMessage({
				startThread: async () => {
					threadCreated = true;
					return {} as any;
				},
			});

			yield* handleAutoThread(null, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadCreated).toBe(false);
		}),
	);

	it.scoped("skips for unsupported channel types", () =>
		Effect.gen(function* () {
			let threadCreated = false;
			const mockMessage = createMockMessage({
				channel: {
					type: ChannelType.DM,
				} as TextChannel,
				startThread: async () => {
					threadCreated = true;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadCreated).toBe(false);
		}),
	);

	it.scoped("skips for bot messages", () =>
		Effect.gen(function* () {
			let threadCreated = false;
			const mockMessage = createMockMessage({
				author: {
					bot: true,
					system: false,
					displayName: "BotUser",
				},
				startThread: async () => {
					threadCreated = true;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadCreated).toBe(false);
		}),
	);

	it.scoped("skips when message already in thread", () =>
		Effect.gen(function* () {
			let threadCreated = false;
			const mockMessage = createMockMessage({
				thread: {
					id: "123",
				} as any,
				startThread: async () => {
					threadCreated = true;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadCreated).toBe(false);
		}),
	);

	it.scoped("formats thread title correctly", () =>
		Effect.gen(function* () {
			let threadName = "";
			const mockMessage = createMockMessage({
				cleanContent: "This is a test message",
				startThread: async (options: { name: string }) => {
					threadName = options.name;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadName).toBe("TestUser - This is a test message");
		}),
	);

	it.scoped("truncates thread title to 47 chars", () =>
		Effect.gen(function* () {
			let threadName = "";
			const longMessage = "A".repeat(100);
			const mockMessage = createMockMessage({
				cleanContent: longMessage,
				startThread: async (options: { name: string }) => {
					threadName = options.name;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadName.length).toBe(50); // 47 + "..."
			expect(threadName.endsWith("...")).toBe(true);
		}),
	);

	it.scoped("uses attachment name when no content", () =>
		Effect.gen(function* () {
			let threadName = "";
			const mockMessage = createMockMessage({
				content: "",
				cleanContent: "",
				attachments: {
					size: 1,
					first: () =>
						({
							name: "test-file.png",
						}) as any,
				},
				startThread: async (options: { name: string }) => {
					threadName = options.name;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadName).toBe("TestUser - test-file.png");
		}),
	);

	it.scoped("removes markdown from thread title", () =>
		Effect.gen(function* () {
			let threadName = "";
			const mockMessage = createMockMessage({
				cleanContent: "*bold* _italic_ `code`",
				startThread: async (options: { name: string }) => {
					threadName = options.name;
					return {} as any;
				},
			});

			const channelSettings = {
				flags: {
					autoThreadEnabled: true,
				},
			};

			yield* handleAutoThread(channelSettings, mockMessage);
			yield* TestClock.adjust("10 millis");

			expect(threadName).toBe("TestUser - bold italic code");
		}),
	);
});
