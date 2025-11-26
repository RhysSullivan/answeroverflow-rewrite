import { v } from "convex/values";
import { asyncMap } from "convex-helpers";
import { getOneFrom } from "convex-helpers/server/relationships";
import { Array as Arr, Predicate } from "effect";
import { privateMutation, privateQuery } from "../client";
import { planValidator, serverSchema } from "../schema";

export const upsertServer = privateMutation({
	args: serverSchema,
	handler: async (ctx, args) => {
		const existing = await getOneFrom(
			ctx.db,
			"servers",
			"by_discordId",
			args.discordId,
		);
		if (existing) {
			return await ctx.db.patch(existing._id, args);
		}
		return await ctx.db.insert("servers", args);
	},
});

export const getAllServers = privateQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("servers").collect();
	},
});

export const getServerByDiscordId = privateQuery({
	args: {
		discordId: v.int64(),
	},
	handler: async (ctx, args) => {
		return getOneFrom(ctx.db, "servers", "by_discordId", args.discordId);
	},
});

export const findManyServersById = privateQuery({
	args: {
		ids: v.array(v.id("servers")),
	},
	handler: async (ctx, args) => {
		if (args.ids.length === 0) return [];

		const servers = [];
		for (const id of args.ids) {
			const server = await ctx.db.get(id);
			if (server) {
				servers.push(server);
			}
		}
		return servers;
	},
});

export const findManyServersByDiscordId = privateQuery({
	args: {
		discordIds: v.array(v.int64()),
	},
	handler: async (ctx, args) => {
		if (args.discordIds.length === 0) return [];
		const servers = await asyncMap(args.discordIds, (discordId) =>
			ctx.db
				.query("servers")
				.withIndex("by_discordId", (q) => q.eq("discordId", discordId))
				.first(),
		);
		return Arr.filter(servers, Predicate.isNotNullable);
	},
});

export const clearKickedTime = privateMutation({
	args: {
		id: v.id("servers"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error(`Server with id ${args.id} not found`);
		}
		await ctx.db.patch(args.id, { kickedTime: undefined });
		return args.id;
	},
});

// TODO: Just have upsert get rid of this
export const updateServer = privateMutation({
	args: {
		id: v.id("servers"),
		data: serverSchema,
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.id);
		if (!existing) {
			throw new Error(`Server with id ${args.id} not found`);
		}

		await ctx.db.patch(args.id, args.data);
		return args.id;
	},
});

export const findByDiscordId = privateQuery({
	args: {
		discordServerId: v.int64(),
	},
	handler: async (ctx, args) => {
		return getOneFrom(ctx.db, "servers", "by_discordId", args.discordServerId);
	},
});

export const updateStripeCustomer = privateMutation({
	args: {
		serverId: v.int64(),
		stripeCustomerId: v.string(),
	},
	handler: async (ctx, args) => {
		const server = await getOneFrom(
			ctx.db,
			"servers",
			"by_discordId",
			args.serverId,
		);

		if (!server) {
			throw new Error("Server not found");
		}

		await ctx.db.patch(server._id, {
			stripeCustomerId: args.stripeCustomerId,
		});
	},
});

export const updateStripeSubscription = privateMutation({
	args: {
		serverId: v.int64(),
		stripeSubscriptionId: v.union(v.string(), v.null()),
		plan: planValidator,
	},
	handler: async (ctx, args) => {
		const server = await getOneFrom(
			ctx.db,
			"servers",
			"by_discordId",
			args.serverId,
		);

		if (!server) {
			throw new Error("Server not found");
		}

		await ctx.db.patch(server._id, {
			stripeSubscriptionId: args.stripeSubscriptionId ?? undefined,
			plan: args.plan,
		});
	},
});

export const findServerByStripeCustomerId = privateQuery({
	args: {
		stripeCustomerId: v.string(),
	},
	handler: async (ctx, args) => {
		return getOneFrom(
			ctx.db,
			"servers",
			"by_stripeCustomerId",
			args.stripeCustomerId,
		);
	},
});
