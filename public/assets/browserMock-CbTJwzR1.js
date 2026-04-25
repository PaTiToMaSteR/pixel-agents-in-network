let payload = null;
const knownAgentIds = new Set();
const knownAgentTools = new Map();
const knownAgentStatuses = new Map();

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

export async function initBrowserMock() {
  console.log('[BrowserMock] Loading standalone assets...');
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
  console.log(
    `[BrowserMock] Ready: ${characters.length} chars, ${floorSprites.length} floors, ${wallSets.length} wall sets, ${furnitureCatalog.length} furniture items`,
  );
}

export async function dispatchMockMessages() {
  if (!payload) return;

  const dispatch = (data) => window.dispatchEvent(new MessageEvent('message', { data }));

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
      return Array.isArray(data.messages) ? data.messages : [];
    } catch (err) {
      console.error('[BrowserMock] Failed to load agent data:', err);
      return [];
    }
  };

  const normalizeAgentMessages = (messages) => {
    const currentAgentIds = new Set();
    const normalized = [];

    for (const message of messages) {
      if (message.type === 'agentCreated') {
        currentAgentIds.add(message.id);
        if (!knownAgentIds.has(message.id)) {
          knownAgentIds.add(message.id);
          normalized.push(message);
        }
        continue;
      }

      if (message.id !== undefined && message.type !== 'layoutReady') {
        currentAgentIds.add(message.id);
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
        if (knownAgentStatuses.get(message.id) === message.status) continue;
        knownAgentStatuses.set(message.id, message.status);
      }

      normalized.push(message);
    }

    for (const id of [...knownAgentIds]) {
      if (!currentAgentIds.has(id)) {
        knownAgentIds.delete(id);
        knownAgentTools.delete(id);
        knownAgentStatuses.delete(id);
        normalized.push({ type: 'agentClosed', id });
      }
    }

    return normalized;
  };

  const sendInitial = async () => {
    const agentMessages = await loadAgentMessages();
    [...assetMessages, ...normalizeAgentMessages(agentMessages)].forEach(dispatch);
    window.parent.postMessage({ type: 'layoutReady' }, '*');
  };

  const sendAgentUpdates = async () => {
    const agentMessages = await loadAgentMessages();
    normalizeAgentMessages(agentMessages).forEach(dispatch);
  };

  setTimeout(sendInitial, 0);
  [100, 500, 1000, 2000].forEach((delay) => setTimeout(sendAgentUpdates, delay));
  setInterval(sendAgentUpdates, 3000);

  console.log('[BrowserMock] Messages dispatched');
}
