import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';

const port = Number(process.env.PIXEL_AGENTS_HUB_PORT || 8787);
const ttlMs = Number(process.env.PIXEL_AGENTS_TTL_MS || 15000);
const discoveryPort = Number(process.env.PIXEL_AGENTS_DISCOVERY_PORT || 47877);
const discoveryGroup = process.env.PIXEL_AGENTS_DISCOVERY_GROUP || '239.255.42.99';
const machines = new Map();
let sharedLayout = null;
let sharedLayoutUpdatedAt = 0;
let sharedLayoutOrigin = null;

function getLanIp() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function activeMachines() {
  const now = Date.now();
  for (const [id, snapshot] of machines) {
    if (now - snapshot.lastSeen > ttlMs) machines.delete(id);
  }
  return [...machines.values()].sort((a, b) => a.machineName.localeCompare(b.machineName));
}

function stableNumericId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483647;
}

function nonOverlappingNumericId(value, usedIds, usedIdleSlots) {
  const base = stableNumericId(value);

  for (let offset = 0; offset < 7; offset += 1) {
    const id = base + offset > 2147483646 ? base + offset - 2147483646 : base + offset;
    const idleSlot = id % 7;
    if (!usedIds.has(id) && !usedIdleSlots.has(idleSlot)) {
      usedIds.add(id);
      usedIdleSlots.add(idleSlot);
      return id;
    }
  }

  let id = base;
  while (usedIds.has(id)) id = id === 2147483646 ? 1 : id + 1;
  usedIds.add(id);
  usedIdleSlots.add(id % 7);
  return id;
}

function toMessages() {
  const messages = [];
  const usedIds = new Set();
  const usedIdleSlots = new Set();
  const visibleAgents = new Map();

  for (const machine of activeMachines()) {
    for (const agent of machine.agents || []) {
      const key = `${machine.hostname || machine.machineId}:${agent.provider || 'agent'}:${agent.projectName || agent.agentId}`;
      const existing = visibleAgents.get(key);
      if (!existing || (agent.lastSeen || machine.lastSeen || 0) > (existing.agent.lastSeen || existing.machine.lastSeen || 0)) {
        visibleAgents.set(key, { machine, agent });
      }
    }
  }

  for (const { machine, agent } of [...visibleAgents.values()].sort((a, b) => {
    const ownerCompare = (a.agent.ownerName || a.machine.machineName || '').localeCompare(b.agent.ownerName || b.machine.machineName || '');
    if (ownerCompare !== 0) return ownerCompare;
    return (a.agent.projectName || '').localeCompare(b.agent.projectName || '');
  })) {
    const id = nonOverlappingNumericId(`${machine.hostname || machine.machineId}:${agent.provider || 'agent'}:${agent.projectName || agent.agentId}`, usedIds, usedIdleSlots);
    const status = agent.status || 'idle';
    const fallbackLabel = `${agent.ownerName || machine.machineName} · ${agent.provider || 'agent'} · ${agent.projectName || 'unknown'}`;
    const folderName = agent.label || fallbackLabel;

    messages.push({ type: 'agentCreated', id, folderName, isExternal: true });

    if (agent.currentTool) {
      messages.push({
        type: 'agentToolStart',
        id,
        toolId: `${machine.machineId}-${agent.agentId}-${agent.currentTool}`,
        status: `Using ${agent.currentTool}`,
        toolName: agent.currentTool,
      });
    }

    messages.push({ type: 'agentStatus', id, status });
  }

  messages.push({ type: 'layoutReady' });
  return messages;
}

function agentIdentity(agent) {
  return `${agent.provider || 'agent'}:${agent.projectName || agent.agentId}`;
}

function removeOverlappingSnapshots(snapshot) {
  const hostname = snapshot.hostname;
  if (!hostname) return;

  const incomingAgents = new Set((snapshot.agents || []).map(agentIdentity));
  for (const [id, existing] of machines) {
    if (id === snapshot.machineId || existing.hostname !== hostname) continue;
    const overlaps = (existing.agents || []).some((agent) => incomingAgents.has(agentIdentity(agent)));
    if (overlaps) machines.delete(id);
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, machines: activeMachines().length });
    return;
  }

  if (req.method === 'GET' && req.url === '/state') {
    sendJson(res, 200, { machines: activeMachines() });
    return;
  }

  if (req.method === 'GET' && req.url === '/messages') {
    sendJson(res, 200, { messages: toMessages() });
    return;
  }

  if (req.method === 'GET' && req.url === '/layout') {
    sendJson(res, 200, { layout: sharedLayout, updatedAt: sharedLayoutUpdatedAt, origin: sharedLayoutOrigin });
    return;
  }

  if (req.method === 'POST' && req.url === '/layout') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.layout || body.layout.version !== 1) {
        sendJson(res, 400, { error: 'Expected version 1 layout' });
        return;
      }
      sharedLayout = body.layout;
      sharedLayoutUpdatedAt = Date.now();
      sharedLayoutOrigin = typeof body.origin === 'string' ? body.origin : null;
      sendJson(res, 200, { ok: true, updatedAt: sharedLayoutUpdatedAt, origin: sharedLayoutOrigin });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Bad request' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/snapshot') {
    try {
      const snapshot = JSON.parse(await readBody(req));
      if (!snapshot.machineId || !Array.isArray(snapshot.agents)) {
        sendJson(res, 400, { error: 'Expected machineId and agents[]' });
        return;
      }
      removeOverlappingSnapshots(snapshot);
      machines.set(snapshot.machineId, { ...snapshot, lastSeen: Date.now() });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Bad request' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/reset-host') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.hostname) {
        sendJson(res, 400, { error: 'Expected hostname' });
        return;
      }

      let removed = 0;
      for (const [id, snapshot] of machines) {
        if (snapshot.hostname === body.hostname && id !== body.machineId) {
          machines.delete(id);
          removed++;
        }
      }

      sendJson(res, 200, { ok: true, removed });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Bad request' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(port, '0.0.0.0', () => {
  if (process.env.PIXEL_AGENTS_LOG_LEVEL === 'debug') console.log(`[hub] listening on http://0.0.0.0:${port}`);
});

const discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
discoverySocket.bind(() => {
  discoverySocket.setMulticastTTL(1);
});

setInterval(() => {
  const payload = Buffer.from(JSON.stringify({
    type: 'pixel-agents-hub',
    url: `http://${getLanIp()}:${port}`,
    port,
    machineName: os.hostname(),
  }));
  discoverySocket.send(payload, discoveryPort, discoveryGroup);
}, 1000);
