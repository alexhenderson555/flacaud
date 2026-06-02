import React from 'react';

const hints = {
  en: 'Space play · ←/→ track · ↑/↓ vol · M mute · K karaoke · D DJ · Q queue · L lyrics · F fullscreen · Ctrl+K palette',
  ru: 'Space play · ←/→ трек · ↑/↓ громк · M mute · K караоке · D DJ · Q очередь · L текст · F fullscreen · Ctrl+K команды',
};

export default function HotkeyHint({ lang = 'en' }) {
  return (
    <div
      className="hide-on-mobile"
      data-testid="hotkey-hint"
      style={{
        position: 'fixed',
        bottom: '94px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '0.68rem',
        color: 'var(--text-muted)',
        opacity: 0.45,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        zIndex: 5,
        letterSpacing: '0.02em',
      }}
    >
      {hints[lang] || hints.en}
    </div>
  );
}
