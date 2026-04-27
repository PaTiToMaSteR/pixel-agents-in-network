let payload = null;
const knownAgentIds = new Set();
const knownAgentTools = new Map();
const knownAgentStatuses = new Map();
const missingAgentCounts = new Map();
const idleSince = new Map();
const idleAwayTimers = new Map();
const idleSofaTimers = new Map();
const lastIdleAwaySent = new Map();
let agentLoadErrorLogged = false;
let eventsStarted = false;

const missingAgentCloseThreshold = 3;
const idleAwayDelayMs = 20000;
const idleAwayRepeatMs = 20000;
const idleSofaDelayMs = 60000;
const idleSofaRepeatMinMs = 45000;
const idleSofaRepeatMaxMs = 120000;

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function initBrowserMock() {
  const [characters, floorSprites, wallSets, furnitureSprites, furnitureCatalog, assetIndex] =
    await Promise.all([
      getJson('./assets/decoded/characters.json'),
      getJson('./assets/decoded/floors.json'),
      getJson('./assets/decoded/walls.json'),
      getJson('./assets/decoded/furniture.json'),
      getJson('./assets/furniture-catalog.json'),
      getJson('./assets/asset-index.json'),
    ]);

  const layout = assetIndex.defaultLayout
    ? await getJson(`./assets/${assetIndex.defaultLayout}`)
    : null;

  payload = { characters, floorSprites, wallSets, furnitureSprites, furnitureCatalog, layout };
}

