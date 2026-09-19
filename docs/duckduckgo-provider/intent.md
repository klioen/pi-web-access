# Intent: Add DuckDuckGo web search provider
Author: user. Status: proposed.

## Problem
The existing `web_search` tool only works when deployment-specific search credentials are configured. It has no key-free public search provider.

## Proposed outcome
Add DuckDuckGo as a supported search provider, following deer-flow's DDGS behavior where practical, so `web_search` can work without API credentials while preserving the existing provider for configured users.

## Affected users and systems
- Users of the `pi-web-access` package and its `web_search` tool.
- `extensions/web-search.ts`, package dependencies, documentation, and provider-focused tests.

## Constraints
- Keep the public tool name and user-facing description provider-neutral.
- Preserve the existing request schema (`query`, `count`) and result formatting.
- Do not require an API key for DuckDuckGo.
- Preserve cancellation and bounded request timeouts.
- Avoid silently masking explicit provider configuration errors.

## Open questions
- Proposed default: `WEB_SEARCH_PROVIDER=auto`; auto uses the existing provider when its credentials are available, otherwise DuckDuckGo. Explicit values are `duckduckgo` and `volcengine`. This awaits approval.
