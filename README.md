# Pixel Agents In Network

Pixel Agents In Network is a standalone web version of Pixel Agents that shows local coding agents as animated pixel characters in a shared room. It runs as a Next.js app and loads the original Pixel Agents webview bundle in the browser while a local API feeds it live agent/session data.

## Original Source

This project comes from the Pixel Agents VS Code extension by `pablodelucca`: https://github.com/pablodelucca/pixel-agents

It specifically uses the original Pixel Agents extension assets and webview runtime. The web app keeps the original pixel room, character, floor, wall, and furniture assets, then wraps them so they can run outside VS Code.

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

## One-Line Network Mode

Fresh download, on every machine:

```bash
git clone https://github.com/PaTiToMaSteR/pixel-agents-in-network.git && cd pixel-agents-in-network && npm run network
```

Fresh download with your name on the agent labels:

```bash
git clone https://github.com/PaTiToMaSteR/pixel-agents-in-network.git && cd pixel-agents-in-network && npm run network -- --name "Your Name"
```

Already cloned:

```bash
npm run network
```

It installs dependencies if needed, builds the app, finds an existing Pixel Agents hub on the LAN, joins it if one exists, or starts a new hub if none exists. Then it broadcasts this machine's OpenCode and Claude Code agents and opens the room in your browser.

No IP address is required for normal LAN use. Every computer can run the same command.

Optional flags:

```bash
npm run network -- --name "Patito" --port 3001 --hub-port 8787
```

The `--name` value is shown in every agent label, for example `Patito · opencode · Vibrez`, so you can tell who owns each agent in the shared room.

If multicast discovery is blocked by your network, you can still join manually:

```bash
npm run network -- --hub 192.168.1.20
```

The command prints both the local browser URL and the LAN URL. Keep the terminal open while broadcasting.

## Build

```bash
npm run build
npm run start
```

## Notes

The local session bridge reads files from the current user's machine and executes local inspection commands. Run it only on a trusted development machine.

Network mode only broadcasts machine name, provider, project basename, status, current tool name, and timestamps. It does not broadcast prompts or file contents.
