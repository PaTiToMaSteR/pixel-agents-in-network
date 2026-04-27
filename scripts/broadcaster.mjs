import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hubUrl = normalizeHubUrl(process.env.PIXEL_AGENTS_HUB_URL || process.argv[2] || 'http://127.0.0.1:8787');
const machineName = process.env.PIXEL_AGENTS_MACHINE_NAME || defaultOwnerName();
const machineId = `${os.hostname()}-${os.userInfo().username}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const intervalMs = Number(process.env.PIXEL_AGENTS_BROADCAST_INTERVAL_MS || 5000);
const verbose = process.env.PIXEL_AGENTS_LOG_LEVEL === 'debug';

function normalizeHubUrl(value) {
  if (value.startsWith('http://') || value.startsWith('https://')) return value.replace(/\/$/, '');
  return `http://${value.replace(/\/$/, '')}:8787`;
}

function defaultOwnerName() {
  try {
    const gitName = execSync('git config user.name', { encoding: 'utf8', timeout: 1000 }).trim();
    if (gitName) return gitName;
  } catch {}

  return os.hostname();
}

function getRunningProcessCount(processName) {
  try {
    const output = execSync('ps -axo comm=,args=', { encoding: 'utf8', timeout: 5000 });
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

function getOpencodeSessions() {
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
        sessions.push({ id: parts[0], title: parts[1], directory: parts[2], time_updated: Number(parts[3]), provider: 'opencode' });
      }
    }
  } catch {}
  return sessions;
}

function folderNameFromClaudeProjectDir(dirName) {
  const parts = dirName.replace(/^-+/, '').split('-');
  return parts[parts.length - 1] || dirName;
}

function getClaudeCodeSessions() {
  const sessions = [];
  const storageDir = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(storageDir)) return sessions;

  try {
    const entries = fs.readdirSync(storageDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectDir = path.join(entry.path, entry.name);
      const sessionDirs = [projectDir, path.join(projectDir, '.sessions')].filter((dir) => fs.existsSync(dir));
      for (const sessionDir of sessionDirs) {
        for (const file of fs.readdirSync(sessionDir).filter((name) => name.endsWith('.jsonl'))) {
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

function newestSessionByProject(sessions) {
  const byProject = new Map();

  for (const session of sessions) {
    const key = `${session.provider}:${session.directory}`;
    const existing = byProject.get(key);
    if (!existing || session.time_updated > existing.time_updated) byProject.set(key, session);
  }

  return [...byProject.values()];
}

function parseOpencodeExport(sessionId) {
  try {
    const output = execSync(`opencode export --json ${sessionId} 2>/dev/null || echo '{}'`, { encoding: 'utf8', timeout: 1000 });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function opencodeCurrentTool(sessionId) {
  const exportData = parseOpencodeExport(sessionId);
  const messages = exportData?.messages || [];
  const lastMessage = messages[messages.length - 1];
  const tool = lastMessage?.parts?.find((part) => part.type === 'tool' && ['running', 'pending'].includes(part.state?.status));
  return tool?.tool || null;
}

function providerLabel(provider) {
  return provider === 'claude-code' ? 'claude' : provider;
}

function agentLabel(session, projectName) {
  return `${machineName} · ${providerLabel(session.provider)} · ${projectName}`;
}

function discoverAgents() {
  const opencodeProcessCount = getRunningProcessCount('opencode');
  const claudeProcessCount = getRunningProcessCount('claude');
  const sessions = [
    ...newestSessionByProject(getOpencodeSessions()).sort((a, b) => b.time_updated - a.time_updated).slice(0, opencodeProcessCount),
    ...newestSessionByProject(getClaudeCodeSessions()).sort((a, b) => b.time_updated - a.time_updated).slice(0, claudeProcessCount),
  ];

  return sessions.map((session) => {
    const currentTool = session.provider === 'opencode' ? opencodeCurrentTool(session.id) : null;
    const projectName = session.provider === 'claude-code' ? session.title : path.basename(session.directory);
    return {
      agentId: `${session.provider}-${session.id}`,
      provider: session.provider,
      projectName,
      ownerName: machineName,
      label: agentLabel(session, projectName),
      status: currentTool ? 'active' : 'idle',
      currentTool,
      lastSeen: Date.now(),
    };
  });
}

async function broadcast() {
  const agents = discoverAgents();
  const snapshot = { machineId, machineName, hostname: os.hostname(), agents };
  try {
    const response = await fetch(`${hubUrl}/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (verbose) console.log(`[broadcaster] ${machineName}: ${agents.length} agents -> ${hubUrl}`);
  } catch (error) {
    console.error(`[broadcaster] failed to reach ${hubUrl}: ${error instanceof Error ? error.message : error}`);
  }
}

if (verbose) console.log(`[broadcaster] machine=${machineName} hub=${hubUrl}`);
await broadcast();
setInterval(broadcast, intervalMs);
