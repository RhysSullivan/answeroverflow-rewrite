import type {
	FunctionArgs,
	FunctionReference,
	FunctionReturnType,
	OptionalRestArgs,
} from "convex/server";
import { getFunctionName } from "convex/server";
import { Context, Effect, Exit, Layer, Request, RequestResolver } from "effect";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Channel, ChannelSettings, Server } from "../convex/schema";
import { ConvexClientHttpUnifiedLayer } from "./convex-client-http";
import {
	ConvexClientTestLayer,
	ConvexClientTestUnifiedLayer,
} from "./convex-client-test";
import type { ConvexClientShared } from "./convex-unified-client";
import { ConvexClientUnified, type ConvexError } from "./convex-unified-client";

export class LiveData<T> {
	private _data: T | undefined;
	private unsubscribe: (() => void) | undefined;

	constructor(
		getCurrentValue: () => T | undefined,
		onUpdate: (callback: () => void) => () => void,
		initialData?: T,
	) {
		this._data = initialData ?? getCurrentValue();

		// Set up automatic updates
		this.unsubscribe = onUpdate(() => {
			const newData = getCurrentValue();
			if (newData !== undefined) {
				this._data = newData;
			}
		});
	}

	get data(): T | undefined {
		return this._data;
	}

	destroy(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = undefined;
		}
	}
}

// Request type for watch subscriptions
interface WatchRequest<Query extends FunctionReference<"query">>
	extends Request.Request<LiveData<FunctionReturnType<Query>>, ConvexError> {
	readonly _tag: "WatchRequest";
	readonly query: Query;
	readonly args: FunctionArgs<Query>;
	readonly cacheKey: string;
}

// WeakMap to store cache keys for LiveData instances
const liveDataCacheKeys = new WeakMap<LiveData<unknown>, string>();

// Helper to create a watch request
const watchRequest = <Query extends FunctionReference<"query">>(
	query: Query,
	args: FunctionArgs<Query>,
): WatchRequest<Query> => {
	const functionName = getFunctionName(query);
	const cacheKey = JSON.stringify({ functionName, args });
	return Request.tagged<WatchRequest<Query>>("WatchRequest")({
		query,
		args,
		cacheKey,
	});
};

// Helper to extract args from OptionalRestArgs
// When args is empty, returns {} for queries with no args
const extractArgs = <Query extends FunctionReference<"query">>(
	args: OptionalRestArgs<Query>,
): FunctionArgs<Query> => (args[0] ?? {}) as FunctionArgs<Query>;

