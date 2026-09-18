/**
 * web_search: provider-neutral public web search.
 *
 * Provider selection (`WEB_SEARCH_PROVIDER`):
 *   - auto (default): use the signed provider when credentials exist, otherwise DuckDuckGo
 *   - duckduckgo: key-free DuckDuckGo HTML search
 *   - volcengine: existing signed search provider
 */

import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { search as duckDuckGoSearch, type SearchResult as DuckDuckGoResult } from "ddg-search";
import { Type } from "typebox";

const DEFAULT_COUNT = 5;
const MAX_COUNT = 50;
const REQUEST_TIMEOUT_MS = 60_000;

const HOST = "mercury.volcengineapi.com";
const SERVICE = "volc_torchlight_api";
const VERSION = "2025-01-01";
const REGION = "cn-beijing";

export type SearchProvider = "duckduckgo" | "volcengine";
type ProviderSetting = "auto" | SearchProvider;

interface Credentials {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
}

interface SignedProviderResult {
	Title?: string;
	Url?: string;
	Summary?: string;
	Snippet?: string;
}

export interface WebResult {
	title: string;
	url: string;
	summary: string;
}

interface SearchAdapters {
	duckduckgo(query: string, count: number, signal?: AbortSignal): Promise<WebResult[]>;
	volcengine(query: string, count: number, credentials: Credentials, signal?: AbortSignal): Promise<WebResult[]>;
}

interface WebSearchDetails {
	query?: string;
	count?: number;
	provider?: SearchProvider;
	resultCount?: number;
	error?: string;
}

function loadIamCredentialJson(raw: string, source: string): Credentials {
	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		throw new Error(`IAM credential JSON is not valid: ${source}`);
	}
	if (typeof payload !== "object" || payload === null) {
		throw new Error(`IAM credential JSON must be an object: ${source}`);
	}
	const record = payload as Record<string, unknown>;
	const text = (key: string): string => {
		const value = record[key];
		return typeof value === "string" ? value.trim() : "";
	};
	const accessKeyId = text("access_key_id");
	const secretAccessKey = text("secret_access_key");
	if (!accessKeyId || !secretAccessKey) {
		throw new Error(`IAM credential JSON missing access_key_id/secret_access_key: ${source}`);
	}
	return {
		accessKeyId,
		secretAccessKey,
		sessionToken: text("session_token") || undefined,
	};
}

/** Return configured credentials without failing, so auto mode can fall back. */
function findCredentials(): Credentials | undefined {
	const toolAk = process.env.TOOL_WEB_SEARCH_ACCESS_KEY?.trim();
	const toolSk = process.env.TOOL_WEB_SEARCH_SECRET_KEY?.trim();
	if (toolAk && toolSk) return { accessKeyId: toolAk, secretAccessKey: toolSk };

	const volcAk = process.env.VOLCENGINE_ACCESS_KEY?.trim();
	const volcSk = process.env.VOLCENGINE_SECRET_KEY?.trim();
	if (volcAk && volcSk) return { accessKeyId: volcAk, secretAccessKey: volcSk };

	const credentialFile = process.env.VOLCENGINE_CREDENTIAL_FILE?.trim();
	if (credentialFile && existsSync(credentialFile)) {
		return loadIamCredentialJson(readFileSync(credentialFile, "utf8"), credentialFile);
	}
	const iamEnv = process.env.IAM_CREDENTIAL?.trim();
	if (iamEnv) return loadIamCredentialJson(iamEnv, "IAM_CREDENTIAL");
	return undefined;
}

function missingCredentialsError(): Error {
	return new Error(
		"Web search credentials missing. Set TOOL_WEB_SEARCH_ACCESS_KEY/SECRET_KEY, " +
			"VOLCENGINE_ACCESS_KEY/SECRET_KEY, VOLCENGINE_CREDENTIAL_FILE, or IAM_CREDENTIAL.",
	);
}

export function resolveSearchProvider(value: string | undefined, hasCredentials: boolean): SearchProvider {
	const setting = (value?.trim().toLowerCase() || "auto") as ProviderSetting;
	if (setting === "auto") return hasCredentials ? "volcengine" : "duckduckgo";
	if (setting === "duckduckgo" || setting === "volcengine") return setting;
	throw new Error(
		`Unsupported WEB_SEARCH_PROVIDER: ${value}. Expected auto, duckduckgo, or volcengine.`,
	);
}

export function normalizeDuckDuckGoResults(results: DuckDuckGoResult[]): WebResult[] {
	return results.map((result) => ({
		title: result.title?.trim() ?? "",
		url: result.url?.trim() ?? "",
		summary: result.description?.trim() ?? "",
	}));
}

function normalizeSignedProviderResults(results: SignedProviderResult[]): WebResult[] {
	return results.map((result) => ({
		title: result.Title?.trim() ?? "",
		url: result.Url?.trim() ?? "",
		summary: (result.Summary ?? result.Snippet ?? "").trim(),
	}));
}

const sha256Hex = (content: string): string => createHash("sha256").update(content, "utf8").digest("hex");
const hmac = (key: Buffer | string, content: string): Buffer => createHmac("sha256", key).update(content, "utf8").digest();

