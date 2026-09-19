import assert from "node:assert/strict";
import test from "node:test";

import { searchBrave } from "../extensions/search/brave.ts";
import { parseExaMcpResults, searchExa } from "../extensions/search/exa.ts";
import { searchSearxng } from "../extensions/search/searxng.ts";
import { searchSerper } from "../extensions/search/serper.ts";
import { searchTavily } from "../extensions/search/tavily.ts";
import { boundedErrorBody, type FetchLike } from "../extensions/search/types.ts";

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function capture(response: Response): { fetch: FetchLike; call: () => { url: string; init?: RequestInit } } {
	let recorded: { url: string; init?: RequestInit } | undefined;
	return {
		fetch: async (input, init) => {
			recorded = { url: String(input), init };
			return response;
		},
		call: () => {
			assert.ok(recorded);
			return recorded;
		},
	};
}

test("SearXNG sends the DeerFlow-compatible request and normalizes content", async () => {
	const mock = capture(jsonResponse({ results: [
		{ title: " One ", url: " https://example.com/1 ", content: " Summary " },
		{ title: "Two", url: "https://example.com/2", content: "Second" },
	] }));
	const controller = new AbortController();
	const results = await searchSearxng("pi agent", 1, "http://localhost:8088/", controller.signal, mock.fetch);
	const call = mock.call();
	const url = new URL(call.url);
	assert.equal(url.origin + url.pathname, "http://localhost:8088/search");
	assert.deepEqual(Object.fromEntries(url.searchParams), { q: "pi agent", format: "json", language: "auto", pageno: "1", limit: "1" });
	assert.equal(new Headers(call.init?.headers).get("accept"), "application/json");
	assert.equal(call.init?.redirect, "error");
	assert.ok(call.init?.signal);
	assert.deepEqual(results, [{ title: "One", url: "https://example.com/1", summary: "Summary" }]);
});

test("SearXNG rejects invalid endpoints and malformed result collections", async () => {
	await assert.rejects(searchSearxng("q", 5, "file:///tmp/search"), /valid HTTP\(S\) URL/);
	await assert.rejects(searchSearxng("q", 5, "https://search.example", undefined, async () => jsonResponse({ results: {} })), /unexpected response format/);
});

test("Brave enforces provider limits, headers, and response mapping", async () => {
	const key = "brave-secret";
	const mock = capture(jsonResponse({ web: { results: [{ title: "Title", url: "https://example.com", description: "Desc" }, null] } }));
	const results = await searchBrave("x".repeat(450), 50, key, undefined, mock.fetch);
	const call = mock.call();
	const url = new URL(call.url);
	assert.equal(url.origin + url.pathname, "https://api.search.brave.com/res/v1/web/search");
	assert.equal(url.searchParams.get("q")?.length, 400);
	assert.equal(url.searchParams.get("count"), "20");
	assert.equal(url.searchParams.get("text_decorations"), "false");
	assert.equal(new Headers(call.init?.headers).get("x-subscription-token"), key);
	assert.equal(call.init?.redirect, "error");
	assert.deepEqual(results, [{ title: "Title", url: "https://example.com", summary: "Desc" }]);
});

test("Brave redacts echoed credentials in HTTP errors", async () => {
	const key = "brave-secret";
	await assert.rejects(
		searchBrave("q", 5, key, undefined, async () => new Response(`invalid ${key}`, { status: 401 })),
		(error: Error) => error.message.includes("[redacted]") && !error.message.includes(key),
	);
});

test("Tavily sends a bearer request and maps content", async () => {
	const mock = capture(jsonResponse({ results: [{ title: "T", url: "https://t.example", content: "C" }] }));
	const results = await searchTavily("query", 7, "tvly", undefined, mock.fetch);
	const call = mock.call();
	assert.equal(call.url, "https://api.tavily.com/search");
	assert.equal(call.init?.method, "POST");
	assert.equal(new Headers(call.init?.headers).get("authorization"), "Bearer tvly");
	assert.equal(call.init?.redirect, "error");
	assert.deepEqual(JSON.parse(String(call.init?.body)), { query: "query", max_results: 7 });
	assert.deepEqual(results, [{ title: "T", url: "https://t.example", summary: "C" }]);
});

