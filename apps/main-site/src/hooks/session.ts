"use client";

import { useQuery } from "@tanstack/react-query";

type AnonymousSessionResponse =
	| { token: string; sessionId: string; expiresAt: number }
	| { error: string };

export function useAnonymousSession() {
	return useQuery<AnonymousSessionResponse, Error>({
		queryKey: ["anonymous-session"],
		queryFn: async () => {
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