function uriEscape(value: string): string {
	return encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normQuery(params: Record<string, string>): string {
	return Object.keys(params)
		.sort()
		.map((key) => `${uriEscape(key)}=${uriEscape(params[key])}`)
		.join("&");
}

function xDate(now: Date): string {
	return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function requestSignal(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function signedProviderSearch(
	query: string,
	count: number,
	credentials: Credentials,
	signal?: AbortSignal,
): Promise<WebResult[]> {
	const body = JSON.stringify({ Query: query, SearchType: "web", Count: count, NeedSummary: true });
	const queryParams = { Action: "WebSearch", Version: VERSION };
	const payloadHash = sha256Hex(body);
	const date = xDate(new Date());
	const shortDate = date.slice(0, 8);
	const contentType = "application/json";
	const headers: Record<string, string> = {
		Host: HOST,
		"X-Date": date,
		"X-Content-Sha256": payloadHash,
		"Content-Type": contentType,
	};
	if (credentials.sessionToken) headers["X-Security-Token"] = credentials.sessionToken;

	const signedHeaders = "content-type;host;x-content-sha256;x-date";
	const canonicalRequest = [
		"POST",
		"/",
		normQuery(queryParams),
		[
			`content-type:${contentType}`,
			`host:${HOST}`,
			`x-content-sha256:${payloadHash}`,
			`x-date:${date}`,
		].join("\n"),
		"",
		signedHeaders,
		payloadHash,
	].join("\n");

	const credentialScope = `${shortDate}/${REGION}/${SERVICE}/request`;
	const stringToSign = ["HMAC-SHA256", date, credentialScope, sha256Hex(canonicalRequest)].join("\n");
	const kDate = hmac(credentials.secretAccessKey, shortDate);
	const kRegion = hmac(kDate, REGION);
	const kService = hmac(kRegion, SERVICE);
	const signature = hmac(hmac(kService, "request"), stringToSign).toString("hex");
	headers.Authorization =
		`HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
		`SignedHeaders=${signedHeaders}, Signature=${signature}`;

	const response = await fetch(`https://${HOST}/?${normQuery(queryParams)}`, {
		method: "POST",
		headers,
		body,
		signal: requestSignal(signal),
	});
	if (!response.ok) {
		throw new Error(`Web search HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
	}
	const payload = (await response.json()) as {
		ResponseMetadata?: { Error?: { Code?: string; CodeN?: number | string; Message?: string } };
		Result?: { WebResults?: SignedProviderResult[] };
	};
	const error = payload.ResponseMetadata?.Error;
	if (error) {
		const code = String(error.Code ?? error.CodeN ?? "").trim();
		throw new Error(`Web search failed: ${code ? `${code}: ` : ""}${String(error.Message ?? "")}`);
	}
	return normalizeSignedProviderResults(payload.Result?.WebResults ?? []);
}

async function duckDuckGoProviderSearch(query: string, count: number, signal?: AbortSignal): Promise<WebResult[]> {
	const response = await duckDuckGoSearch(query, {
		maxPages: 5,
		maxResults: count,
		region: "wt-wt",
		time: "",
		signal: requestSignal(signal),
	});
	return normalizeDuckDuckGoResults(response.results);
}

const defaultAdapters: SearchAdapters = {
	duckduckgo: duckDuckGoProviderSearch,
	volcengine: signedProviderSearch,
};

export async function runSearch(
	query: string,
	count: number,
	providerSetting: string | undefined,
	credentials: Credentials | undefined,
	signal?: AbortSignal,
	adapters: SearchAdapters = defaultAdapters,
): Promise<{ provider: SearchProvider; results: WebResult[] }> {
	const provider = resolveSearchProvider(providerSetting, credentials !== undefined);
	if (provider === "volcengine" && !credentials) throw missingCredentialsError();
	const results = provider === "duckduckgo"
		? await adapters.duckduckgo(query, count, signal)
		: await adapters.volcengine(query, count, credentials as Credentials, signal);
	return { provider, results };
}

export function formatResults(results: WebResult[]): string {
	const lines = results
		.map((result) => {
			const header = result.title ? (result.url ? `${result.title}\n${result.url}` : result.title) : result.url;
			return [header, result.summary].filter(Boolean).join("\n");
		})
		.filter((line) => line.length > 0);
	if (lines.length === 0) return "No results found.";
	return lines.map((line, i) => `${i + 1}. ${line}`).join("\n\n");
}

const parameters = Type.Object({
	query: Type.String({ description: "Required search query." }),
	count: Type.Optional(
		Type.Integer({ minimum: 1, maximum: 50, description: "Number of results (default 5, max 50)." }),
	),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool<typeof parameters, WebSearchDetails>({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the public web and return per-result summaries. " +
			"Use for web research questions; supports Chinese web coverage well.",
		promptSnippet: "Use for web search and web research questions.",
		parameters,
		async execute(_callId, params, signal) {
			const query = params.query.trim();
			if (!query) {
				return { content: [{ type: "text", text: "Error: query is required." }], details: { error: "query required" } };
			}
			const count = Math.max(1, Math.min(Math.floor(params.count ?? DEFAULT_COUNT), MAX_COUNT));
			try {
				const credentials = findCredentials();
				const { provider, results } = await runSearch(
					query,
					count,
					process.env.WEB_SEARCH_PROVIDER,
					credentials,
					signal,
				);
				return {
					content: [{ type: "text", text: formatResults(results) }],
					details: { query, count, provider, resultCount: results.length },
				};
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return { content: [{ type: "text", text: `Error: ${message}` }], details: { error: message } };
			}
		},
	});
}