test("Serper enforces provider limits and maps organic results", async () => {
	const mock = capture(jsonResponse({ organic: [{ title: "S", link: "https://s.example", snippet: "Snippet" }, false] }));
	const results = await searchSerper(` query ${"x".repeat(600)}`, 50, "serper", undefined, mock.fetch);
	const call = mock.call();
	assert.equal(call.url, "https://google.serper.dev/search");
	assert.equal(new Headers(call.init?.headers).get("x-api-key"), "serper");
	assert.equal(call.init?.redirect, "error");
	const body = JSON.parse(String(call.init?.body));
	assert.equal(body.q.length, 500);
	assert.equal(body.num, 10);
	assert.deepEqual(results, [{ title: "S", url: "https://s.example", summary: "Snippet" }]);
});

test("Exa REST uses keyed search, maps highlights, and never sends the key in output", async () => {
	const key = "exa-secret";
	const mock = capture(jsonResponse({ results: [
		{ title: "Exa", url: "https://exa.example", highlights: [" First ", "Second"] },
		{ title: "invalid", text: "no URL" },
	] }));
	const response = await searchExa("query", 4, key, undefined, mock.fetch);
	const call = mock.call();
	assert.equal(response.transport, "rest");
	assert.equal(call.url, "https://api.exa.ai/search");
	assert.equal(new Headers(call.init?.headers).get("x-api-key"), key);
	assert.equal(call.init?.redirect, "error");
	assert.deepEqual(JSON.parse(String(call.init?.body)), { query: "query", type: "auto", numResults: 4, contents: { highlights: true } });
	assert.deepEqual(response.results, [{ title: "Exa", url: "https://exa.example", summary: "First\nSecond" }]);
});

test("Exa MCP sends JSON-RPC and accepts plain JSON envelopes", async () => {
	const content = "Title: Result\nURL: https://example.com\nText: Body\n---";
	const mock = capture(jsonResponse({ result: { content: [{ type: "text", text: content }] } }));
	const response = await searchExa("query", 3, undefined, undefined, mock.fetch);
	const call = mock.call();
	assert.equal(response.transport, "mcp");
	assert.equal(call.url, "https://mcp.exa.ai/mcp?tools=web_search_exa");
	assert.equal(call.init?.redirect, "error");
	assert.deepEqual(JSON.parse(String(call.init?.body)), {
		jsonrpc: "2.0", id: 1, method: "tools/call",
		params: { name: "web_search_exa", arguments: { query: "query", numResults: 3 } },
	});
	assert.deepEqual(response.results, [{ title: "Result", url: "https://example.com", summary: "Body" }]);
});

test("Exa MCP accepts SSE and reports RPC, tool, empty, and rate-limit errors", async () => {
	const content = "Title: SSE\nURL: https://sse.example\nHighlights:\nSnippet\n---";
	const sse = `event: message\ndata: ${JSON.stringify({ result: { content: [{ type: "text", text: content }] } })}\n\n`;
	assert.equal((await searchExa("q", 1, undefined, undefined, async () => new Response(sse))).results[0]?.title, "SSE");
	await assert.rejects(searchExa("q", 1, undefined, undefined, async () => jsonResponse({ error: { code: -32602, message: "bad tool" } })), /RPC -32602: bad tool/);
	await assert.rejects(searchExa("q", 1, undefined, undefined, async () => jsonResponse({ result: { isError: true, content: [{ type: "text", text: "failed" }] } })), /returned an error: failed/);
	await assert.rejects(searchExa("q", 1, undefined, undefined, async () => new Response("", { status: 200 })), /empty response/);
	await assert.rejects(searchExa("q", 1, undefined, undefined, async () => new Response("slow down", { status: 429 })), /configure EXA_API_KEY/);
});

