import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Site-styled dropdown (replaces native <select> which uses OS light-blue menus).
 */
export default function GlassDropdown({
  value,
  onChange,
  options,
  testId,
  align = 'right',
  minWidth = 200,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div
      ref={rootRef}
      className="glass-dropdown"
      data-testid={testId}
      style={{ minWidth }}
    >
      <button
        type="button"
        className="glass-dropdown-trigger glass-panel"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="glass-dropdown-label">{selected?.label}</span>
        <ChevronDown
          size={18}
          className="glass-dropdown-chevron"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            className="glass-dropdown-menu glass-panel"
            style={{ [align === 'right' ? 'right' : 'left']: 0 }}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={`glass-dropdown-option${isSelected ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {isSelected ? <Check size={16} strokeWidth={2.5} /> : null}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
