import { boundedErrorBody, isRecord, requestSignal, text, type FetchLike, type WebResult } from "./types.ts";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export async function searchTavily(
	query: string,
	count: number,
	apiKey: string,
	signal?: AbortSignal,
	fetchImpl: FetchLike = fetch,
): Promise<WebResult[]> {
	const response = await fetchImpl(TAVILY_SEARCH_URL, {
		method: "POST",
		redirect: "error",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({ query, max_results: count }),
		signal: requestSignal(signal),
	});
	if (!response.ok) throw new Error(`Tavily HTTP ${response.status}: ${await boundedErrorBody(response, apiKey)}`);

	const payload: unknown = await response.json();
	if (!isRecord(payload)) throw new Error("Tavily returned an unexpected response format.");
	if (payload.results === undefined || payload.results === null) return [];
	if (!Array.isArray(payload.results)) throw new Error("Tavily returned an unexpected response format.");
	return payload.results.filter(isRecord).map((result) => ({
		title: text(result.title),
		url: text(result.url),
		summary: text(result.content),
	}));
}
