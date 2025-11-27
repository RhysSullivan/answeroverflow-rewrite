import * as fc from "fast-check";

/**
 * Arbitraries for generating test data using fast-check.
 * These provide random but valid data for testing.
 */

// Discord snowflake ID as BigInt - just a large number
export const snowflakeBigInt = fc.bigInt({
	min: 100000n,
	max: 999999999999999999n,
});

// Simple text arbitraries
export const serverName = fc.string({ minLength: 3, maxLength: 30 });
export const username = fc.string({ minLength: 3, maxLength: 20 });
export const channelName = fc.string({ minLength: 3, maxLength: 30 });
export const messageContent = fc.string({ minLength: 1, maxLength: 200 });

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
