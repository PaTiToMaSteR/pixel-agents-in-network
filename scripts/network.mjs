import { execSync, spawn } from 'node:child_process';
import dgram from 'node:dgram';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const devMode = Boolean(args.dev);
const webPort = Number(args.port || args['web-port'] || 4555);
const hubPort = Number(args['hub-port'] || 8787);
const discoveryPort = Number(args['discovery-port'] || 47877);
const discoveryGroup = args['discovery-group'] || '239.255.42.99';
const lanIp = args.ip || getLanIp() || '127.0.0.1';
const machineName = args.name || defaultOwnerName();
const explicitHub = args.hub || args['hub-url'];
const discoveredHub = explicitHub ? null : await discoverHub();
const joinedRemoteHub = Boolean(explicitHub || discoveredHub);
const hubUrl = normalizeHubUrl(explicitHub || discoveredHub || `127.0.0.1:${hubPort}`);
const publicHubUrl = normalizeHubUrl(explicitHub || discoveredHub || `${lanIp}:${hubPort}`);
const children = [];

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function normalizeHubUrl(value) {
  const raw = String(value).replace(/\/$/, '');
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `http://${raw.includes(':') ? raw : `${raw}:8787`}`;
}

function getLanIp() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

function defaultOwnerName() {
  try {
    const gitName = execSync('git config user.name', { encoding: 'utf8', timeout: 1000 }).trim();
    if (gitName) return gitName;
  } catch {}

  return os.hostname();
}

function discoverHub(timeoutMs = 1800) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const timer = setTimeout(() => {
      socket.close();
      resolve(null);
    }, timeoutMs);

    socket.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString('utf8'));
        if (payload.type === 'pixel-agents-hub' && payload.url) {
          clearTimeout(timer);
          socket.close();
          resolve(payload.url);
        }
      } catch {}
    });

    socket.bind(discoveryPort, () => {
      try {
        socket.addMembership(discoveryGroup);
      } catch {}
    });
  });
}

function run(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, { stdio: 'inherit', shell: false, ...options });
  children.push(child);
  child.on('exit', (code) => {
    if (code && !shuttingDown) shutdown(code);
  });
  return child;
}

function runSyncStep(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: 'inherit', shell: false, ...options });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

function moveStaleNextBuild() {
  const nextDir = path.join(process.cwd(), '.next');
  if (!fs.existsSync(nextDir)) return;

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  let staleDir = path.join(process.cwd(), `.next.stale-${stamp}`);
  let suffix = 1;
  while (fs.existsSync(staleDir)) {
    staleDir = path.join(process.cwd(), `.next.stale-${stamp}-${suffix}`);
    suffix += 1;
  }
  fs.renameSync(nextDir, staleDir);
  console.log(`[network] moved stale .next to ${path.basename(staleDir)}`);
}

let shuttingDown = false;
function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (!fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
  console.log('[network] node_modules missing, running npm install');
  await runSyncStep('npm', ['install']);
}

if (!devMode) {
  console.log('[network] building web app');
  await runSyncStep('npm', ['run', 'build']);
} else {
  moveStaleNextBuild();
}

if (!joinedRemoteHub) {
  run(process.execPath, ['scripts/hub.mjs'], {
    env: {
      ...process.env,
      PIXEL_AGENTS_HUB_PORT: String(hubPort),
      PIXEL_AGENTS_DISCOVERY_PORT: String(discoveryPort),
      PIXEL_AGENTS_DISCOVERY_GROUP: discoveryGroup,
    },
  });
}

run(process.execPath, ['scripts/broadcaster.mjs'], {
  env: {
    ...process.env,
    PIXEL_AGENTS_HUB_URL: hubUrl,
    PIXEL_AGENTS_MACHINE_NAME: machineName,
  },
});

run('npx', ['next', devMode ? 'dev' : 'start', '-p', String(webPort)], {
  env: {
    ...process.env,
    PIXEL_AGENTS_HUB_URL: hubUrl,
    NEXT_PUBLIC_PIXEL_AGENTS_HUB_URL: publicHubUrl,
  },
});

const appUrl = `http://127.0.0.1:${webPort}`;
setTimeout(() => {
  spawn('open', [appUrl], { stdio: 'ignore', detached: true }).unref();
}, 1500);

console.log('');
console.log(`[network] room: ${appUrl}`);
console.log(`[network] LAN room: http://${lanIp}:${webPort}`);
console.log(`[network] hub: ${publicHubUrl}`);
console.log(`[network] web mode: ${devMode ? 'next dev with hot reload' : 'next start'}`);
if (discoveredHub) {
  console.log(`[network] discovered existing LAN hub: ${discoveredHub}`);
} else if (!joinedRemoteHub) {
  console.log('[network] no LAN hub found, started one on this machine');
  console.log('[network] other machines can join automatically with: npm run network');
}
console.log('[network] press Ctrl+C to stop');
