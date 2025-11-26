import { Database } from "@packages/database/database";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { runtime } from "../../../lib/runtime";
import { UserPageClient } from "./user-page-client";

type Props = {
	params: Promise<{ userId: string }>;
	searchParams: Promise<{ s?: string }>;
};

export default async function UserPage(props: Props) {
	const params = await props.params;
	const searchParams = await props.searchParams;

	const pageData = await Effect.gen(function* () {
		const database = yield* Database;
		const [user, servers, postsResult] = yield* Effect.all([
			database.public.search.getUserById({ userId: params.userId }),
			database.public.search.getServersUserHasPostedIn({
				userId: params.userId,
			}),
			database.public.search.getUserPosts({
				userId: params.userId,
				serverId: searchParams.s,
				paginationOpts: { numItems: 10, cursor: null },
			}),
		]);
		if (!user) {
			return null;
		}
		return { user, servers, posts: postsResult.page };
	}).pipe(runtime.runPromise);

	if (!pageData) {
		return notFound();
	}

	return (
		<UserPageClient
			user={pageData.user}
			servers={pageData.servers}
			posts={pageData.posts}
			userId={params.userId}
			serverId={searchParams.s}
		/>
	);
}
