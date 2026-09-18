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

DuckDuckGo needs no API key:

```bash
WEB_SEARCH_PROVIDER=duckduckgo pi
```

Existing installations remain compatible. In `auto` mode, any of these credential sources keeps the signed provider selected:

- `TOOL_WEB_SEARCH_ACCESS_KEY` and `TOOL_WEB_SEARCH_SECRET_KEY`
- `VOLCENGINE_ACCESS_KEY` and `VOLCENGINE_SECRET_KEY`
- `VOLCENGINE_CREDENTIAL_FILE`
- `IAM_CREDENTIAL`

Provider selection is reported in structured tool details, while the tool name, description, and rendered results remain provider-neutral.

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
