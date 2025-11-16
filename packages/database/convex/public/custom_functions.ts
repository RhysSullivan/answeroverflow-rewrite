/** biome-ignore-all lint/style/noRestrictedImports: This is where we put the custom functions so need to consume them */
import { v } from "convex/values";
import {
	customAction,
	customMutation,
	customQuery,
} from "convex-helpers/server/customFunctions";
import { action, mutation, query } from "../_generated/server";
import { getDiscordAccountIdFromAuth } from "../shared/auth";
import { getAuthIdentity } from "../shared/authIdentity";

const ANONYMOUS_AUTH_APPLICATION_ID = "anonymous";

export const publicQuery = customQuery(query, {
	args: {
		discordAccountId: v.optional(v.string()),
		anonymousSessionId: v.optional(v.string()),
	},
	// @ts-expect-error
	input: async (ctx, args) => {
		const identity = await getAuthIdentity(ctx);

		console.log("identity", identity);
		if (!identity) {
			throw new Error("Not authenticated");
		}

		const identityType = identity.type;
		const subject = identity.subject;

		if (identityType === "anonymous" && subject) {
			const anonymousSession = await ctx.db
				.query("anonymousSessions")
				.withIndex("by_sessionId", (q) => q.eq("sessionId", subject))
				.first();

			if (!anonymousSession) {
				throw new Error("Not authenticated");
			}

			return {
				ctx,
				args: {
					...args,
					anonymousSessionId: anonymousSession._id,
					discordAccountId: undefined,
				},
			};
		}

		if (identityType !== "anonymous") {
			const discordAccountId = await getDiscordAccountIdFromAuth(ctx);
			if (discordAccountId) {
				return {
					ctx,
					args: {
						...args,
						discordAccountId,
						anonymousSessionId: undefined,
					},
				};
			}
		}

		throw new Error("Not authenticated");
	},
});

export const publicMutation = customMutation(mutation, {
	args: {
		discordAccountId: v.optional(v.string()),
	},
	input: async (ctx, args) => {
		const identity = await getAuthIdentity(ctx);

		if (!identity || identity.audience !== "convex") {
			throw new Error("Not authenticated or Discord account not linked");
		}

		const discordAccountId = await getDiscordAccountIdFromAuth(ctx);
		if (!discordAccountId) {
			throw new Error("Not authenticated or Discord account not linked");
		}

		return {
			ctx,
			args: {
				...args,
				discordAccountId,
			},
		};
	},
});

export const publicAction = customAction(action, {
	args: {
		discordAccountId: v.optional(v.string()),
	},
	input: async (ctx, args) => {
		const identity = await getAuthIdentity(ctx);

		if (!identity || identity.audience !== "convex") {
			throw new Error("Not authenticated or Discord account not linked");
		}

		const discordAccountId = await getDiscordAccountIdFromAuth(ctx);
		if (!discordAccountId) {
			throw new Error("Not authenticated or Discord account not linked");
		}

		return {
			ctx,
			args: {
				...args,
				discordAccountId,
			},
		};
	},
});
