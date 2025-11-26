import { Database } from "@packages/database/database";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { runtime } from "../../../../lib/runtime";
import { UserCommentsPageClient } from "./user-comments-client";

type Props = {
	params: Promise<{ userId: string }>;
	searchParams: Promise<{ s?: string }>;
};

export default async function UserCommentsPage(props: Props) {
	const params = await props.params;
	const searchParams = await props.searchParams;

	const pageData = await Effect.gen(function* () {
		const database = yield* Database;
		const [user, servers, commentsResult] = yield* Effect.all([
			database.public.search.getUserById({ userId: params.userId }),
			database.public.search.getServersUserHasPostedIn({
				userId: params.userId,
			}),
			database.public.search.getUserComments({
				userId: params.userId,
				serverId: searchParams.s,
				paginationOpts: { numItems: 10, cursor: null },
			}),
		]);
		if (!user) {
			return null;
		}
		return { user, servers, comments: commentsResult.page };
	}).pipe(runtime.runPromise);

	if (!pageData) {
		return notFound();
	}

	return (
		<UserCommentsPageClient
			user={pageData.user}
			servers={pageData.servers}
			comments={pageData.comments}
			userId={params.userId}
			serverId={searchParams.s}
		/>
	);
}
