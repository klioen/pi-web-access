export interface WebResult {
	title: string;
	url: string;
	summary: string;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export const SEARCH_TIMEOUT_MS = 60_000;

export function requestSignal(signal?: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
	return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

const MAX_ERROR_BODY_BYTES = 4_096;
const MAX_ERROR_MESSAGE_CHARS = 300;

export async function boundedErrorBody(response: Response, credential?: string): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (total < MAX_ERROR_BODY_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			const remaining = MAX_ERROR_BODY_BYTES - total;
			const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
			chunks.push(chunk);
			total += chunk.byteLength;
			if (value.byteLength > remaining) break;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	let body = new TextDecoder().decode(bytes);
	if (credential) body = body.split(credential).join("[redacted]");
	return body.slice(0, MAX_ERROR_MESSAGE_CHARS);
}

export function parseHttpBaseUrl(raw: string, label: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new Error(`${label} must be a valid HTTP(S) URL.`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`${label} must be a valid HTTP(S) URL.`);
	}
	return url;
}
