# Intent: Add five web search providers
Author: user. Status: proposed.

## Problem
`pi-web-access` currently supports only DuckDuckGo and the existing signed provider. Users cannot select common self-hosted or commercial search services already supported by DeerFlow.

## Proposed outcome
Add explicit support for SearXNG, Brave Search, Tavily, Exa, and Serper while preserving the current `web_search` interface, output format, cancellation behavior, and default routing semantics.

## Affected users and systems
- Users of the `web_search` tool.
- Search provider routing, environment configuration, tests, dependencies, and README documentation.

## Constraints
- Keep public tool names and descriptions provider-neutral.
- Preserve the existing `query` and optional `count` parameters.
- Preserve current `auto` behavior to avoid silently moving users onto paid providers.
- Provider-specific result limits must be enforced locally without reducing the public maximum for other providers.
- All HTTP providers must honor caller cancellation and the existing 60-second timeout.
- Credentials must never appear in errors or structured details.
- Tests must mock remote APIs and consume no paid quota.

## Open questions
- None. Scope is SearXNG, Brave Search, Tavily, Exa, and Serper.
