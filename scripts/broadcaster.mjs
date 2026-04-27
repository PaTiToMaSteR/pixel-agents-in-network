import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hubUrl = normalizeHubUrl(process.env.PIXEL_AGENTS_HUB_URL || process.argv[2] || 'http://127.0.0.1:8787');
const machineName = process.env.PIXEL_AGENTS_MACHINE_NAME || defaultOwnerName();
const machineId = `${os.hostname()}-${os.userInfo().username}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const intervalMs = Number(process.env.PIXEL_AGENTS_BROADCAST_INTERVAL_MS || 5000);
const verbose = process.env.PIXEL_AGENTS_LOG_LEVEL === 'debug';
const opencodeActiveToolStatuses = new Set(['running', 'pending']);

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

function getRunningProcesses(processName) {
  const processes = [];

  try {
    const output = execSync('ps -axo pid=,comm=,args=', { encoding: 'utf8', timeout: 5000 });

    for (const line of output.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) continue;

      const pid = Number(match[1]);
      const command = match[2];
      const argsText = match[3] || '';
      if (!Number.isInteger(pid) || path.basename(command) !== processName) continue;

      const args = argsText.trim().split(/\s+/).filter(Boolean);
      if (processName === 'opencode' && (args.length !== 1 || path.basename(args[0]) !== processName)) continue;

      let cwd = null;
      try {
        const cwdOutput = execSync(`lsof -a -p ${pid} -d cwd -Fn`, { encoding: 'utf8', timeout: 1000 });
        cwd = cwdOutput
          .split('\n')
          .find((entry) => entry.startsWith('n'))
          ?.slice(1) || null;
      } catch {}

      processes.push({ pid, cwd });
    }
  } catch {
    return processes;
  }

  return processes;
}

function getOpencodeSessions() {
  const sessions = [];
  const dbPath = getOpencodeDbPath();
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

function getOpencodeDbPath() {
  return path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
}

function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
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

function opencodeCurrentTool(session) {
  const dbPath = getOpencodeDbPath();
  if (!fs.existsSync(dbPath)) return null;

  try {
    const result = execSync(
      `sqlite3 -json "${dbPath}" "SELECT time_updated, data FROM part WHERE session_id = ${sqlString(session.id)} ORDER BY time_updated DESC LIMIT 120;"`,
      { encoding: 'utf8', timeout: 1000 },
    );
    const rows = JSON.parse(result || '[]');
    let latestStepMarker = null;

    for (const row of rows) {
      if (!row.data) continue;

      let part;
      try {
        part = JSON.parse(row.data);
      } catch {
        continue;
      }

      if (!latestStepMarker && (part.type === 'step-start' || part.type === 'step-finish')) {
        latestStepMarker = part.type;
      }

      const toolStatus = part.state?.status || part.status;
      if (part.type === 'tool' && toolStatus && opencodeActiveToolStatuses.has(toolStatus)) {
        return part.tool || 'Working';
      }

      if ((part.type === 'text' || part.type === 'reasoning') && part.time?.start && !part.time?.end) {
        return 'Working';
      }
    }

    if (latestStepMarker === 'step-start') return 'Working';

    const recentlyUpdatedMs = Date.now() - session.time_updated;
    if (recentlyUpdatedMs >= 0 && recentlyUpdatedMs < 10000) return 'Working';

    return null;
  } catch {
    return null;
  }
}

function providerLabel(provider) {
  return provider === 'claude-code' ? 'claude' : provider;
}

function pickRunningSessions(sessions, runningProcesses) {
  const selected = [];
  const usedSessionIds = new Set();
  const sessionsByDirectory = new Map();

  for (const session of sessions) {
    const list = sessionsByDirectory.get(session.directory) || [];
    list.push(session);
    sessionsByDirectory.set(session.directory, list);
  }

  for (const list of sessionsByDirectory.values()) {
    list.sort((a, b) => b.time_updated - a.time_updated);
  }

  for (const process of runningProcesses) {
    if (!process.cwd) continue;
    const candidates = sessionsByDirectory.get(process.cwd) || [];
    const session = candidates.find((candidate) => !usedSessionIds.has(candidate.id));
    if (!session) continue;
    selected.push(session);
    usedSessionIds.add(session.id);
  }

  if (selected.length > 0 || runningProcesses.length === 0) return selected;

  return sessions
    .sort((a, b) => b.time_updated - a.time_updated)
    .slice(0, runningProcesses.length);
}

function agentLabel(session, projectName) {
  return `${machineName} · ${providerLabel(session.provider)} · ${projectName}`;
}

function discoverAgents() {
  const opencodeProcesses = getRunningProcesses('opencode');
  const claudeProcesses = getRunningProcesses('claude');
  const sessions = [
    ...pickRunningSessions(getOpencodeSessions(), opencodeProcesses),
    ...pickRunningSessions(getClaudeCodeSessions(), claudeProcesses),
  ];

  return sessions.map((session) => {
    const currentTool = session.provider === 'opencode' ? opencodeCurrentTool(session) : null;
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

async function resetHostSnapshots() {
  try {
    await fetch(`${hubUrl}/reset-host`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hostname: os.hostname(), machineId }),
    });
  } catch {}
}

if (verbose) console.log(`[broadcaster] machine=${machineName} hub=${hubUrl}`);
await resetHostSnapshots();
await broadcast();
setInterval(broadcast, intervalMs);
