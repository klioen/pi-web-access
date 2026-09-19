# Spec: SearXNG, Brave, Tavily, Exa, and Serper providers

## Requirements
1. `WEB_SEARCH_PROVIDER` accepts `searxng`, `brave`, `tavily`, `exa`, and `serper` in addition to existing values.
2. `auto` remains backward-compatible:
   - existing signed credentials available: `volcengine`;
   - otherwise: `duckduckgo`.
   New commercial credentials do not silently alter this order.
3. Explicit provider requirements:
   - SearXNG: `SEARXNG_BASE_URL`; no API key required.
   - Brave: `BRAVE_SEARCH_API_KEY`.
   - Tavily: `TAVILY_API_KEY`.
   - Exa: `EXA_API_KEY` uses REST; without it use anonymous Exa MCP.
   - Serper: `SERPER_API_KEY`.
4. All providers normalize to `{title, url, summary}` and use the existing numbered formatter.
5. Provider-local limits:
   - Brave: at most 20 results and query length 400.
   - Serper: at most 10 results and query length 500.
   - Other providers use the requested public count, capped by the existing global maximum 50.
6. SearXNG request: `GET {base}/search` with `q`, `format=json`, `language=auto`, `pageno=1`, and `limit`.
7. Brave request: `GET https://api.search.brave.com/res/v1/web/search` with subscription token, `q`, `count`, and `text_decorations=false`.
8. Tavily request: `POST https://api.tavily.com/search` with Bearer token and `{query,max_results}`.
9. Exa REST request: `POST https://api.exa.ai/search` with `x-api-key`, `numResults`, search type `auto`, and highlights. Exa MCP uses direct JSON-RPC `tools/call` against `https://mcp.exa.ai/mcp?tools=web_search_exa`, accepting JSON and SSE envelopes.
10. Serper request: `POST https://google.serper.dev/search` with `X-API-KEY` and `{q,num}`.
11. Explicit provider failures do not silently fall back to another provider. Exa transport selection is based only on key presence; a failed keyed REST request does not fall back to anonymous MCP.
12. Successful structured details expose selected provider and, for Exa, `rest` or `mcp` transport.

## Design
- Split provider HTTP adapters into focused modules under `extensions/search/` with a small shared result/request type, keeping signing and top-level tool registration in `web-search.ts`.
- Use native Node `fetch`; add no provider SDK dependencies.
- Centralize environment discovery in the top-level router and pass credentials/endpoints explicitly to adapters.
- Validate response envelopes defensively, ignore malformed individual result entries, treat a missing result collection as empty where provider APIs permit it, and reject incompatible collection types.
- Bound third-party error bodies and redact the credential if it is echoed.
- Preserve the existing adapter injection seam so routing tests remain deterministic. Provider protocol tests inject `fetch` rather than accessing live services.

## Acceptance criteria
- All seven provider names resolve deterministically.
- Existing auto-routing tests remain unchanged and pass.
- Each new provider has request-contract, normalization, missing-configuration, malformed-response, HTTP-error, and cancellation coverage.
- Exa covers both REST and anonymous MCP, including JSON/SSE MCP responses and rate-limit guidance.
- `npm test`, `npm run typecheck`, `npm audit --omit=dev`, and `npm pack --dry-run` pass.

## Concerns
- Anonymous Exa MCP is a best-effort hosted endpoint with rate limits and no guaranteed SLA.
- SearXNG can point to local/private infrastructure. Because the URL is operator configuration rather than untrusted tool input, it is permitted, but it must be an explicit HTTP(S) base URL.
- Commercial provider keys can incur charges; keeping them explicit-only avoids surprise billing.
- Provider response schemas may drift; runtime validation and contract tests limit the blast radius.
