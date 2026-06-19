import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X, Play, Music, Trash2, GripVertical } from 'lucide-react';
import { coverImgSrc } from '../utils/coverUrl';
import { tracksMatch } from '../utils/trackNormalize';
import ArtistLine from './ArtistLine';

function queueSignature(tracks) {
  return (tracks || []).map((t) => String(t.provider_id)).join('|');
}

function resolveQueueIndex(playlist, currentTrack, currentTrackIndex) {
  if (!playlist?.length) return -1;
  if (
    currentTrackIndex >= 0
    && currentTrackIndex < playlist.length
    && tracksMatch(playlist[currentTrackIndex], currentTrack)
  ) {
    return currentTrackIndex;
  }
  if (currentTrack) {
    const found = playlist.findIndex((tr) => tracksMatch(tr, currentTrack));
    if (found >= 0) return found;
  }
  return currentTrackIndex >= 0 && currentTrackIndex < playlist.length ? currentTrackIndex : 0;
}

export default function PlaybackQueue({
  playlist,
  currentTrack,
  currentTrackIndex,
  setPlaylist,
  togglePlay,
  onClose,
  dockedWithKaraoke = false,
}) {
  const safeIndex = resolveQueueIndex(playlist, currentTrack, currentTrackIndex);
  const nowPlaying = safeIndex >= 0 ? playlist[safeIndex] : null;
  const upNext = useMemo(
    () => (safeIndex >= 0 ? (playlist || []).slice(safeIndex + 1) : playlist || []),
    [playlist, safeIndex],
  );

  const [localUpNext, setLocalUpNext] = React.useState(upNext);
  const localUpNextRef = useRef(upNext);
  const isDraggingRef = useRef(false);
  const parentSigRef = useRef(queueSignature(upNext));

  useEffect(() => {
    localUpNextRef.current = localUpNext;
  }, [localUpNext]);

  useEffect(() => {
    const sig = queueSignature(upNext);
    if (isDraggingRef.current) return;
    if (sig !== parentSigRef.current) {
      parentSigRef.current = sig;
      setLocalUpNext(upNext);
      localUpNextRef.current = upNext;
    }
  }, [upNext]);

  const upNextIds = useMemo(
    () => localUpNext.map((t) => String(t.provider_id)),
    [localUpNext],
  );

  const commitQueue = useCallback(
    (ordered) => {
      if (!playlist?.length || safeIndex < 0 || !ordered?.length) return;
      const head = playlist.slice(0, safeIndex + 1);
      const nextPlaylist = [...head, ...ordered];
      parentSigRef.current = queueSignature(ordered);
      setPlaylist(nextPlaylist);
    },
    [playlist, safeIndex, setPlaylist],
  );

  const handleIdsReorder = useCallback((newIds) => {
    isDraggingRef.current = true;
    const byId = new Map(localUpNextRef.current.map((t) => [String(t.provider_id), t]));
    const ordered = newIds.map((id) => byId.get(id)).filter(Boolean);
    if (ordered.length !== newIds.length) return;
    setLocalUpNext(ordered);
    localUpNextRef.current = ordered;
  }, []);

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    commitQueue(localUpNextRef.current);
  }, [commitQueue]);

  const removeAt = useCallback(
    (index) => {
      const next = [...localUpNextRef.current];
      next.splice(index, 1);
      setLocalUpNext(next);
      localUpNextRef.current = next;
      commitQueue(next);
    },
    [commitQueue],
  );

  const scrollContainerRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: playlist?.length ? localUpNext.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  if (!playlist?.length) return null;

  return (
    <motion.div
      className={`glass-panel playback-queue-panel${dockedWithKaraoke ? ' playback-queue-panel--karaoke-dock' : ''}`}
      data-testid="playback-queue-panel"
      initial={{ y: dockedWithKaraoke ? 0 : '100%', x: dockedWithKaraoke ? '100%' : 0, opacity: 0 }}
      animate={{ y: 0, x: 0, opacity: 1 }}
      exit={{ y: dockedWithKaraoke ? 0 : '100%', x: dockedWithKaraoke ? '100%' : 0, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Music size={20} color="var(--accent-solid)" />
          Queue
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {nowPlaying && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
              Now Playing
            </div>
            <QueueRow track={nowPlaying} isActive onPlay={() => togglePlay(nowPlaying, playlist)} />
          </div>
        )}

        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
          Up Next
        </div>

        {localUpNext.length > 0 ? (
          <Reorder.Group
            axis="y"
            values={upNextIds}
            onReorder={handleIdsReorder}
            layoutScroll
            style={{ listStyle: 'none', margin: 0, padding: 0, height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const track = localUpNext[virtualItem.index];
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <QueueReorderRow
                    trackId={String(track.provider_id)}
                    track={track}
                    onPlay={() => {
                      const full = safeIndex >= 0
                        ? [...playlist.slice(0, safeIndex + 1), ...localUpNextRef.current]
                        : playlist;
                      togglePlay(track, full);
                    }}
                    onRemove={() => removeAt(virtualItem.index)}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              );
            })}
          </Reorder.Group>
        ) : (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No more tracks in queue
          </div>
        )}
      </div>
    </motion.div>
  );
}

function QueueReorderRow({ trackId, track, onPlay, onRemove, onDragEnd }) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={trackId}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
      style={{ marginBottom: '8px', listStyle: 'none', touchAction: 'none' }}
    >
      <QueueRow
        track={track}
        onPlay={onPlay}
        onRemove={onRemove}
        onDragStart={(e) => dragControls.start(e)}
      />
    </Reorder.Item>
  );
}

function QueueRow({ track, isActive, onPlay, onRemove, onDragStart }) {
  return (
    <div
      role={onPlay ? 'button' : undefined}
      tabIndex={onPlay ? 0 : undefined}
      onClick={onPlay}
      onKeyDown={(e) => {
        if (!onPlay) return;
        if (e.key === 'Enter' || e.key === ' ') onPlay();
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px',
        borderRadius: '12px',
        background: isActive ? 'rgba(37, 117, 252, 0.12)' : 'var(--bg-surface)',
        border: isActive ? '1px solid var(--accent-solid)' : '1px solid transparent',
        cursor: onPlay ? 'pointer' : undefined,
      }}
    >
      {onDragStart && (
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={(e) => {
            e.preventDefault();
            onDragStart(e);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'grab',
            padding: '4px 8px 4px 0',
            display: 'flex',
            alignItems: 'center',
            touchAction: 'none',
          }}
        >
          <GripVertical size={18} />
        </button>
      )}
      <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', marginRight: '12px', position: 'relative', flexShrink: 0 }}>
        <img src={coverImgSrc(track.cover_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              onPlay?.();
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0,
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = 0; }}
        >
          <Play size={16} fill="white" />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: isActive ? 'var(--accent-solid)' : 'white', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {track.title}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <ArtistLine track={track} />
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          onClickCapture={(e) => e.stopPropagation()}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
