# Pixel Agents In Network

Pixel Agents In Network is a standalone web version of Pixel Agents that shows local coding agents as animated pixel characters in a shared room. It runs as a Next.js app and loads the original Pixel Agents webview bundle in the browser while a local API feeds it live agent/session data.

## Original Source

This project comes from the Pixel Agents VS Code extension by `pablodelucca`, specifically the `pablodelucca.pixel-agents` extension assets and webview runtime. The web app keeps the original pixel room, character, floor, wall, and furniture assets, then wraps them so they can run outside VS Code.

## New Features Added

- Standalone Next.js web app shell for running Pixel Agents in a browser.
- Embedded Pixel Agents webview through `/index.html` with a full-screen iframe host.
- Local `/api/mock-data` bridge that discovers active OpenCode sessions from `~/.local/share/opencode/opencode.db`.
- Claude Code session discovery from `~/.claude/projects` JSONL session files.
- Active process detection for `opencode` and `claude` so only currently running agents are shown.
- Provider labels that distinguish OpenCode and Claude Code agents in the pixel room.
- Live tool-state mapping for OpenCode sessions, including active or pending tool calls.
- Browser mock loader that dispatches Pixel Agents webview messages without requiring VS Code APIs.
- Bundled decoded assets for characters, floors, walls, furniture, furniture catalog, and default room layout.
- Always-on labels, sound-enabled defaults, and extension-version metadata for the standalone runtime.
- Simple connection status overlay showing that the web shell is connected.

## Development

```bash
npm install
npm run dev
```

The dev server runs on port `3001` by default.

## Build

```bash
npm run build
npm run start
```

## Notes

The local session bridge reads files from the current user's machine and executes local inspection commands. Run it only on a trusted development machine.
