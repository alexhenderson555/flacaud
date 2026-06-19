
const hints = {
  en: 'Space play · ←/→ track · Shift+←/→ seek · [ ] ±5s · M mute · E EQ · Q queue · L lyrics · / Ctrl+K · Esc',
  ru: 'Space play · ←/→ трек · Shift+←/→ seek · [ ] ±5с · M mute · E EQ · Q очередь · L текст · / Ctrl+K · Esc',
};

export default function HotkeyHint({ lang = 'en', hidden = false }) {
  if (hidden) return null;
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
