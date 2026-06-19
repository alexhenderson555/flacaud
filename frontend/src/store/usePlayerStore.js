import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getDefaultPlaybackQuality, isAutoPlaybackQuality } from '../utils/qualityPrefs';

export const usePlayerStore = create(
  persist(
    (set) => ({
      currentTrack: null,
      setCurrentTrack: (currentTrack) => set({ currentTrack }),

      playlist: [],
      setPlaylist: (playlist) => set({ playlist }),

      currentTrackIndex: -1,
      setCurrentTrackIndex: (currentTrackIndex) => set({ currentTrackIndex }),

      isPlaying: false,
      setIsPlaying: (isPlaying) => set({ isPlaying }),

      progress: 0,
      setProgress: (progress) => set({ progress }),

      isLoading: false,
      setIsLoading: (isLoading) => set({ isLoading }),

      defaultPlaybackQuality: getDefaultPlaybackQuality(),
      setDefaultPlaybackQualityState: (defaultPlaybackQuality) => set({ defaultPlaybackQuality }),

      autoPlaybackQuality: isAutoPlaybackQuality(),
      setAutoPlaybackQualityState: (autoPlaybackQuality) => set({ autoPlaybackQuality }),

      theme: 'default',
      setTheme: (theme) => set({ theme }),

      visualizerEnabled: false,
      setVisualizerEnabled: (visualizerEnabled) => set({ visualizerEnabled }),

      lang: 'en',
      setLang: (lang) => set({ lang }),

      volume: 1.0,
      setVolume: (updater) => set((state) => {
        const newVolume = typeof updater === 'function' ? updater(state.volume) : updater;
        return { volume: newVolume };
      }),
    }),
    {
      name: 'tidal-player-store',
      partialize: (state) => ({
        theme: state.theme,
        visualizerEnabled: state.visualizerEnabled,
        lang: state.lang,
        volume: state.volume,
        defaultPlaybackQuality: state.defaultPlaybackQuality,
        autoPlaybackQuality: state.autoPlaybackQuality,
      }),
    }
  )
);

export const usePlayer = usePlayerStore;
export const usePlayerPlayback = usePlayerStore;
