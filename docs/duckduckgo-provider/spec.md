# Spec: DuckDuckGo provider for web_search

## Requirements
1. `web_search` supports provider selection through `WEB_SEARCH_PROVIDER`:
   - `auto` or unset: use the existing signed provider when credentials are available; otherwise use DuckDuckGo.
   - `duckduckgo`: always use DuckDuckGo and require no credentials.
   - `volcengine`: always use the existing signed provider and return its current missing-credential error when unavailable.
   - Any other value returns an actionable unsupported-provider error.
2. Tool parameters and text output remain backward-compatible: `query`, optional `count`, numbered title/URL/summary results.
3. DuckDuckGo uses moderate safe search and a 60-second upper request bound. The caller's abort signal must cancel the request.
4. DuckDuckGo results normalize title, URL, and snippet into the existing internal result model. Empty snippets must not cause otherwise valid results to disappear.
5. Tool result details include the selected provider for observability without changing public prose or the tool name.
6. README documents selection, zero-key behavior, and compatibility with existing credentials.

## Design
- Add a maintained TypeScript DuckDuckGo client dependency rather than reimplementing DDG's token and HTML parsing protocol.
- Introduce provider resolution and provider-specific adapters inside `extensions/web-search.ts`; keep formatting shared.
- Model deer-flow's defaults where the JS client supports them: moderate safe search and worldwide search locale. Deer-flow's multi-backend and Wikipedia-region inference are not copied because the selected Node client talks directly to DuckDuckGo rather than exposing DDGS' backend aggregator.
- Add Node built-in tests against exported/internal pure provider-resolution and normalization helpers, with the network client mocked. No live-network test is required for the deterministic suite.

## Acceptance criteria
- With no existing credentials and no provider setting, a search is routed to DuckDuckGo.
- Existing credentialed installations continue to route to the signed provider in auto mode.
- Explicit provider selection behaves deterministically.
- Automated tests cover auto precedence, explicit selection, unsupported selection, result normalization, and empty-result formatting.

## Concerns
- DuckDuckGo is an unofficial scraped endpoint and can rate-limit or change markup; errors must be surfaced rather than hidden.
- Adding a parser client increases install size. A direct handwritten scraper was rejected because it would duplicate brittle protocol/parsing logic and be harder to maintain.
