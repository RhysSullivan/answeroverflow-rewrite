import { Database, DatabaseLayer } from "@packages/database/database";
import { createOtelLayer } from "@packages/observability/effect-otel";
import { checkBotId } from "botid/server";
import { Effect, Layer } from "effect";
import type { Context } from "hono";

const OtelLayer = createOtelLayer("main-site");

export async function handleAnonymousSession(c: Context) {
	const verification = await checkBotId({
		developmentOptions: {
			bypass: process.env.NODE_ENV === "development" ? "HUMAN" : undefined,
		},
	});
	if (!verification.isHuman) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	const sesssion = await Effect.gen(function* () {
		const db = yield* Database;
		return yield* db.anonymous_session.createAnonymousSession();
	}).pipe(
		Effect.provide(Layer.mergeAll(DatabaseLayer, OtelLayer)),
		Effect.runPromise,
	);

	return c.json(sesssion);
}
