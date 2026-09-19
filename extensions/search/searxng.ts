import { boundedErrorBody, isRecord, parseHttpBaseUrl, requestSignal, text, type FetchLike, type WebResult } from "./types.ts";

export async function searchSearxng(
	query: string,
	count: number,
	baseUrl: string,
	signal?: AbortSignal,
	fetchImpl: FetchLike = fetch,
): Promise<WebResult[]> {
	const base = parseHttpBaseUrl(baseUrl, "SEARXNG_BASE_URL");
	const url = new URL(`${base.pathname.replace(/\/+$/, "")}/search`, base);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");
	url.searchParams.set("language", "auto");
	url.searchParams.set("pageno", "1");
	url.searchParams.set("limit", String(count));

	const response = await fetchImpl(url, {
		redirect: "error",
		headers: {
			Accept: "application/json",
			"User-Agent": "Mozilla/5.0 (compatible; pi-web-access/1.0)",
		},
		signal: requestSignal(signal),
	});
	if (!response.ok) throw new Error(`SearXNG HTTP ${response.status}: ${await boundedErrorBody(response)}`);

	const payload: unknown = await response.json();
	if (!isRecord(payload)) throw new Error("SearXNG returned an unexpected response format.");
	if (payload.results === undefined || payload.results === null) return [];
	if (!Array.isArray(payload.results)) throw new Error("SearXNG returned an unexpected response format.");
	return payload.results
		.filter(isRecord)
		.map((result) => ({ title: text(result.title), url: text(result.url), summary: text(result.content) }))
		.slice(0, count);
}
