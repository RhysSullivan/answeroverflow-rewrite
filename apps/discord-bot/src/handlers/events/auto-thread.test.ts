import { expect, it } from "@effect/vitest";
import type { Message } from "discord.js";
import { ChannelType, MessageType } from "discord.js";
import { describe } from "vitest";
import { Effect } from "effect";
import { handleAutoThread } from "./auto-thread";

type ChannelWithFlags = {
	flags: {
		autoThreadEnabled: boolean;
	};
};

describe("handleAutoThread", () => {
	const createMockMessage = (overrides: Partial<Message> = {}): Message => {
		const defaultMessage = {
			author: {
				bot: false,
				system: false,
				displayName: "TestUser",
			},
			member: {
				nickname: null,
			},
			channel: {
				type: ChannelType.GuildText,
			},
			type: MessageType.Default,
			thread: null,
			content: "Test message",
			cleanContent: "Test message",
			attachments: {
				size: 0,
				first: () => null,
			},
			startThread: async () => {
				return {} as Awaited<ReturnType<Message["startThread"]>>;
			},
		};

		return { ...defaultMessage, ...overrides } as unknown as Message;
	};

	it("returns early when channelSettings is null", () =>
		Effect.gen(function* () {
			const message = createMockMessage();
			const result = yield* handleAutoThread(null, message);
			expect(result).toBeUndefined();
		}));

	it("returns early when autoThreadEnabled is false", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: false,
				},
			};
			const message = createMockMessage();
			const result = yield* handleAutoThread(channelSettings, message);
			expect(result).toBeUndefined();
		}));

	it("returns early when channel type is not allowed", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			const message = createMockMessage({
				channel: {
					type: ChannelType.DM,
				},
			});
			const result = yield* handleAutoThread(channelSettings, message);
			expect(result).toBeUndefined();
		}));

	it("allows GuildText channel type", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadCreated = false;
			const message = createMockMessage({
				channel: {
					type: ChannelType.GuildText,
				},
				startThread: async () => {
					threadCreated = true;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadCreated).toBe(true);
		}));

	it("allows GuildAnnouncement channel type", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadCreated = false;
			const message = createMockMessage({
				channel: {
					type: ChannelType.GuildAnnouncement,
				},
				startThread: async () => {
					threadCreated = true;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadCreated).toBe(true);
		}));

	it("returns early when message is from a bot", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			const message = createMockMessage({
				author: {
					bot: true,
					system: false,
					displayName: "BotUser",
				},
			});
			const result = yield* handleAutoThread(channelSettings, message);
			expect(result).toBeUndefined();
		}));

	it("returns early when message is from a system", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			const message = createMockMessage({
				author: {
					bot: false,
					system: true,
					displayName: "System",
				},
			});
			const result = yield* handleAutoThread(channelSettings, message);
			expect(result).toBeUndefined();
		}));

	it("returns early when message type is not Default", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			const message = createMockMessage({
				type: MessageType.Reply,
			});
			const result = yield* handleAutoThread(channelSettings, message);
			expect(result).toBeUndefined();
		}));

	it("returns early when message is already in a thread", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			const message = createMockMessage({
				thread: {
					id: "123456789",
				},
			});
			const result = yield* handleAutoThread(channelSettings, message);
			expect(result).toBeUndefined();
		}));

	it("creates thread with correct title format", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const message = createMockMessage({
				content: "Hello world",
				cleanContent: "Hello world",
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName).toBe("TestUser - Hello world");
		}));

	it("uses nickname when available", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const message = createMockMessage({
				member: {
					nickname: "CoolNickname",
				},
				content: "Hello world",
				cleanContent: "Hello world",
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName).toBe("CoolNickname - Hello world");
		}));

	it("uses displayName when nickname is not available", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const message = createMockMessage({
				member: {
					nickname: null,
				},
				author: {
					bot: false,
					system: false,
					displayName: "DisplayNameUser",
				},
				content: "Hello world",
				cleanContent: "Hello world",
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName).toBe("DisplayNameUser - Hello world");
		}));

	it("removes markdown from thread title", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const message = createMockMessage({
				content: "*bold* _italic_ ~strike~ `code`",
				cleanContent: "*bold* _italic_ ~strike~ `code`",
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName).toBe("TestUser - bold italic strike code");
		}));

	it("truncates thread title when longer than 47 characters", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const longContent = "A".repeat(50);
			const message = createMockMessage({
				content: longContent,
				cleanContent: longContent,
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName.length).toBe(50); // First 47 chars + "..." (3) = 50
			expect(threadName).toMatch(/^TestUser - .{36}\.\.\.$/);
		}));

	it("uses attachment name when message has no content but has attachments", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const message = createMockMessage({
				content: "",
				cleanContent: "",
				attachments: {
					size: 1,
					first: () => ({
						name: "image.png",
					}),
				},
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName).toBe("TestUser - image.png");
		}));

	it("uses 'Attachment' when attachment has no name", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const message = createMockMessage({
				content: "",
				cleanContent: "",
				attachments: {
					size: 1,
					first: () => ({
						name: null,
					}),
				},
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName).toBe("TestUser - Attachment");
		}));

	it("uses message content when message has both content and attachments", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadName = "";
			const message = createMockMessage({
				content: "Check out this image",
				cleanContent: "Check out this image",
				attachments: {
					size: 1,
					first: () => ({
						name: "image.png",
					}),
				},
				startThread: async (options) => {
					threadName = options.name;
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadName).toBe("TestUser - Check out this image");
		}));

	it("sets correct reason for thread creation", () =>
		Effect.gen(function* () {
			const channelSettings: ChannelWithFlags = {
				flags: {
					autoThreadEnabled: true,
				},
			};
			let threadReason = "";
			const message = createMockMessage({
				startThread: async (options) => {
					threadReason = options.reason ?? "";
					return {} as Awaited<ReturnType<Message["startThread"]>>;
				},
			});
			yield* handleAutoThread(channelSettings, message);
			expect(threadReason).toBe("Answer Overflow auto thread");
		}));
});
