import assert from "node:assert/strict";
import test from "node:test";

import {
	formatResults,
	normalizeDuckDuckGoResults,
	resolveSearchProvider,
	runSearch,
	type WebResult,
} from "../extensions/web-search.ts";

const sample: WebResult[] = [{ title: "Example", url: "https://example.com", summary: "Summary" }];

test("auto keeps the existing provider when credentials are configured", () => {
	assert.equal(resolveSearchProvider(undefined, true), "volcengine");
	assert.equal(resolveSearchProvider("auto", true), "volcengine");
});

test("auto falls back to DuckDuckGo without credentials", () => {
	assert.equal(resolveSearchProvider(undefined, false), "duckduckgo");
	assert.equal(resolveSearchProvider(" AUTO ", false), "duckduckgo");
});

test("explicit providers are deterministic and unsupported values fail", () => {
	assert.equal(resolveSearchProvider("duckduckgo", true), "duckduckgo");
	assert.equal(resolveSearchProvider("volcengine", false), "volcengine");
	assert.throws(() => resolveSearchProvider("unknown", false), /Expected auto, duckduckgo, or volcengine/);
});

test("runSearch routes to DuckDuckGo and preserves count and cancellation", async () => {
	const calls: unknown[][] = [];
	const controller = new AbortController();
	const result = await runSearch("pi agent", 7, "duckduckgo", undefined, controller.signal, {
		async duckduckgo(...args) {
			calls.push(args);
			return sample;
		},
		async volcengine() {
			throw new Error("wrong adapter");
		},
	});

	assert.equal(result.provider, "duckduckgo");
	assert.deepEqual(result.results, sample);
	assert.deepEqual(calls[0], ["pi agent", 7, controller.signal]);
});

test("explicit existing provider mode reports missing credentials before calling an adapter", async () => {
	await assert.rejects(
		runSearch("news", 3, "volcengine", undefined, undefined, {
			async duckduckgo() {
				throw new Error("wrong adapter");
			},
			async volcengine() {
				throw new Error("adapter must not run");
			},
		}),
		/Web search credentials missing/,
	);
});

test("runSearch keeps credentialed auto mode on the existing provider", async () => {
	const credentials = { accessKeyId: "ak", secretAccessKey: "sk" };
	let receivedCredentials: unknown;
	const result = await runSearch("news", 3, "auto", credentials, undefined, {
		async duckduckgo() {
			throw new Error("wrong adapter");
		},
		async volcengine(_query, _count, received) {
			receivedCredentials = received;
			return sample;
		},
	});

	assert.equal(result.provider, "volcengine");
	assert.equal(receivedCredentials, credentials);
});

test("DuckDuckGo results normalize into the shared result model", () => {
	assert.deepEqual(
		normalizeDuckDuckGoResults([
			{ title: " Result ", url: " https://example.com ", description: " Snippet ", displayUrl: "example.com" },
		]),
		[{ title: "Result", url: "https://example.com", summary: "Snippet" }],
	);
});

test("formatting retains valid results with an empty snippet", () => {
	assert.equal(
		formatResults([{ title: "Title", url: "https://example.com", summary: "" }]),
		"1. Title\nhttps://example.com",
	);
	assert.equal(formatResults([]), "No results found.");
});
