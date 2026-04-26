# Pixel Agents In Network

Pixel Agents In Network is a standalone web version of Pixel Agents that shows local coding agents as animated pixel characters in a shared room. It runs as a Next.js app and loads the original Pixel Agents webview bundle in the browser while a local API feeds it live agent/session data.

## One-Line Network Mode

Fresh download with your name on the agent labels:

```bash
git clone https://github.com/PaTiToMaSteR/pixel-agents-in-network.git \
  && cd pixel-agents-in-network \
  && npm run dev -- --name "Your Name"
```

Fresh download without a custom name:

```bash
git clone https://github.com/PaTiToMaSteR/pixel-agents-in-network.git \
  && cd pixel-agents-in-network \
  && npm run dev
```

Already cloned:

```bash
npm run dev
```

Already cloned, update first, then run with your name:

```bash
git pull && npm run dev -- --name "Your Name"
```

Broadcast/network mode is the default for `npm run dev` and `npm start`. `npm run dev` uses Next.js dev mode with hot reload; `npm start` builds and runs production mode. Both find an existing Pixel Agents hub on the LAN, join it if one exists, or start a new hub if none exists. Then they broadcast this machine's OpenCode and Claude Code agents and open the room in your browser.

No IP address is required for normal LAN use. Every computer can run the same command.

Optional flags:

```bash
npm run dev -- --name "Patito" --port 4555 --hub-port 8787
```

The `--name` value is shown in every agent label, for example `Patito · opencode · Vibrez`, so you can tell who owns each agent in the shared room.

Runtime logs are warning/error-only by default. Set `PIXEL_AGENTS_LOG_LEVEL=debug` before the command when you need startup and broadcast diagnostics.

If multicast discovery is blocked by your network, you can still join manually:

```bash
npm run dev -- --hub 192.168.1.20
```

The command prints both the local browser URL and the LAN URL. Keep the terminal open while broadcasting.

## VS Code Launch

The repo includes VS Code launch configs in `.vscode/launch.json`:

- `Pixel Agents: Broadcast Dev (Hot Reload)` runs `npm run dev -- --name "..."` on port `4555`.
- `Pixel Agents: Broadcast Dev (Custom Hub)` joins a specific hub when multicast discovery is blocked.
- `Pixel Agents: Broadcast Production` runs the production network command.
- `Pixel Agents: Web Dev Only` and `Pixel Agents: Web Start Only` run the plain Next.js app without broadcasting.

The pre-launch tasks in `.vscode/tasks.json` kill stale listeners on ports `4555`, `8787`, and UDP `47877` so old hub or app processes do not keep serving stale code.

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
- Always-visible labels show owner/status on the first line with OpenCode or Claude SVG icons from SVGL, and project name on the second line.
- Compact labels are enabled by default and can be toggled from the in-room `Compact labels` setting.
- Live tool-state mapping for OpenCode sessions, including active or pending tool calls.
- Browser mock loader that dispatches Pixel Agents webview messages without requiring VS Code APIs.
- Bundled decoded assets for characters, floors, walls, furniture, furniture catalog, and default room layout.
- Extra desks, chairs, and computers in the original office layout so more agents have visible workstations.
- A larger `32x22` default office map with 93 furniture items, saved as `public/assets/default-layout-1.json`.
- Shared layout edits are saved through the local hub and can be loaded explicitly from other browsers without resetting active edits every few seconds.
- Layout saves carry a per-browser origin ID for traceability, but saved layouts are not auto-applied back over local state.
- Edit mode has a visible `Load` button next to `Save` for restoring the latest shared saved layout.
- Edit mode has separate `Erase floor` and `Erase furniture` buttons so removing furniture does not accidentally delete floor tiles.
- Idle agents walk to the kitchen/coffee area instead of sitting at their workstation forever, and active agents return to their desks.
- Always-on labels, sound-enabled defaults, and extension-version metadata for the standalone runtime.
- Simple connection status overlay showing that the web shell is connected.

## Shared Layouts

Click `Layout`, edit the room, then click `Save`. The browser posts the layout to `/api/layout`; when network mode is running, that API forwards the save to the LAN hub.

Fresh launches always start from the committed default layout in `public/assets/default-layout-1.json`. Saved hub layouts are not applied automatically, because an old hub snapshot can otherwise overwrite a fresh clone or a local edit.

Use the `Load` button next to `Save` when you explicitly want to pull the latest shared layout into the current browser.

## Development

```bash
npm install
npm run dev
```

The default dev command runs broadcast mode with hot reload on port `4555`. For plain Next.js dev without broadcasting, run `npm run dev:web`.

If Next.js serves a stale `.next` cache in dev mode, the network launcher moves the cache aside before starting dev mode. If you still see stale page errors manually, stop the server, move `.next` aside, and restart.

## Build

```bash
npm run build
npm start
```

For plain Next.js production serving without broadcasting, run `npm run start:web`.

## Notes

The local session bridge reads files from the current user's machine and executes local inspection commands. Run it only on a trusted development machine.

Network mode only broadcasts machine name, provider, project basename, status, current tool name, and timestamps. It does not broadcast prompts or file contents.
