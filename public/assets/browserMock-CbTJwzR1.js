let payload = null;

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function duplicateOfficeLayout(layout) {
  if (!layout || layout.version !== 1 || !Array.isArray(layout.tiles)) return layout;

  const copies = 2;
  const gapCols = 2;
  const cols = layout.cols * copies + gapCols * (copies - 1);
  const rows = layout.rows;
  const tiles = [];
  const tileColors = [];
  const sourceColors = Array.isArray(layout.tileColors)
    ? layout.tileColors
    : Array.from({ length: layout.tiles.length }, () => null);

  for (let row = 0; row < rows; row += 1) {
    const tileRow = layout.tiles.slice(row * layout.cols, (row + 1) * layout.cols);
    const colorRow = sourceColors.slice(row * layout.cols, (row + 1) * layout.cols);

    for (let copy = 0; copy < copies; copy += 1) {
      tiles.push(...tileRow);
      tileColors.push(...colorRow);

      if (copy < copies - 1) {
        tiles.push(...Array.from({ length: gapCols }, () => 255));
        tileColors.push(...Array.from({ length: gapCols }, () => null));
      }
    }
  }

  const furniture = [];
  for (let copy = 0; copy < copies; copy += 1) {
    const colOffset = copy * (layout.cols + gapCols);
    for (const item of layout.furniture || []) {
      furniture.push({
        ...item,
        uid: copy === 0 ? item.uid : `${item.uid}-copy-${copy}`,
        col: item.col + colOffset,
      });
    }
  }

  return {
    ...layout,
    cols,
    rows,
    layoutRevision: (layout.layoutRevision || 1) + 1,
    tiles,
    tileColors,
    furniture,
  };
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

  payload = { characters, floorSprites, wallSets, furnitureSprites, furnitureCatalog, layout: duplicateOfficeLayout(layout) };
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

  const loadAgentMessages = async () => {
    try {
      const data = await getJson('/api/mock-data');
      return Array.isArray(data.messages) ? data.messages : [];
    } catch (err) {
      console.error('[BrowserMock] Failed to load agent data:', err);
      return [];
    }
  };

  const sendAll = async () => {
    const agentMessages = await loadAgentMessages();
    [...baseMessages, ...agentMessages].forEach(dispatch);
    window.parent.postMessage({ type: 'layoutReady' }, '*');
  };

  [0, 100, 500, 1000, 2000].forEach((delay) => setTimeout(sendAll, delay));
  setInterval(sendAll, 3000);

  console.log('[BrowserMock] Messages dispatched');
}
