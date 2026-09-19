import { boundedErrorBody, isRecord, requestSignal, text, type FetchLike, type WebResult } from "./types.ts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_MCP_URL = "https://mcp.exa.ai/mcp?tools=web_search_exa";
const EXA_MCP_TOOL = "web_search_exa";

export type ExaTransport = "rest" | "mcp";

interface McpEnvelope {
	result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
	error?: { code?: number; message?: string };
}

function redact(message: string, credential?: string): string {
	return credential ? message.split(credential).join("[redacted]") : message;
}

function resultSummary(result: Record<string, unknown>): string {
	if (Array.isArray(result.highlights)) {
		const highlights = result.highlights.map(text).filter(Boolean);
		if (highlights.length) return highlights.join("\n");
	}
	return text(result.text).slice(0, 1000);
}

function normalizeRestResults(payload: unknown): WebResult[] {
	if (!isRecord(payload) || !Array.isArray(payload.results)) {
		throw new Error("Exa REST returned an unexpected response format.");
	}
	return payload.results.filter(isRecord).map((result) => ({
		title: text(result.title),
		url: text(result.url),
		summary: resultSummary(result),
	})).filter((result) => result.url.length > 0);
}

function parseMcpEnvelope(body: string): McpEnvelope | null {
	try {
		const parsed = JSON.parse(body) as McpEnvelope;
		if (parsed?.result || parsed?.error) return parsed;
	} catch {
		// The hosted endpoint may answer as SSE instead of plain JSON.
	}
	for (const line of body.split("\n")) {
		if (!line.startsWith("data:")) continue;
		const data = line.slice(5).trim();
		if (!data) continue;
		try {
			const parsed = JSON.parse(data) as McpEnvelope;
			if (parsed?.result || parsed?.error) return parsed;
		} catch {
			// Ignore non-JSON SSE events.
		}
	}
	return null;
}

export function parseExaMcpResults(value: string): WebResult[] {
	try {
		const payload: unknown = JSON.parse(value);
		if (isRecord(payload) && Array.isArray(payload.results)) return normalizeRestResults(payload);
	} catch {
		// The basic MCP tool normally returns formatted text.
	}
	const blocks = value.split(/(?=^Title: )/m).filter((block) => block.trim().length > 0);
	return blocks.map((block) => {
		const title = block.match(/^Title: (.+)/m)?.[1]?.trim() ?? "";
		const url = block.match(/^URL: (.+)/m)?.[1]?.trim() ?? "";
		let summary = "";
		const textStart = block.indexOf("\nText: ");
		if (textStart >= 0) summary = block.slice(textStart + 7).trim();
		else {
			const highlights = block.match(/\nHighlights:\s*\n/);
			if (highlights?.index !== undefined) summary = block.slice(highlights.index + highlights[0].length).trim();
		}
		return { title, url, summary: summary.replace(/\n---\s*$/, "").trim() };
	}).filter((result) => result.url.length > 0);
}

async function searchExaRest(
	query: string,
	count: number,
	apiKey: string,
	signal: AbortSignal | undefined,
	fetchImpl: FetchLike,
): Promise<WebResult[]> {
	const response = await fetchImpl(EXA_SEARCH_URL, {
		method: "POST",
		redirect: "error",
		headers: { "x-api-key": apiKey, "Content-Type": "application/json", "x-exa-integration": "pi-web-access" },
		body: JSON.stringify({ query, type: "auto", numResults: count, contents: { highlights: true } }),
		signal: requestSignal(signal),
	});
	if (!response.ok) throw new Error(`Exa REST HTTP ${response.status}: ${await boundedErrorBody(response, apiKey)}`);
	try {
		return normalizeRestResults(await response.json());
	} catch (error) {
		throw new Error(redact(error instanceof Error ? error.message : String(error), apiKey));
	}
}

async function searchExaMcp(
	query: string,
	count: number,
	signal: AbortSignal | undefined,
	fetchImpl: FetchLike,
): Promise<WebResult[]> {
	const response = await fetchImpl(EXA_MCP_URL, {
		method: "POST",
		redirect: "error",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			"x-exa-source": "pi-web-access",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name: EXA_MCP_TOOL, arguments: { query, numResults: count } },
		}),
		signal: requestSignal(signal),
	});
	if (!response.ok) {
		const body = await boundedErrorBody(response);
		if (response.status === 429) throw new Error(`Exa MCP anonymous rate limit reached; configure EXA_API_KEY: ${body}`);
		throw new Error(`Exa MCP HTTP ${response.status}: ${body}`);
	}
	const body = await response.text();
	const envelope = parseMcpEnvelope(body);
	if (!envelope) throw new Error("Exa MCP returned an empty response.");
	if (envelope.error) {
		const code = typeof envelope.error.code === "number" ? ` ${envelope.error.code}` : "";
		throw new Error(`Exa MCP RPC${code}: ${envelope.error.message ?? "Unknown error"}`);
	}
	const content = envelope.result?.content?.find((item) => item.type === "text" && text(item.text))?.text?.trim();
	if (envelope.result?.isError) throw new Error(`Exa MCP returned an error: ${content || "Unknown error"}`);
	if (!content) throw new Error("Exa MCP returned empty content.");
	const results = parseExaMcpResults(content);
	if (results.length === 0) throw new Error("Exa MCP returned no valid search results.");
	return results.slice(0, count);
}

export async function searchExa(
	query: string,
	count: number,
	apiKey?: string,
	signal?: AbortSignal,
	fetchImpl: FetchLike = fetch,
): Promise<{ transport: ExaTransport; results: WebResult[] }> {
	return apiKey
		? { transport: "rest", results: await searchExaRest(query, count, apiKey, signal, fetchImpl) }
		: { transport: "mcp", results: await searchExaMcp(query, count, signal, fetchImpl) };
}
