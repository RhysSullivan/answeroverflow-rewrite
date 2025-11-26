import { convexTest } from "@packages/convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("backend auth", () => {
	test("publicQuery allows backend auth without DB lookup", async () => {
		const t = convexTest(schema, modules);

		const asBackend = t.withIdentity({
			subject: "backend",
			issuer: "https://example.com",
			audience: "backend",
		});

		const result = await asBackend.query(api.public.search.getUserById, {
			userId: "123456789",
		});

		expect(result).toBeNull();
	});

	test("backend auth can query multiple public endpoints", async () => {
		const t = convexTest(schema, modules);

		const asBackend = t.withIdentity({
			subject: "backend",
			issuer: "https://example.com",
			audience: "backend",
		});

		const servers = await asBackend.query(
			api.public.search.getServersUserHasPostedIn,
			{ userId: "123456789" },
		);

		expect(servers).toEqual([]);
	});

	test("publicQuery rejects unauthenticated requests", async () => {
		const t = convexTest(schema, modules);

		await expect(
			t.query(api.public.search.getUserById, {
				userId: "123456789",
			}),
		).rejects.toThrow("Not authenticated");
	});

	test("publicQuery allows anonymous auth with valid session", async () => {
		const t = convexTest(schema, modules);

		const sessionId = "test-session-id";
		await t.run(async (ctx) => {
			await ctx.db.insert("anonymousSessions", {
				sessionId,
				createdAt: Date.now(),
				expiresAt: Date.now() + 1000 * 60 * 60,
			});
		});

		const asAnonymous = t.withIdentity({
			subject: sessionId,
			issuer: "https://example.com",
			type: "anonymous",
		});

		const result = await asAnonymous.query(api.public.search.getUserById, {
			userId: "123456789",
		});

		expect(result).toBeNull();
	});

	test("publicQuery rejects anonymous auth with invalid session", async () => {
		const t = convexTest(schema, modules);

		const asAnonymous = t.withIdentity({
			subject: "non-existent-session",
			issuer: "https://example.com",
			type: "anonymous",
		});

		await expect(
			asAnonymous.query(api.public.search.getUserById, {
				userId: "123456789",
			}),
		).rejects.toThrow("Not authenticated");
	});
});
