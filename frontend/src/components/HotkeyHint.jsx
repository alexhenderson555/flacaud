import { hotkeyHintLines } from '../utils/playerHotkeys';

export default function HotkeyHint({ lang = 'en', hidden = false }) {
  if (hidden) return null;

  const lines = hotkeyHintLines(lang);

  return (
    <div
      className="hide-on-mobile hotkey-hint"
      data-testid="hotkey-hint"
      aria-hidden
    >
      {lines.map((line) => (
        <div key={line} className="hotkey-hint__row">
          {line}
        </div>
      ))}
    </div>
  );
}