export async function dispatchMockMessages() {
  if (!payload) return;

  const dispatch = (data) => window.dispatchEvent(new MessageEvent('message', { data }));

  const clearIdleAwayTimer = (id) => {
    const timer = idleAwayTimers.get(id);
    if (timer) clearTimeout(timer);
    idleAwayTimers.delete(id);
  };

  const clearIdleSofaTimer = (id) => {
    const timer = idleSofaTimers.get(id);
    if (timer) clearTimeout(timer);
    idleSofaTimers.delete(id);
  };

  const randomSofaDelay = () =>
    idleSofaRepeatMinMs + Math.floor(Math.random() * (idleSofaRepeatMaxMs - idleSofaRepeatMinMs));

  const scheduleIdleAway = (id) => {
    if (idleAwayTimers.has(id)) return;
    const timer = setTimeout(() => {
      idleAwayTimers.delete(id);
      if (!knownAgentIds.has(id) || knownAgentStatuses.get(id) !== 'idle') return;
      lastIdleAwaySent.set(id, Date.now());
      dispatch({ type: 'agentStatus', id, status: 'idle', away: true });
      scheduleIdleAway(id);
    }, idleAwayDelayMs);
    idleAwayTimers.set(id, timer);
  };

  const scheduleIdleSofa = (id, delay = idleSofaDelayMs) => {
    if (idleSofaTimers.has(id)) return;
    const timer = setTimeout(() => {
      idleSofaTimers.delete(id);
      if (!knownAgentIds.has(id) || knownAgentStatuses.get(id) !== 'idle') return;
      clearIdleAwayTimer(id);
      dispatch({ type: 'agentStatus', id, status: 'idle', sofa: true });
      scheduleIdleSofa(id, randomSofaDelay());
    }, delay);
    idleSofaTimers.set(id, timer);
  };

  const initialLayout = payload.layout;
  const assetMessages = [
    { type: 'characterSpritesLoaded', characters: payload.characters },
    { type: 'floorTilesLoaded', sprites: payload.floorSprites },
    { type: 'wallTilesLoaded', sets: payload.wallSets },
    {
      type: 'furnitureAssetsLoaded',
      catalog: payload.furnitureCatalog,
      sprites: payload.furnitureSprites,
    },
    { type: 'layoutLoaded', layout: initialLayout },
    {
      type: 'settingsLoaded',
      soundEnabled: true,
      extensionVersion: '1.3.0',
      lastSeenVersion: '1.2',
      watchAllSessions: true,
      alwaysShowLabels: true,
    },
  ];

  const loadAgentMessages = async () => {
    try {
      const data = await getJson('/api/mock-data');
      agentLoadErrorLogged = false;
      return Array.isArray(data.messages) ? data.messages : [];
    } catch (err) {
      if (!agentLoadErrorLogged) {
        console.warn('[BrowserMock] Agent data temporarily unavailable; keeping current agents.', err);
        agentLoadErrorLogged = true;
      }
      return null;
    }
  };

  const normalizeAgentMessages = (messages) => {
    const currentAgentIds = new Set();
    const normalized = [];
    const now = Date.now();

    for (const message of messages) {
      if (message.type === 'agentCreated') {
        currentAgentIds.add(message.id);
        missingAgentCounts.delete(message.id);
        if (!knownAgentIds.has(message.id)) {
          knownAgentIds.add(message.id);
          normalized.push(message);
        }
        continue;
      }

      if (message.id !== undefined && message.type !== 'layoutReady') {
        currentAgentIds.add(message.id);
        missingAgentCounts.delete(message.id);
      }

      if (message.type === 'layoutLoaded' || message.type === 'settingsLoaded') continue;

      if (message.type === 'agentToolStart') {
        const toolName = message.toolName || message.status || '';
        if (knownAgentTools.get(message.id) !== toolName) {
          knownAgentTools.set(message.id, toolName);
          normalized.push(message);
        }
        continue;
      }

      if (message.type === 'agentStatus' && message.status !== 'active' && knownAgentTools.has(message.id)) {
        knownAgentTools.delete(message.id);
        normalized.push({ type: 'agentToolsClear', id: message.id });
      }

      if (message.type === 'agentStatus') {
        const previousStatus = knownAgentStatuses.get(message.id);

        if (message.status === 'idle') {
          if (previousStatus !== 'idle' || !idleSince.has(message.id)) {
            idleSince.set(message.id, now);
            scheduleIdleAway(message.id);
            scheduleIdleSofa(message.id);
          }

          const startedAt = idleSince.get(message.id) || now;
          const lastAway = lastIdleAwaySent.get(message.id) || 0;
          const shouldSendAway = now - startedAt >= idleAwayDelayMs && now - lastAway >= idleAwayRepeatMs;

          if (shouldSendAway) {
            message = { ...message, away: true };
            lastIdleAwaySent.set(message.id, now);
          } else if (previousStatus === 'idle') {
            continue;
          }
        } else {
          idleSince.delete(message.id);
          clearIdleAwayTimer(message.id);
          clearIdleSofaTimer(message.id);
          lastIdleAwaySent.delete(message.id);
          if (previousStatus === message.status) continue;
        }

        knownAgentStatuses.set(message.id, message.status);
      }

      normalized.push(message);
    }

    for (const id of [...knownAgentIds]) {
      if (!currentAgentIds.has(id)) {
        const missingCount = (missingAgentCounts.get(id) || 0) + 1;
        missingAgentCounts.set(id, missingCount);
        if (missingCount < missingAgentCloseThreshold) continue;

        knownAgentIds.delete(id);
        knownAgentTools.delete(id);
        knownAgentStatuses.delete(id);
        missingAgentCounts.delete(id);
        idleSince.delete(id);
        clearIdleAwayTimer(id);
        clearIdleSofaTimer(id);
        lastIdleAwaySent.delete(id);
        normalized.push({ type: 'agentClosed', id });
      }
    }

    return normalized;
  };

  const sendInitial = async () => {
    const agentMessages = await loadAgentMessages();
    [...assetMessages, ...normalizeAgentMessages(agentMessages || [])].forEach(dispatch);
    window.parent.postMessage({ type: 'layoutReady' }, '*');
  };

  const sendAgentUpdates = async () => {
    const agentMessages = await loadAgentMessages();
    if (!agentMessages) return;
    normalizeAgentMessages(agentMessages).forEach(dispatch);
  };

  const startEventStream = () => {
    if (eventsStarted || !('EventSource' in window)) return false;
    eventsStarted = true;

    const source = new EventSource('/api/events');
    source.addEventListener('messages', (event) => {
      try {
        const data = JSON.parse(event.data);
        const messages = Array.isArray(data.messages) ? data.messages : [];
        normalizeAgentMessages(messages).forEach(dispatch);
      } catch (err) {
        console.warn('[BrowserMock] Failed to process live agent event.', err);
      }
    });
    source.addEventListener('error', () => {
      if (!agentLoadErrorLogged) {
        console.warn('[BrowserMock] Live agent events unavailable; polling fallback remains active.');
        agentLoadErrorLogged = true;
      }
    });
    return true;
  };

  setTimeout(sendInitial, 0);
  [500, 2000].forEach((delay) => setTimeout(sendAgentUpdates, delay));
  startEventStream();
  setInterval(sendAgentUpdates, 30000);
}
