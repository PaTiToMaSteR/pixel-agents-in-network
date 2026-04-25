const providerIcons = {
  opencode: './assets/provider-icons/opencode.svg',
  claude: './assets/provider-icons/claude.svg',
  'claude-code': './assets/provider-icons/claude.svg',
};

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
  const parsed = parseAgentLabel(projectSpan.textContent || '');
  if (!parsed) return;

  const statusSpan = spans[spans.length - 2];
  const status = normalizeStatus(parsed.ownerName, statusSpan.textContent || 'Idle');
  const iconSrc = providerIcons[parsed.provider.toLowerCase()];

  statusSpan.textContent = '';
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
  projectSpan.textContent = parsed.projectName;
}

function enhanceLabels() {
  document.querySelectorAll('.pixel-panel').forEach(enhancePanel);
}

const observer = new MutationObserver(enhanceLabels);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceLabels);
} else {
  enhanceLabels();
}
