const providerIcons = {
  opencode: '/assets/provider-icons/opencode.svg',
  claude: '/assets/provider-icons/claude.svg',
  'claude-code': '/assets/provider-icons/claude.svg',
};

const compactLabelsKey = 'pixel-agents.compact-labels';

function compactLabelsEnabled() {
  return localStorage.getItem(compactLabelsKey) !== 'false';
}

function setCompactLabelsEnabled(enabled) {
  localStorage.setItem(compactLabelsKey, enabled ? 'true' : 'false');
  enhanceLabels();
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
      width: 12px !important;
      height: 12px !important;
    }

    .pixel-agents-compact-label .pixel-agents-owner-status {
      font-size: 13px !important;
      line-height: 1.05 !important;
      max-width: 150px !important;
    }

    .pixel-agents-compact-label .pixel-agents-project-name {
      font-size: 10px !important;
      line-height: 1.05 !important;
      max-width: 150px !important;
      opacity: 0.9 !important;
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

function fitRoomOnFirstLoad() {
  if (window.__pixelAgentsFitRoomDone) return;

  const canvas = document.querySelector('canvas');
  if (!canvas) return;

  window.__pixelAgentsFitRoomDone = true;
  requestAnimationFrame(() => {
    for (let index = 0; index < 8; index += 1) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: 60,
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      }));
    }
  });
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

function enhancePanel(panel) {
  const spans = [...panel.querySelectorAll('span')];
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
  const status = normalizeStatus(parsed.ownerName, statusSpan.textContent || 'Idle');
  const iconSrc = providerIcons[parsed.provider.toLowerCase()];
  const compact = compactLabelsEnabled();

  panel.classList.toggle('pixel-agents-compact-label', compact);

  statusSpan.textContent = '';
  statusSpan.classList.add('pixel-agents-owner-status');
  statusSpan.style.display = 'inline-flex';
  statusSpan.style.alignItems = 'center';
  statusSpan.style.justifyContent = 'center';
  statusSpan.style.gap = '5px';

  if (iconSrc) {
    const icon = document.createElement('img');
    icon.src = iconSrc;
    icon.alt = `${parsed.provider} logo`;
    icon.width = 14;
    icon.height = 14;
    icon.style.imageRendering = 'auto';
    icon.style.display = 'inline-block';
    icon.style.flex = '0 0 auto';
    statusSpan.appendChild(icon);
  }

  statusSpan.appendChild(document.createTextNode(`${parsed.ownerName} · ${status}`));
  projectSpan.classList.add('pixel-agents-project-name');
  projectSpan.textContent = parsed.projectName;
}

function enhanceLabels() {
  fitRoomOnFirstLoad();
  document.querySelectorAll('.pixel-panel').forEach(enhancePanel);
}

const observer = new MutationObserver(enhanceLabels);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installStyles();
    installSettingsControl();
    enhanceLabels();
  });
} else {
  installStyles();
  installSettingsControl();
  enhanceLabels();
}
