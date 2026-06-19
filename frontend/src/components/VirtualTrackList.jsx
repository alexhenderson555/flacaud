import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const DEFAULT_ROW_HEIGHT = 76;
const OVERSCAN = 8;

/**
 * Lightweight windowed list using @tanstack/react-virtual.
 * Uses the parent scroll container — never creates a nested scrollbar.
 */
export default function VirtualTrackList({
  items,
  renderItem,
  rowHeight = DEFAULT_ROW_HEIGHT,
  className = '',
  style = {},
  scrollParentSelector = '.page-container',
}) {
  const containerRef = useRef(null);
  const [scrollEl, setScrollEl] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const scrollParent = el.closest(scrollParentSelector)
      || document.querySelector(scrollParentSelector)
      || el.parentElement;

    if (scrollParent) {
      setScrollEl(scrollParent);
    }
  }, [scrollParentSelector]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
  });

  return (
    <div
      ref={containerRef}
      className={`virtual-list-wrap ${className}`}
      style={{ position: 'relative', flex: 'none', ...style }}
    >
      <div style={{ height: scrollEl ? virtualizer.getTotalSize() : items.length * rowHeight, position: 'relative', width: '100%' }}>
        {scrollEl ? virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
              paddingBottom: '8px'
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        )) : items.map((item, i) => (
          <div key={i} style={{ height: rowHeight, paddingBottom: '8px' }}>
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    </div>
  );
}
