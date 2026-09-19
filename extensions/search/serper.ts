import { boundedErrorBody, isRecord, requestSignal, text, type FetchLike, type WebResult } from "./types.ts";

const SERPER_SEARCH_URL = "https://google.serper.dev/search";
const SERPER_MAX_RESULTS = 10;
const SERPER_MAX_QUERY_LENGTH = 500;

export async function searchSerper(
	query: string,
	count: number,
	apiKey: string,
	signal?: AbortSignal,
	fetchImpl: FetchLike = fetch,
): Promise<WebResult[]> {
	const response = await fetchImpl(SERPER_SEARCH_URL, {
		method: "POST",
		redirect: "error",
		headers: { "X-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({ q: query.trim().slice(0, SERPER_MAX_QUERY_LENGTH), num: Math.min(count, SERPER_MAX_RESULTS) }),
		signal: requestSignal(signal),
	});
	if (!response.ok) throw new Error(`Serper HTTP ${response.status}: ${await boundedErrorBody(response, apiKey)}`);

	const payload: unknown = await response.json();
	if (!isRecord(payload)) throw new Error("Serper returned an unexpected response format.");
	if (payload.organic === undefined || payload.organic === null) return [];
	if (!Array.isArray(payload.organic)) throw new Error("Serper returned an unexpected response format.");
	return payload.organic.filter(isRecord).map((result) => ({
		title: text(result.title),
		url: text(result.link),
		summary: text(result.snippet),
	}));
}
