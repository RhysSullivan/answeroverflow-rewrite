import * as fc from "fast-check";

/**
 * Arbitraries for generating test data using fast-check.
 * These provide random but valid data for testing.
 */

// Discord snowflake ID as BigInt
const DISCORD_EPOCH = 1420070400000n;

export const discordSnowflakeBigInt = fc
	.tuple(
		fc.bigInt({ min: DISCORD_EPOCH, max: BigInt(Date.now()) }),
		fc.bigInt({ min: 0n, max: 31n }), // workerId
		fc.bigInt({ min: 0n, max: 31n }), // processId
		fc.bigInt({ min: 0n, max: 4095n }), // increment
	)
	.map(([timestampMs, workerId, processId, increment]) => {
		const timestamp = timestampMs - DISCORD_EPOCH;
		return (
			(timestamp << 22n) | (workerId << 17n) | (processId << 12n) | increment
		);
	});

// Server names
export const serverName = fc.oneof(
	fc.constant("Test Server"),
	fc.string({ minLength: 5, maxLength: 50 }).map((s) => `Server ${s}`),
	fc.constantFrom(
		"Gaming Community",
		"Developer Hub",
		"Study Group",
		"Art Collective",
		"Music Fans",
		"Tech Talk",
	),
);

// Discord usernames
export const discordUsername = fc.oneof(
	fc.string({ minLength: 3, maxLength: 20 }).map((s) => `User${s}`),
	fc.constantFrom(
		"Alice",
		"Bob",
		"Charlie",
		"Dave",
		"Eve",
		"Frank",
		"Grace",
		"Heidi",
	),
);

// Channel names
export const channelName = fc.oneof(
	fc
		.string({ minLength: 3, maxLength: 30 })
		.map((s) => `channel-${s.toLowerCase()}`),
	fc.constantFrom(
		"general",
		"random",
		"announcements",
		"help",
		"off-topic",
		"questions",
		"showcase",
	),
);

// Message content
export const messageContent = fc.oneof(
	fc.lorem({ maxCount: 3 }),
	fc.string({ minLength: 1, maxLength: 200 }),
	fc.constantFrom(
		"Hello, world!",
		"How are you?",
		"This is a test message",
		"Looking for help with...",
		"Check out this cool thing",
	),
);

// Avatar hashes (using deprecated API but works)
export const avatarHash = fc.string({ minLength: 32, maxLength: 32 }).map((s) =>
	s
		.split("")
		.map((c) => c.charCodeAt(0).toString(16))
		.join("")
		.slice(0, 32),
);

// Plan types
export const serverPlan = fc.constantFrom(
	"FREE" as const,
	"STARTER" as const,
	"ADVANCED" as const,
	"PRO" as const,
	"ENTERPRISE" as const,
	"OPEN_SOURCE" as const,
);

// Member counts
export const memberCount = fc.integer({ min: 1, max: 100000 });

// Channel types
export const channelType = fc.constantFrom(
	0, // Text channel
	2, // Voice channel
	4, // Category
	5, // Announcement channel
	10, // Announcement thread
	11, // Public thread
	12, // Private thread
	13, // Stage channel
	15, // Forum channel
);

// Permissions bitfield
export const permissions = fc
	.bigInt({ min: 0n, max: (1n << 53n) - 1n })
	.map(Number);

// File sizes
export const fileSize = fc.integer({ min: 0, max: 10 * 1024 * 1024 }); // Up to 10MB

// Filenames
export const filename = fc.oneof(
	fc.constantFrom(
		"image.png",
		"document.pdf",
		"screenshot.jpg",
		"code.ts",
		"data.json",
	),
	fc.string({ minLength: 5, maxLength: 30 }).map((s) => `${s}.txt`),
);

// Content types
export const contentType = fc.constantFrom(
	"image/png",
	"image/jpeg",
	"image/gif",
	"application/pdf",
	"text/plain",
	"application/json",
);

// Boolean values with bias
export const biasedBoolean = (trueWeight: number = 0.5) =>
	fc.boolean().map(() => Math.random() < trueWeight);

/**
 * Sample a single value from an arbitrary.
 * Useful for generating one-off test values.
 */
export function sample<T>(arbitrary: fc.Arbitrary<T>): T {
	const result = fc.sample(arbitrary, { numRuns: 1 })[0];
	if (result === undefined) {
		throw new Error("Failed to sample arbitrary");
	}
	return result;
}

/**
 * Sample multiple values from an arbitrary.
 */
export function sampleMany<T>(arbitrary: fc.Arbitrary<T>, count: number): T[] {
	return fc.sample(arbitrary, { numRuns: count });
}
