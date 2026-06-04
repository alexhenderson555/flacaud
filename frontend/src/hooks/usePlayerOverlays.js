import { useState, useCallback } from 'react';

export function usePlayerOverlays() {
  const [isEQOpen, setIsEQOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isDJOpen, setIsDJOpen] = useState(false);
  const [isKaraokeOpen, setIsKaraokeOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPlaylistModalOpenPlayer, setIsPlaylistModalOpenPlayer] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleOverlay = useCallback((overlay) => {
    if (overlay === 'karaoke') {
      setIsKaraokeOpen((prev) => {
        const next = !prev;
        if (next && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (!next && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        return next;
      });
      return;
    }
    setIsEQOpen((prev) => (overlay === 'eq' ? !prev : false));
    setIsQueueOpen((prev) => (overlay === 'queue' ? !prev : false));
    setIsLyricsOpen((prev) => (overlay === 'lyrics' ? !prev : false));
    setIsDJOpen((prev) => (overlay === 'dj' ? !prev : false));
  }, []);

  const closeAllPanels = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setIsQueueOpen(false);
    setIsLyricsOpen(false);
    setIsEQOpen(false);
    setIsDJOpen(false);
  }, []);

  return {
    isEQOpen,
    isQueueOpen,
    isLyricsOpen,
    isDJOpen,
    isKaraokeOpen,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    isPlaylistModalOpenPlayer,
    setIsPlaylistModalOpenPlayer,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    toggleOverlay,
    closeAllPanels,
    setIsQueueOpen,
    setIsLyricsOpen,
    setIsEQOpen,
    setIsDJOpen,
    setIsKaraokeOpen,
  };
}
