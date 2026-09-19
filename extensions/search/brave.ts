import { boundedErrorBody, isRecord, requestSignal, text, type FetchLike, type WebResult } from "./types.ts";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_MAX_RESULTS = 20;
const BRAVE_MAX_QUERY_LENGTH = 400;

export async function searchBrave(
	query: string,
	count: number,
	apiKey: string,
	signal?: AbortSignal,
	fetchImpl: FetchLike = fetch,
): Promise<WebResult[]> {
	const url = new URL(BRAVE_SEARCH_URL);
	url.searchParams.set("q", query.trim().slice(0, BRAVE_MAX_QUERY_LENGTH));
	url.searchParams.set("count", String(Math.min(count, BRAVE_MAX_RESULTS)));
	url.searchParams.set("text_decorations", "false");
	const response = await fetchImpl(url, {
		redirect: "error",
		headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
		signal: requestSignal(signal),
	});
	if (!response.ok) throw new Error(`Brave Search HTTP ${response.status}: ${await boundedErrorBody(response, apiKey)}`);

	const payload: unknown = await response.json();
	if (!isRecord(payload)) throw new Error("Brave Search returned an unexpected response format.");
	if (payload.web === undefined || payload.web === null) return [];
	if (!isRecord(payload.web)) throw new Error("Brave Search returned an unexpected response format.");
	const results = payload.web.results;
	if (results === undefined || results === null) return [];
	if (!Array.isArray(results)) throw new Error("Brave Search returned an unexpected response format.");
	return results.filter(isRecord).map((result) => ({
		title: text(result.title),
		url: text(result.url),
		summary: text(result.description),
	}));
}
