const providerIcons = {
  opencode: '/assets/provider-icons/opencode.svg',
  claude: '/assets/provider-icons/claude.svg',
  'claude-code': '/assets/provider-icons/claude.svg',
};

const compactLabelsKey = 'pixel-agents.compact-labels';
const layoutOriginKey = 'pixel-agents.layout-origin';
let latestSharedLayoutUpdatedAt = 0;

function getLayoutOrigin() {
  if (window.__pixelAgentsLayoutOrigin) return window.__pixelAgentsLayoutOrigin;

  let origin = localStorage.getItem(layoutOriginKey);
  if (!origin) {
    origin = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(layoutOriginKey, origin);
  }
  window.__pixelAgentsLayoutOrigin = origin;
  return origin;
}

function installLayoutSaveBridge() {
  if (window.__pixelAgentsLayoutSaveBridgeInstalled) return;

  window.__pixelAgentsLayoutSaveBridgeInstalled = true;
  const warn = console.warn.bind(console);
  console.log = (...args) => {
    const message = args[1];
    if (args[0] === '[vscode.postMessage]' && message?.type === 'saveLayout' && message.layout) {
      fetch('/api/layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layout: message.layout, origin: getLayoutOrigin() }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (typeof data?.updatedAt === 'number') latestSharedLayoutUpdatedAt = data.updatedAt;
        })
        .catch((error) => warn('[Pixel Agents] Failed to save shared layout', error));
    }
  };
}

function applySharedLayout(layout, updatedAt) {
  latestSharedLayoutUpdatedAt = updatedAt;
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'layoutLoaded', layout, force: true },
  }));
}

async function syncSharedLayout() {
  try {
    const response = await fetch('/api/layout', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.layout || typeof data.updatedAt !== 'number') return;
    if (data.updatedAt <= latestSharedLayoutUpdatedAt) return;
    if (data.origin && data.origin === getLayoutOrigin()) {
      latestSharedLayoutUpdatedAt = data.updatedAt;
      return;
    }

    applySharedLayout(data.layout, data.updatedAt);
  } catch {}
}

function installSharedLayoutSync() {
  if (window.__pixelAgentsSharedLayoutSyncInstalled) return;

  window.__pixelAgentsSharedLayoutSyncInstalled = true;
  setTimeout(syncSharedLayout, 1000);
  setInterval(syncSharedLayout, 2000);
}

