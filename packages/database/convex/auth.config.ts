export default {
	providers: [
		{
			domain: process.env.CONVEX_SITE_URL,
			applicationID: "convex",
		},
		{
			domain: process.env.ANONYMOUS_AUTH_DOMAIN ?? process.env.SITE_URL,
			applicationID: "anonymous",
		},
		{
			domain: process.env.BACKEND_AUTH_DOMAIN ?? process.env.SITE_URL,
			applicationID: "backend",
		},
	],
};
