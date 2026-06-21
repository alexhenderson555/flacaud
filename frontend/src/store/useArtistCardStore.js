import { create } from 'zustand';

export const useArtistCardStore = create((set) => ({
  artistId: null,
  artistName: '',
  openArtistCard: (artistId, artistName = '') => {
    if (!artistId) return;
    set({ artistId: String(artistId), artistName: String(artistName || '') });
  },
  closeArtistCard: () => set({ artistId: null, artistName: '' }),
}));
