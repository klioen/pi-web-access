# Plan: Add five web search providers (from docs/add-search-providers/spec.md 2026-09-19)

## Files that change
- `extensions/web-search.ts`: extend provider selection, configuration discovery, routing, details, and shared errors.
- `extensions/search/types.ts` (new): shared provider result, fetch, and request context types.
- `extensions/search/searxng.ts` (new): SearXNG adapter.
- `extensions/search/brave.ts` (new): Brave Search adapter.
- `extensions/search/tavily.ts` (new): Tavily adapter.
- `extensions/search/exa.ts` (new): Exa REST and anonymous MCP adapter.
- `extensions/search/serper.ts` (new): Serper adapter.
- `tests/web-search.test.ts`: provider resolution and routing regression tests.
- `tests/search-providers.test.ts` (new): deterministic HTTP contract and normalization tests for all five adapters.
- `README.md`: provider table, required environment variables, explicit selection examples, Exa transport behavior, and unchanged auto semantics.
- `docs/add-search-providers/{intent.md,spec.md,plan.md}`: approved requirement/design/implementation record.

## Order of work
1. Commit the approved intent/spec/plan before implementation.
2. Introduce shared adapter types and pure validation/redaction helpers without changing behavior.
3. Implement SearXNG, Brave, Tavily, and Serper native-fetch adapters following DeerFlow's current request contracts.
4. Implement Exa keyed REST and keyless MCP transports, including JSON/SSE envelope parsing and basic text-result parsing.
5. Extend provider resolution and routing while preserving existing `auto` behavior exactly.
6. Add provider protocol tests using injected fetch implementations, plus routing and missing-configuration tests.
7. Update README with configuration and cost-safety behavior.
8. Run tests, typecheck, audit, package dry-run, credential scan, and an optional keyless Exa MCP smoke test. Do not call paid APIs in verification.

## Risks
- Most dangerous: accidentally changing `auto` and silently spending paid-provider quota. Mitigation: lock current auto behavior in unchanged regression tests and make all five additions explicit-only.
- Provider credentials could be echoed by error responses. Mitigation: redact the exact credential before truncating any response body.
- Exa MCP returns either SSE or JSON and formatted text rather than one stable JSON schema. Mitigation: deterministic tests for both envelopes, RPC errors, tool errors, empty content, and text parsing.
- SearXNG operators may intentionally use private network endpoints. It must not reuse `web_fetch` SSRF rejection because the endpoint is trusted operator configuration, but only explicit HTTP(S) URLs are accepted.
- Alternative rejected: provider SDKs. Native fetch keeps dependency and bundle growth low and makes cancellation uniform.
- Alternative rejected: full rich routing from the larger `~/ai/pi-web-access`; it is outside this package's current minimal scope.

## Proof
- `npm test`
- `npm run typecheck`
- `npm audit --omit=dev`
- `npm pack --dry-run`
- `git diff --check`
- Credential-pattern scan over tracked changes
- Optional `WEB_SEARCH_PROVIDER=exa` keyless MCP smoke test only