test("Exa formatted MCP parser accepts JSON results and rejects text without URLs", () => {
	assert.deepEqual(parseExaMcpResults(JSON.stringify({ results: [{ title: "J", url: "https://j.example", text: "Body" }] })), [
		{ title: "J", url: "https://j.example", summary: "Body" },
	]);
	assert.deepEqual(parseExaMcpResults("Title: Missing URL\nText: body"), []);
});

test("each HTTP provider rejects malformed collections and reports bounded HTTP errors", async () => {
	const cases = [
		{
			name: "SearXNG",
			malformed: () => searchSearxng("q", 2, "https://search.example", undefined, async () => jsonResponse({ results: "bad" })),
			http: () => searchSearxng("q", 2, "https://search.example", undefined, async () => new Response("x".repeat(400), { status: 503 })),
		},
		{
			name: "Brave Search",
			malformed: () => searchBrave("q", 2, "key", undefined, async () => jsonResponse({ web: { results: "bad" } })),
			http: () => searchBrave("q", 2, "key", undefined, async () => new Response("x".repeat(400), { status: 503 })),
		},
		{
			name: "Tavily",
			malformed: () => searchTavily("q", 2, "key", undefined, async () => jsonResponse({ results: "bad" })),
			http: () => searchTavily("q", 2, "key", undefined, async () => new Response("x".repeat(400), { status: 503 })),
		},
		{
			name: "Serper",
			malformed: () => searchSerper("q", 2, "key", undefined, async () => jsonResponse({ organic: "bad" })),
			http: () => searchSerper("q", 2, "key", undefined, async () => new Response("x".repeat(400), { status: 503 })),
		},
		{
			name: "Exa REST",
			malformed: () => searchExa("q", 2, "key", undefined, async () => jsonResponse({ results: "bad" })),
			http: () => searchExa("q", 2, "key", undefined, async () => new Response("x".repeat(400), { status: 503 })),
		},
	] as const;
	for (const item of cases) {
		await assert.rejects(item.malformed(), /unexpected response format/);
		await assert.rejects(item.http(), (error: Error) => error.message.includes(`${item.name} HTTP 503`) && error.message.length < 350);
	}
});

test("each provider combines caller cancellation with its request timeout", async () => {
	const controller = new AbortController();
	controller.abort();
	const inspect: FetchLike = async (_input, init) => {
		assert.equal(init?.signal?.aborted, true);
		return jsonResponse({ results: [], web: { results: [] }, organic: [] });
	};
	await searchSearxng("q", 1, "https://search.example", controller.signal, inspect);
	await searchBrave("q", 1, "key", controller.signal, inspect);
	await searchTavily("q", 1, "key", controller.signal, inspect);
	await searchSerper("q", 1, "key", controller.signal, inspect);
	await searchExa("q", 1, "key", controller.signal, inspect);
	const mcpInspect: FetchLike = async (_input, init) => {
		assert.equal(init?.signal?.aborted, true);
		return jsonResponse({ result: { content: [{ type: "text", text: "Title: T\nURL: https://t.example\nText: C" }] } });
	};
	await searchExa("q", 1, undefined, controller.signal, mcpInspect);
});

test("credential redaction happens before error-body truncation", async () => {
	const key = "secret-at-boundary";
	const body = `${"x".repeat(295)}${key}`;
	await assert.rejects(
		searchTavily("q", 1, key, undefined, async () => new Response(body, { status: 401 })),
		(error: Error) => !error.message.includes(key) && error.message.includes("[reda"),
	);
});

test("error bodies are stream-bounded and cancel unread data", async () => {
	let cancelled = false;
	let pulls = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			pulls++;
			controller.enqueue(new Uint8Array(2048).fill(120));
		},
		cancel() {
			cancelled = true;
		},
	});
	const body = await boundedErrorBody(new Response(stream, { status: 500 }));
	assert.equal(body.length, 300);
	assert.ok(pulls <= 3, `expected bounded reads, got ${pulls}`);
	assert.equal(cancelled, true);
});
