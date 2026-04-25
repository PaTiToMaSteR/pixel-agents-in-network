'use client';

export default function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <iframe
        src="/index.html"
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Pixel Agents"
      />

      <div style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: '#1a1a2e',
        border: '1px solid #2a2a3a',
        borderRadius: 8,
        padding: '12px 16px',
        color: '#e5e5e5',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 12,
        zIndex: 1000,
      }}>
        <div style={{ fontWeight: 600 }}>Pixel Agents</div>
        <div style={{ color: '#4ade80', marginTop: 4 }}>
          ● Connected
        </div>
      </div>
    </div>
  );
}
