let payload = null;

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
  const baseMessages = [
    { type: 'characterSpritesLoaded', characters: payload.characters },
    { type: 'floorTilesLoaded', sprites: payload.floorSprites },
    { type: 'wallTilesLoaded', sets: payload.wallSets },
    {
      type: 'furnitureAssetsLoaded',
      catalog: payload.furnitureCatalog,
      sprites: payload.furnitureSprites,
    },
    { type: 'layoutLoaded', layout: payload.layout },
    {
      type: 'settingsLoaded',
      soundEnabled: true,
      extensionVersion: '1.3.0',
      lastSeenVersion: '1.2',
      watchAllSessions: true,
      alwaysShowLabels: true,
    },
  ];

  let agentMessages = [];

  try {
    const data = await getJson('/api/mock-data');
    if (Array.isArray(data.messages)) agentMessages = data.messages;
  } catch (err) {
    console.error('[BrowserMock] Failed to load agent data:', err);
  }

  const sendAll = () => {
    [...baseMessages, ...agentMessages].forEach(dispatch);
    window.parent.postMessage({ type: 'layoutReady' }, '*');
  };

  [0, 100, 500, 1000, 2000].forEach((delay) => setTimeout(sendAll, delay));

  console.log('[BrowserMock] Messages dispatched');
}