async function loadSharedLayout() {
  try {
    const response = await fetch('/api/layout', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.layout) {
      alert('No saved layout found yet. Click Save after editing a layout first.');
      return;
    }

    applySharedLayout(data.layout, typeof data.updatedAt === 'number' ? data.updatedAt : Date.now());
  } catch (error) {
    alert(`Failed to load layout: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function installLoadLayoutButton() {
  const saveButton = [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === 'Save' && button.title === 'Save layout');
  if (!saveButton || document.querySelector('.pixel-agents-load-layout-button')) return;

  const loadButton = document.createElement('button');
  loadButton.className = `${saveButton.className} pixel-agents-load-layout-button`;
  loadButton.type = 'button';
  loadButton.title = 'Load saved shared layout';
  loadButton.textContent = 'Load';
  loadButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    loadSharedLayout();
  });

  saveButton.insertAdjacentElement('afterend', loadButton);
}

function compactLabelsEnabled() {
  return localStorage.getItem(compactLabelsKey) !== 'false';
}

function setCompactLabelsEnabled(enabled) {
  localStorage.setItem(compactLabelsKey, enabled ? 'true' : 'false');
  scheduleEnhanceLabels();
}

function installStyles() {
  if (document.getElementById('pixel-agents-label-enhancer-styles')) return;

  const style = document.createElement('style');
  style.id = 'pixel-agents-label-enhancer-styles';
  style.textContent = `
    .pixel-agents-compact-label {
      padding: 4px 8px 6px !important;
      gap: 4px !important;
      max-width: 170px !important;
      min-width: 0 !important;
      opacity: 0.88 !important;
    }

    .pixel-agents-compact-label img {
      width: 14px !important;
      height: 14px !important;
    }

    .pixel-agents-compact-label .pixel-agents-owner-status {
      font-size: 15px !important;
      line-height: 1.1 !important;
      max-width: 150px !important;
    }

    .pixel-agents-compact-label .pixel-agents-project-name {
      font-size: 12px !important;
      line-height: 1.1 !important;
      max-width: 150px !important;
      opacity: 0.9 !important;
    }

    .pixel-agents-status-dot {
      width: 8px !important;
      height: 8px !important;
      border-radius: 999px !important;
      display: inline-block !important;
      flex: 0 0 auto !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.35), 0 0 6px currentColor !important;
    }

    .pixel-agents-status-working {
      color: #4ade80 !important;
      background: #4ade80 !important;
    }

    .pixel-agents-status-idle {
      color: #f59e0b !important;
      background: #f59e0b !important;
    }

    .pixel-agents-status-talking {
      color: #38bdf8 !important;
      background: #38bdf8 !important;
    }

    .pixel-agents-label-setting {
      position: fixed;
      right: 12px;
      bottom: 12px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 9px;
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 6px;
      background: rgba(20, 17, 28, 0.86);
      color: #f4edf7;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      backdrop-filter: blur(4px);
    }

    .pixel-agents-label-setting input {
      width: 13px;
      height: 13px;
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}

function installSettingsControl() {
  if (document.getElementById('pixel-agents-compact-label-setting')) return;

  const label = document.createElement('label');
  label.id = 'pixel-agents-compact-label-setting';
  label.className = 'pixel-agents-label-setting';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = compactLabelsEnabled();
  checkbox.addEventListener('change', () => setCompactLabelsEnabled(checkbox.checked));

  label.appendChild(checkbox);
  label.appendChild(document.createTextNode('Compact labels'));
  document.body.appendChild(label);
}

function installDesktopContextMenuFix() {
  const isDesktopPointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!isDesktopPointer || window.__pixelAgentsContextMenuFixInstalled) return;

  window.__pixelAgentsContextMenuFixInstalled = true;
  window.addEventListener('contextmenu', (event) => {
    event.stopImmediatePropagation();
  }, true);
}

function parseAgentLabel(value) {
  const parts = value.split(' · ').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const [ownerName, provider, ...projectParts] = parts;
  return { ownerName, provider, projectName: projectParts.join(' · ') };
}

function normalizeStatus(ownerName, value) {
  const prefix = `${ownerName} · `;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function displayStatus(value) {
  const normalized = value.trim();
  if (normalized.toLowerCase() === 'idle') return 'Idle';
  if (normalized.toLowerCase() === 'talking') return 'Talking';
  if (normalized.toLowerCase().includes('approval')) return normalized;
  return 'Working';
}

function statusKind(value) {
  const normalized = value.toLowerCase();
  if (normalized === 'idle') return 'idle';
  if (normalized === 'talking') return 'talking';
  return 'working';
}

function enhancePanel(panel) {
  const spans = [...panel.querySelectorAll('span')]
    .filter((span) => !span.classList.contains('pixel-agents-status-dot'));
  if (spans.length < 2) return;

  const projectSpan = spans[spans.length - 1];
  const parsed = parseAgentLabel(projectSpan.textContent || '') || (
    panel.dataset.ownerName && panel.dataset.provider && panel.dataset.projectName
      ? {
        ownerName: panel.dataset.ownerName,
        provider: panel.dataset.provider,
        projectName: panel.dataset.projectName,
      }
      : null
  );
  if (!parsed) return;

  panel.dataset.ownerName = parsed.ownerName;
  panel.dataset.provider = parsed.provider;
  panel.dataset.projectName = parsed.projectName;

  const statusSpan = spans[spans.length - 2];
  const status = displayStatus(normalizeStatus(parsed.ownerName, statusSpan.textContent || 'Idle'));
  const kind = statusKind(status);
  const iconSrc = providerIcons[parsed.provider.toLowerCase()];
  const compact = compactLabelsEnabled();
  const desiredStatus = `${parsed.ownerName} · ${status}`;
  const currentIcon = statusSpan.querySelector('.pixel-agents-provider-icon');
  const currentDot = statusSpan.querySelector('.pixel-agents-status-dot');
  const iconMatches = !iconSrc || currentIcon?.getAttribute('src') === iconSrc;
  const dotMatches = currentDot?.dataset.statusKind === kind;
  const textMatches = statusSpan.textContent === desiredStatus;
  const projectMatches = projectSpan.textContent === parsed.projectName;
  const compactMatches = panel.classList.contains('pixel-agents-compact-label') === compact;

  if (iconMatches && dotMatches && textMatches && projectMatches && compactMatches) return;

  panel.classList.toggle('pixel-agents-compact-label', compact);

  statusSpan.textContent = '';
  statusSpan.classList.add('pixel-agents-owner-status');
  statusSpan.style.display = 'inline-flex';
  statusSpan.style.alignItems = 'center';
  statusSpan.style.justifyContent = 'center';
  statusSpan.style.gap = '5px';

  if (iconSrc) {
    const icon = document.createElement('img');
    icon.className = 'pixel-agents-provider-icon';
    icon.src = iconSrc;
    icon.alt = `${parsed.provider} logo`;
    icon.width = 14;
    icon.height = 14;
    icon.style.imageRendering = 'auto';
    icon.style.display = 'inline-block';
    icon.style.flex = '0 0 auto';
    statusSpan.appendChild(icon);
  }

  const dot = document.createElement('i');
  dot.className = `pixel-agents-status-dot pixel-agents-status-${kind}`;
  dot.dataset.statusKind = kind;
  dot.title = status;
  statusSpan.appendChild(dot);

  statusSpan.appendChild(document.createTextNode(`${parsed.ownerName} · ${status}`));
  projectSpan.classList.add('pixel-agents-project-name');
  projectSpan.textContent = parsed.projectName;
}

function enhanceLabels() {
  installLoadLayoutButton();
  installSharedLayoutSync();
  document.querySelectorAll('.pixel-panel').forEach(enhancePanel);
}

let enhanceQueued = false;

function scheduleEnhanceLabels() {
  if (enhanceQueued) return;
  enhanceQueued = true;
  requestAnimationFrame(() => {
    enhanceQueued = false;
    enhanceLabels();
  });
}

const observer = new MutationObserver(scheduleEnhanceLabels);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installStyles();
    installSettingsControl();
    installDesktopContextMenuFix();
    installLayoutSaveBridge();
    enhanceLabels();
  });
} else {
  installStyles();
  installSettingsControl();
  installDesktopContextMenuFix();
  installLayoutSaveBridge();
  enhanceLabels();
}
