import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';

const SCROLL_EDGE_PX = 72;
const SCROLL_STEP_PX = 14;

function tracksSignature(tracks) {
  return (tracks || []).map((t) => String(t.provider_id)).join('|');
}

export default function PlaylistTrackList({
  tracks,
  onReorderCommit,
  onTracksChange,
  renderItem,
}) {
  const [localTracks, setLocalTracks] = useState(tracks || []);
  const localTracksRef = useRef(localTracks);
  const isDraggingRef = useRef(false);
  const parentSigRef = useRef(tracksSignature(tracks));
  const listRootRef = useRef(null);
  const scrollParentRef = useRef(null);
  const onTracksChangeRef = useRef(onTracksChange);
  const [isDragging, setIsDragging] = useState(false);
  const lastPointerYRef = useRef(0);

  onTracksChangeRef.current = onTracksChange;

  useEffect(() => {
    localTracksRef.current = localTracks;
    onTracksChangeRef.current?.(localTracks);
  }, [localTracks]);

  useEffect(() => {
    const root = listRootRef.current;
    if (!root) return undefined;
    scrollParentRef.current = root.closest('.page-container') || root.parentElement;
    return undefined;
  }, [localTracks.length]);

  useEffect(() => {
    const sig = tracksSignature(tracks);
    if (isDraggingRef.current) return;
    if (sig !== parentSigRef.current) {
      parentSigRef.current = sig;
      const next = tracks || [];
      setLocalTracks(next);
      localTracksRef.current = next;
    }
  }, [tracks]);

  useEffect(() => {
    if (!isDragging) return undefined;

    const onPointerMove = (e) => {
      lastPointerYRef.current = e.clientY;
    };

    let raf = 0;
    const loop = () => {
      const el = scrollParentRef.current;
      const y = lastPointerYRef.current;
      if (el && y) {
        const rect = el.getBoundingClientRect();
        if (y < rect.top + SCROLL_EDGE_PX) {
          el.scrollTop -= SCROLL_STEP_PX;
        } else if (y > rect.bottom - SCROLL_EDGE_PX) {
          el.scrollTop += SCROLL_STEP_PX;
        }
      }
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onPointerMove);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(raf);
    };
  }, [isDragging]);

  const trackIds = useMemo(
    () => localTracks.map((t) => String(t.provider_id)),
    [localTracks],
  );

  const handleIdsReorder = useCallback((newIds) => {
    isDraggingRef.current = true;
    const byId = new Map(localTracksRef.current.map((t) => [String(t.provider_id), t]));
    const ordered = newIds.map((id) => byId.get(id)).filter(Boolean);
    if (ordered.length !== newIds.length) return;
    setLocalTracks(ordered);
    localTracksRef.current = ordered;
  }, []);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    parentSigRef.current = tracksSignature(localTracksRef.current);
    onReorderCommit?.(localTracksRef.current);
  }, [onReorderCommit]);

  if (!localTracks.length) return null;

  return (
    <div ref={listRootRef} className="playlist-track-list">
      <Reorder.Group
        as="div"
        axis="y"
        values={trackIds}
        onReorder={handleIdsReorder}
        style={{ listStyle: 'none', margin: 0, padding: 0 }}
      >
        {localTracks.map((track) => (
          <PlaylistReorderRow
            key={String(track.provider_id)}
            trackId={String(track.provider_id)}
            onDragEnd={handleDragEnd}
            renderRow={(dragStart) => renderItem(
              track,
              (e) => {
                handleDragStart();
                dragStart(e);
              },
              localTracks,
            )}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

function PlaylistReorderRow({ trackId, onDragEnd, renderRow }) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      as="div"
      value={trackId}
      layout={false}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      whileDrag={{ zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
      className="playlist-reorder-item"
    >
      {renderRow((e) => dragControls.start(e))}
    </Reorder.Item>
  );
}
