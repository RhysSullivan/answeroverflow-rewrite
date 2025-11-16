import type { Context } from "hono";

import { handleAnonymousJWKS } from "./handle-anonymous-jwks";
import { handleAnonymousOpenIDConfig } from "./handle-anonymous-openid-config";
import { handleAnonymousSession } from "./handle-anonymous-session";

export async function handleAuth(c: Context) {
	const { nextJsHandler } = await import("@convex-dev/better-auth/nextjs");

	const method = c.req.method;
	const request = c.req.raw;

	if (request.url.endsWith("/auth/anonymous-session")) {
		return handleAnonymousSession(c);
	}

	if (request.url.endsWith("/auth/anonymous-session/jwks")) {
		return handleAnonymousJWKS(c);
	}

	if (
		request.url.endsWith(
			"/auth/anonymous-session/.well-known/openid-configuration",
		)
	) {
		return handleAnonymousOpenIDConfig(c);
	}

	const convexSiteUrl =
		process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
		process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.cloud$/, ".site");

	if (!convexSiteUrl) {
		console.error(
			"NEXT_PUBLIC_CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_URL not set",
		);
		return c.text("Configuration error", 500);
	}

	const handler = nextJsHandler({ convexSiteUrl });

	const requestUrl = new URL(request.url);
	console.log("passing to nextjs handler", {
		originalUrl: request.url,
		pathname: requestUrl.pathname,
		convexSiteUrl,
		constructedUrl: `${convexSiteUrl}${requestUrl.pathname}${requestUrl.search}`,
		method,
	});

	if (method === "GET") {
		return handler.GET(request);
	}
	if (method === "POST") {
		return handler.POST(request);
	}

	return c.text("Method not allowed", 405);
}
