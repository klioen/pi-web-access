# pi-web-access

Web search and URL fetch tools for the pi coding agent.

## Installation

```bash
npm install pi-web-access
```

Requires Node.js 22 or newer.

## Features

- **web_search** — Search the public web with automatic provider selection
- **web_fetch** — Fetch text, Markdown, HTML, or images from public URLs

## Search providers

`web_search` accepts a required `query` and an optional result `count` (default 5, maximum 50).
Choose its backend with `WEB_SEARCH_PROVIDER`:

| Value | Behavior |
| --- | --- |
| `auto` (default) | Use the existing signed provider when credentials are configured; otherwise use DuckDuckGo |
| `duckduckgo` | Use key-free DuckDuckGo search |
| `volcengine` | Require and use the existing signed provider |
| `searxng` | Use an operator-configured SearXNG instance |
| `brave` | Use the Brave Search API |
| `tavily` | Use the Tavily Search API |
| `exa` | Use Exa REST when keyed, otherwise anonymous Exa MCP |
| `serper` | Use the Serper Google Search API |

New commercial providers are explicit-only: merely setting their API keys does not change `auto` routing or incur requests. Configure one with environment variables:

```bash
# Key-free public search
WEB_SEARCH_PROVIDER=duckduckgo pi

# Self-hosted search
WEB_SEARCH_PROVIDER=searxng SEARXNG_BASE_URL=http://localhost:8080 pi

# Commercial APIs
WEB_SEARCH_PROVIDER=brave BRAVE_SEARCH_API_KEY=... pi
WEB_SEARCH_PROVIDER=tavily TAVILY_API_KEY=... pi
WEB_SEARCH_PROVIDER=serper SERPER_API_KEY=... pi

# Exa: anonymous MCP without a key, REST API with a key
WEB_SEARCH_PROVIDER=exa pi
WEB_SEARCH_PROVIDER=exa EXA_API_KEY=... pi
```

Provider-specific limits are applied without changing the public `count` maximum: Brave returns at most 20 results and Serper at most 10.

Existing installations remain compatible. In `auto` mode, any of these credential sources keeps the signed provider selected:

- `TOOL_WEB_SEARCH_ACCESS_KEY` and `TOOL_WEB_SEARCH_SECRET_KEY`
- `VOLCENGINE_ACCESS_KEY` and `VOLCENGINE_SECRET_KEY`
- `VOLCENGINE_CREDENTIAL_FILE`
- `IAM_CREDENTIAL`

Provider selection is reported in structured tool details, while the tool name, description, and rendered results remain provider-neutral. Exa details also report whether the request used `rest` or `mcp` transport.

## Usage

Installing the package registers `web_search` and `web_fetch` with pi.

## Development

```bash
npm test
npm run typecheck
npm pack --dry-run
```

## License

MIT
