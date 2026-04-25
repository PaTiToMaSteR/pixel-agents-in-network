import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

async function main() {
  const messages = [];

  try {
    const [characters, floors, walls, furniture, catalog, layout] = await Promise.all([
      fetch('./assets/decoded/characters.json').then(r => r.json()),
      fetch('./assets/decoded/floors.json').then(r => r.json()),
      fetch('./assets/decoded/walls.json').then(r => r.json()),
      fetch('./assets/decoded/furniture.json').then(r => r.json()),
      fetch('./assets/furniture-catalog.json').then(r => r.json()),
      fetch('./assets/default-layout-1.json').then(r => r.json()).catch(() => null),
    ]);

    messages.push({ type: 'characterSpritesLoaded', characters });
    messages.push({ type: 'floorTilesLoaded', sprites: floors });
    messages.push({ type: 'wallTilesLoaded', sets: walls });
    messages.push({ type: 'furnitureAssetsLoaded', catalog, sprites: furniture });
    if (layout) messages.push({ type: 'layoutLoaded', layout });
  } catch (err) {
    console.error('[WebLoader] Failed to load assets:', err);
  }

  try {
    const res = await fetch('/api/mock-data');
    const data = await res.json();
    if (data.messages) messages.push(...data.messages);
  } catch (err) {
    console.error('[WebLoader] Failed to fetch agent data:', err);
  }

  messages.forEach((msg) => {
    window.dispatchEvent(new MessageEvent('message', { data: msg }));
  });

  createRoot(document.getElementById('root')).render(
    React.createElement(StrictMode, null, React.createElement(App))
  );
}

main().catch(console.error);