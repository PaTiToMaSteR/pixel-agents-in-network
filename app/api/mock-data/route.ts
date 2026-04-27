import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const localMessagesCacheTtlMs = Number(process.env.PIXEL_AGENTS_LOCAL_MESSAGES_CACHE_MS || 3000);
let localMessagesCache: { messages: WebviewMessage[]; expiresAt: number } | null = null;

interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

async function getNetworkMessages(): Promise<WebviewMessage[] | null> {
  const hubUrl = process.env.PIXEL_AGENTS_HUB_URL;
  if (!hubUrl) return null;

  try {
    const response = await fetch(`${hubUrl.replace(/\/$/, '')}/messages`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.messages) ? data.messages : null;
  } catch {
    return null;
  }
}

function getOpencodeSessions(): Array<{ id: string; title: string; directory: string; time_updated: number; provider: string }> {
  const sessions = [];
  const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  
  if (!fs.existsSync(dbPath)) return sessions;

  try {
    const result = execSync(`sqlite3 "${dbPath}" "SELECT id, title, directory, time_updated FROM session ORDER BY time_updated DESC LIMIT 50;"`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    for (const line of result.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('|');
      if (parts.length >= 4) {
        sessions.push({
          id: parts[0],
          title: parts[1],
          directory: parts[2],
          time_updated: parseInt(parts[3], 10),
          provider: 'opencode',
        });
      }
    }
  } catch {}
  return sessions;
}

function folderNameFromClaudeProjectDir(dirName: string): string {
  const parts = dirName.replace(/^-+/, '').split('-');
  return parts[parts.length - 1] || dirName;
}

function getClaudeCodeSessions(): Array<{ id: string; title: string; directory: string; time_updated: number; provider: string }> {
  const sessions = [];
  const storageDir = path.join(os.homedir(), '.claude', 'projects');

  if (!fs.existsSync(storageDir)) return sessions;

  try {
    const entries = fs.readdirSync(storageDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectDir = path.join(entry.path, entry.name);
      const sessionDirs = [projectDir, path.join(projectDir, '.sessions')].filter((dir) =>
        fs.existsSync(dir),
      );

      for (const sessionDir of sessionDirs) {
        const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.jsonl'));
        for (const file of files) {
          try {
            const filePath = path.join(sessionDir, file);
            const stats = fs.statSync(filePath);
            sessions.push({
              id: file.replace('.jsonl', ''),
              title: folderNameFromClaudeProjectDir(entry.name),
              directory: projectDir,
              time_updated: Math.floor(stats.mtimeMs),
              provider: 'claude-code',
            });
          } catch {}
        }
      }
    }
  } catch {}
  return sessions;
}

function newestSessionByProject<T extends { directory: string; provider: string; time_updated: number }>(sessions: T[]): T[] {
  const byProject = new Map<string, T>();

  for (const session of sessions) {
    const key = `${session.provider}:${session.directory}`;
    const existing = byProject.get(key);
    if (!existing || session.time_updated > existing.time_updated) byProject.set(key, session);
  }

  return [...byProject.values()];
}

function parseOpencodeExport(sessionId: string) {
  try {
    const output = execSync(`opencode export --json ${sessionId} 2>/dev/null || echo '{}'`, {
      encoding: 'utf8',
      timeout: 1000,
    });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function providerLabel(provider: string) {
  return provider === 'claude-code' ? 'claude' : provider;
}

function getLocalOwnerName() {
  if (process.env.PIXEL_AGENTS_MACHINE_NAME) return process.env.PIXEL_AGENTS_MACHINE_NAME;

  try {
    const gitName = execSync('git config user.name', { encoding: 'utf8', timeout: 1000 }).trim();
    if (gitName) return gitName;
  } catch {}

  return os.hostname();
}

function getRunningProcessCount(processName: string) {
  try {
    const output = execSync('ps -axo comm=,args=', {
      encoding: 'utf8',
      timeout: 5000,
    });

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const [command, argsText = ''] = line.split(/\s{2,}/);
        if (path.basename(command) !== processName) return false;
        if (processName !== 'opencode') return true;
        const args = argsText.trim().split(/\s+/).filter(Boolean);
        return args.length === 1 && path.basename(args[0]) === 'opencode';
      }).length;
  } catch {
    return 0;
  }
}

function getDefaultLayout() {
  try {
    const defaultLayoutPath = path.join(os.homedir(), '.vscode', 'extensions', 'pablodelucca.pixel-agents-1.3.0', 'dist', 'webview', 'assets', 'default-layout-1.json');
    if (fs.existsSync(defaultLayoutPath)) {
      return JSON.parse(fs.readFileSync(defaultLayoutPath, 'utf8'));
    }
  } catch {}
  return null;
}

function loadDecodedAssets() {
  const assetsDir = path.join(os.homedir(), '.vscode', 'extensions', 'pablodelucca.pixel-agents-1.3.0', 'dist', 'webview', 'assets');
  try {
    const characters = JSON.parse(fs.readFileSync(path.join(assetsDir, 'decoded', 'characters.json'), 'utf8'));
    const floors = JSON.parse(fs.readFileSync(path.join(assetsDir, 'decoded', 'floors.json'), 'utf8'));
    const walls = JSON.parse(fs.readFileSync(path.join(assetsDir, 'decoded', 'walls.json'), 'utf8'));
    const furniture = JSON.parse(fs.readFileSync(path.join(assetsDir, 'decoded', 'furniture.json'), 'utf8'));
    const catalog = JSON.parse(fs.readFileSync(path.join(assetsDir, 'furniture-catalog.json'), 'utf8'));
    return { characters, floors, walls, furniture, catalog };
  } catch {
    return null;
  }
}

export async function GET() {
  const networkMessages = await getNetworkMessages();
  if (networkMessages) {
    return NextResponse.json({ messages: networkMessages });
  }

  const now = Date.now();
  if (localMessagesCache && localMessagesCache.expiresAt > now) {
    return NextResponse.json({ messages: localMessagesCache.messages });
  }

  const messages: WebviewMessage[] = [];

  // Note: character/floor/wall/furniture assets are loaded by browserMock from local PNGs
  // Only send layout, settings, and agent data from here

  const layout = getDefaultLayout();
  if (layout) {
    messages.push({ type: 'layoutLoaded', layout });
  }

  messages.push({
    type: 'settingsLoaded',
    soundEnabled: true,
    extensionVersion: '1.3.0',
    lastSeenVersion: '1.2',
    watchAllSessions: true,
    alwaysShowLabels: true,
  });

  const opencodeProcessCount = getRunningProcessCount('opencode');
  const claudeProcessCount = getRunningProcessCount('claude');

  const opencodeSessions = newestSessionByProject(getOpencodeSessions())
    .sort((a, b) => b.time_updated - a.time_updated)
    .slice(0, opencodeProcessCount);
  const claudeSessions = newestSessionByProject(getClaudeCodeSessions())
    .sort((a, b) => b.time_updated - a.time_updated)
    .slice(0, claudeProcessCount);

  let agentId = 1;
  const allSessions = [...opencodeSessions, ...claudeSessions];

  for (const session of allSessions) {
    const projectName = session.provider === 'claude-code' ? session.title : path.basename(session.directory);
    const folderName = `${getLocalOwnerName()} · ${providerLabel(session.provider)} · ${projectName}`;

    messages.push({
      type: 'agentCreated',
      id: agentId,
      folderName,
      isExternal: true,
    });

    let hasActiveTools = false;

    if (session.provider === 'opencode') {
      const exportData = parseOpencodeExport(session.id);
      const msgs = exportData?.messages || [];
      const lastMsg = msgs[msgs.length - 1];
      
      if (lastMsg?.parts) {
        const runningTools = lastMsg.parts.filter((p: { type: string; state?: { status?: string } }) => 
          p.type === 'tool' && (p.state?.status === 'running' || p.state?.status === 'pending')
        );
        
        if (runningTools.length > 0) {
          hasActiveTools = true;
          
          for (const tool of runningTools.slice(0, 3)) {
            messages.push({
              type: 'agentToolStart',
              id: agentId,
              toolId: `opencode-${session.id}-${Date.now()}`,
              status: `Using ${tool.tool || 'tool'}`,
              toolName: tool.tool || 'tool',
            });
          }
        }
      }
    }

    messages.push({
      type: 'agentStatus',
      id: agentId,
      status: hasActiveTools ? 'active' : 'idle',
    });

    agentId++;
  }

  messages.push({ type: 'layoutReady' });

  localMessagesCache = { messages, expiresAt: Date.now() + localMessagesCacheTtlMs };

  return NextResponse.json({ messages });
}
