"use client";

import { useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";

type AnonymousSessionResponse =
	| { message: "Anonymous session" }
	| { error: string };

export function useAnonymousSession() {
	const client = useConvex();
	return useQuery<AnonymousSessionResponse, Error>({
		queryKey: ["anonymous-session"],
		queryFn: async () => {
			client.setAuth;
			const response = await fetch("/api/auth/anonymous-session");
			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error ?? "Failed to verify session");
			}
			return await response.json();
		},
		retry: false,
	});
}