export const service = Effect.gen(function* () {
	const externalSecret = "hello"; //yield* Config.string("EXTERNAL_WRITE_SECRET");
	const convexClient = yield* ConvexClientUnified;

	// Map to store active watches and their reference counts
	// Cache key (function name + args) guarantees type safety at runtime
	type ActiveWatch = {
		liveData: LiveData<FunctionReturnType<FunctionReference<"query">>>;
		unsubscribe: () => void;
		refCount: number;
	};
	const activeWatches = new Map<string, ActiveWatch>();

	// Create a resolver for watch requests
	const watchResolver = RequestResolver.makeBatched(
		(requests: ReadonlyArray<WatchRequest<FunctionReference<"query">>>) =>
			Effect.gen(function* () {
				// Process each request
				for (const request of requests) {
					const { query, args, cacheKey } = request;

					// Check if we already have an active watch for this key
					const existing = activeWatches.get(cacheKey);
					if (existing) {
						existing.refCount++;
						// The cache key (function name + args) guarantees the stored LiveData
						// has the correct type for this request at runtime
						yield* Request.complete(request, Exit.succeed(existing.liveData));
						continue;
					}

					// Create new watch - handle errors at the request level
					const result = yield* Effect.suspend(() =>
						Effect.gen(function* () {
							const callbacks = new Set<() => void>();
							let currentValue: FunctionReturnType<typeof query> | undefined;

							// Get initial value synchronously
							currentValue = yield* convexClient.use(
								(client: ConvexClientShared) => {
									return client.query(query, args);
								},
							);

							// Set up watch for future updates
							const unsubscribe = yield* convexClient.use(
								(client: ConvexClientShared) => {
									return client.onUpdate(query, args, (result) => {
										currentValue = result;
										callbacks.forEach((cb) => cb());
									});
								},
							);

							const liveData = new LiveData<FunctionReturnType<typeof query>>(
								() => currentValue,
								(callback) => {
									callbacks.add(callback);
									return () => {
										callbacks.delete(callback);
									};
								},
								currentValue,
							);

							// Store in active watches
							activeWatches.set(cacheKey, {
								liveData,
								unsubscribe,
								refCount: 1,
							});

							return liveData;
						}),
					).pipe(Effect.exit);

					yield* Request.complete(request, result);
				}
			}),
	);

	const watchQueryToLiveData = <Query extends FunctionReference<"query">>(
		getQuery: (convexApi: {
			api: typeof api;
			internal: typeof internal;
		}) => Query,
		...args: OptionalRestArgs<Query>
	) => {
		return Effect.acquireRelease(
			Effect.gen(function* () {
				const query = getQuery({ api, internal });
				// Handle optional rest args - could be [] or [FunctionArgs<Query>]
				const queryArgs = extractArgs(args);
				const request = watchRequest(query, queryArgs);

				// Use the resolver with the request - deduplication happens automatically
				const liveData = yield* Effect.request(request, watchResolver);

				// Store cache key in WeakMap for cleanup
				liveDataCacheKeys.set(liveData, request.cacheKey);

				return liveData;
			}),
			(liveData) =>
				Effect.sync(() => {
					const cacheKey = liveDataCacheKeys.get(liveData);
					if (cacheKey) {
						const watch = activeWatches.get(cacheKey);
						if (watch) {
							watch.refCount--;
							if (watch.refCount === 0) {
								watch.unsubscribe();
								activeWatches.delete(cacheKey);
							}
						}
						liveDataCacheKeys.delete(liveData);
					}
					liveData.destroy();
				}),
		);
	};

	const upsertServer = (data: Server) =>
		convexClient.use(
			(
				client: ConvexClientShared,
				convexApi: { api: typeof api; internal: typeof internal },
			) =>
				client.mutation(convexApi.api.servers.upsertServerExternal, {
					data,
					apiKey: externalSecret,
				}),
		);

	const createServer = (data: Server) =>
		convexClient.use(
			(
				client: ConvexClientShared,
				convexApi: { api: typeof api; internal: typeof internal },
			) =>
				client.mutation(convexApi.api.servers.createServerExternal, {
					data,
					apiKey: externalSecret,
				}),
		);

	const updateServer = (id: Id<"servers">, data: Server) =>
		convexClient.use(
			(
				client: ConvexClientShared,
				convexApi: { api: typeof api; internal: typeof internal },
			) =>
				client.mutation(convexApi.api.servers.updateServerExternal, {
					id,
					data,
					apiKey: externalSecret,
				}),
		);

	const getServerById = (id: Id<"servers">) =>
		watchQueryToLiveData(({ api }) => api.servers.publicGetServerById, {
			id,
		});

	const getServerByDiscordId = (discordId: string) =>
		watchQueryToLiveData(({ api }) => api.servers.publicGetServerByDiscordId, {
			discordId,
		});

	const findServerByAlias = (alias: string) =>
		watchQueryToLiveData(({ api }) => api.servers.publicFindServerByAlias, {
			alias,
		});

	const findServerByAliasOrId = (aliasOrId: string) =>
		watchQueryToLiveData(({ api }) => api.servers.publicFindServerByAliasOrId, {
			aliasOrId,
		});

	const findServerByCustomDomain = (domain: string) =>
		watchQueryToLiveData(
			({ api }) => api.servers.publicFindServerByCustomDomain,
			{
				domain,
			},
		);

	const findServerByStripeCustomerId = (stripeCustomerId: string) =>
		watchQueryToLiveData(
			({ api }) => api.servers.publicFindServerByStripeCustomerId,
			{
				stripeCustomerId,
			},
		);

	const findServerByStripeSubscriptionId = (stripeSubscriptionId: string) =>
		watchQueryToLiveData(
			({ api }) => api.servers.publicFindServerByStripeSubscriptionId,
			{
				stripeSubscriptionId,
			},
		);

	const findManyServersById = (ids: Id<"servers">[]) =>
		watchQueryToLiveData(({ api }) => api.servers.publicFindManyServersById, {
			ids,
		});

	const getBiggestServers = (take: number) =>
		watchQueryToLiveData(({ api }) => api.servers.publicGetBiggestServers, {
			take,
		});

	const findServerByIdWithChannels = (id: Id<"servers">) =>
		watchQueryToLiveData(
			({ api }) => api.servers.publicFindServerByIdWithChannels,
			{
				id,
			},
		);

	const publicGetAllServers = () =>
		watchQueryToLiveData(({ api }) => api.servers.publicGetAllServers, {});

	const getChannelByDiscordId = (discordId: string) =>
		watchQueryToLiveData(({ api }) => api.channels.getChannelByDiscordId, {
			discordId,
		});

	const upsertChannelWithSettings = (data: {
		channel: Channel;
		settings?: ChannelSettings;
	}) =>
		convexClient.use(
			(
				client: ConvexClientShared,
				convexApi: { api: typeof api; internal: typeof internal },
			) =>
				client.mutation(convexApi.api.channels.upsertChannelWithSettings, {
					channel: data.channel,
					settings: data.settings,
				}),
		);

	return {
		servers: {
			upsertServer,
			createServer,
			updateServer,
			getServerById,
			getServerByDiscordId,
			findServerByAlias,
			findServerByAliasOrId,
			findServerByCustomDomain,
			findServerByStripeCustomerId,
			findServerByStripeSubscriptionId,
			findManyServersById,
			getBiggestServers,
			findServerByIdWithChannels,
			publicGetAllServers,
		},
		channels: {
			getChannelByDiscordId,
			upsertChannelWithSettings,
		},
	};
});

export class Database extends Context.Tag("Database")<
	Database,
	Effect.Effect.Success<typeof service>
>() {}

export const DatabaseLayer = Layer.effect(Database, service).pipe(
	Layer.provide(ConvexClientHttpUnifiedLayer),
);

export const DatabaseTestLayer = Layer.mergeAll(
	Layer.effect(Database, service).pipe(
		Layer.provide(ConvexClientTestUnifiedLayer),
	),
	ConvexClientTestLayer,
);
