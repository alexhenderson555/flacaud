import { Disc, X } from 'lucide-react';
import CamelotWheel from './CamelotWheel';
import BpmRangeSlider from './BpmRangeSlider';

/**
 * Compact DJ filters — horizontal layout, smaller Camelot wheel.
 */
export default function DjFiltersPanel({
  filterKey,
  onSelectKey,
  filterBpmRange,
  onBpmRangeChange,
  pendingCount = 0,
  analyzingLabel,
  clearKeyLabel,
  panelTitle,
  camelotTitle,
  bpmTitle,
  onClose,
}) {
  return (
    <div className="dj-filters-panel glass-panel" data-testid="library-dj-filters">
      <div className="dj-filters-panel__header">
        <div className="dj-filters-panel__title">
          <Disc size={18} />
          <span>{panelTitle}</span>
        </div>
        {onClose && (
          <button type="button" className="dj-filters-panel__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        )}
      </div>
      <div className="dj-filters-panel__body">
        <div className="dj-filters-panel__camelot">
          {camelotTitle && <h3 className="dj-filters-panel__bpm-title">{camelotTitle}</h3>}
          <div className="dj-filters-panel__wheel-wrap">
            <CamelotWheel selectedKey={filterKey} onSelectKey={onSelectKey} compact />
          </div>
          {filterKey && (
            <button type="button" className="btn-secondary dj-filters-panel__clear-key" onClick={() => onSelectKey(null)}>
              {clearKeyLabel}
            </button>
          )}
        </div>
        <div className="dj-filters-panel__bpm">
          <h3 className="dj-filters-panel__bpm-title">{bpmTitle}</h3>
          <BpmRangeSlider
            min={filterBpmRange.min}
            max={filterBpmRange.max}
            onChange={onBpmRangeChange}
            variant="modern"
          />
          {pendingCount > 0 && analyzingLabel && (
            <p className="dj-filters-panel__pending">{analyzingLabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}
