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
  // Called once when scrolling brings the user within `nearEndThreshold` rows
  // of the end of the list -- lets a caller auto-fetch the next page instead
  // of requiring an explicit "Load more" click. Re-arms automatically once
  // `items` grows (a fresh page arrives), so it fires again near the new end.
  onNearEnd,
  nearEndThreshold = 5,
}) {
  const containerRef = useRef(null);
  const [scrollEl, setScrollEl] = useState(null);
  const firedForCountRef = useRef(0);

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

  const virtualItems = virtualizer.getVirtualItems();
  const lastVisibleIndex = virtualItems.length
    ? virtualItems[virtualItems.length - 1].index
    : -1;

  useEffect(() => {
    if (!onNearEnd || !items.length) return;
    // Re-arm once the list has actually grown past whatever count we last
    // fired for -- otherwise a caller whose fetch comes back with no new
    // items (real end of data) would get re-triggered on every scroll tick.
    if (items.length <= firedForCountRef.current) return;
    if (lastVisibleIndex < 0) return;
    if (lastVisibleIndex >= items.length - 1 - nearEndThreshold) {
      firedForCountRef.current = items.length;
      onNearEnd();
    }
  }, [lastVisibleIndex, items.length, onNearEnd, nearEndThreshold]);

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
