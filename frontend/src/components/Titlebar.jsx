import { useState, useEffect } from 'react';
import { BRAND_NAME } from '../brand';

export default function Titlebar() {
  const [isTauri, setIsTauri] = useState(false);
  const [, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.__TAURI__) {
      setIsTauri(true);
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        appWindow.isMaximized().then(setIsMaximized);
        appWindow.onResized(() => {
          appWindow.isMaximized().then(setIsMaximized);
        });
      });
    }
  }, []);

  if (!isTauri) return null;

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().toggleMaximize();
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    getCurrentWindow().close();
  };

  return (
    <div 
      data-tauri-drag-region 
      style={{
        height: '38px',
        background: 'var(--bg-main)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        userSelect: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={handleClose}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClose(); }}
          style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={handleMinimize}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleMinimize(); }}
          style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={handleMaximize}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleMaximize(); }}
          style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      </div>
      <div data-tauri-drag-region style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
        {BRAND_NAME}
      </div>
    </div>
  );
}
