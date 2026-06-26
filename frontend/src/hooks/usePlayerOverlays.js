import { useState, useCallback, useRef } from 'react';
import { PARTY_MODE_ENABLED } from './usePartyModeAvailable';

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

export function usePlayerOverlays() {
  const [isEQOpen, setIsEQOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isDJOpen, setIsDJOpen] = useState(false);
  const [isKaraokeOpen, setIsKaraokeOpen] = useState(false);
  const [isPartyOpen, setIsPartyOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPlaylistModalOpenPlayer, setIsPlaylistModalOpenPlayer] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isKaraokeOpenRef = useRef(false);
  isKaraokeOpenRef.current = isKaraokeOpen;

  const closeKaraoke = useCallback(() => {
    setIsKaraokeOpen(false);
    exitFullscreen();
  }, []);

  const closeParty = useCallback(() => {
    setIsPartyOpen(false);
    exitFullscreen();
  }, []);

  const toggleOverlay = useCallback((overlay) => {
    if (overlay === 'party' && !PARTY_MODE_ENABLED) return;
    if (overlay === 'party') {
      setIsPartyOpen((prev) => {
        const next = !prev;
        if (next) {
          setIsEQOpen(false);
          setIsQueueOpen(false);
          setIsDJOpen(false);
        }
        return next;
      });
      return;
    }
    if (overlay === 'karaoke') {
      const next = !isKaraokeOpenRef.current;
      if (!next) {
        exitFullscreen();
      }
      setIsKaraokeOpen(next);
      return;
    }
    // Stack on karaoke; only one utility panel among eq / queue / dj
    if (overlay === 'eq') {
      setIsEQOpen((prev) => !prev);
      setIsQueueOpen(false);
      setIsDJOpen(false);
      return;
    }
    if (overlay === 'queue') {
      setIsQueueOpen((prev) => !prev);
      setIsEQOpen(false);
      setIsDJOpen(false);
      return;
    }
    if (overlay === 'dj') {
      setIsDJOpen((prev) => !prev);
      setIsEQOpen(false);
      setIsQueueOpen(false);
    }
  }, []);

  const closeAllPanels = useCallback(() => {
    if (isCommandPaletteOpen) {
      setIsCommandPaletteOpen(false);
      return;
    }
    if (isQueueOpen) {
      setIsQueueOpen(false);
      return;
    }
    if (isEQOpen) {
      setIsEQOpen(false);
      return;
    }
    if (isDJOpen) {
      setIsDJOpen(false);
      return;
    }
    if (isPartyOpen) {
      closeParty();
      return;
    }
    if (isKaraokeOpenRef.current) {
      closeKaraoke();
    }
  }, [closeKaraoke, closeParty, isCommandPaletteOpen, isQueueOpen, isEQOpen, isDJOpen, isPartyOpen]);

  return {
    isEQOpen,
    isQueueOpen,
    isDJOpen,
    isKaraokeOpen,
    isPartyOpen,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    isPlaylistModalOpenPlayer,
    setIsPlaylistModalOpenPlayer,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    toggleOverlay,
    closeAllPanels,
    closeKaraoke,
    closeParty,
    setIsPartyOpen,
    setIsQueueOpen,
    setIsEQOpen,
    setIsDJOpen,
    setIsKaraokeOpen,
  };
}
