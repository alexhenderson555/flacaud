import { getAccessToken } from './tokenStorage';

export const toggleLibraryTrack = async (track) => {
  let lib = [];
  const saved = localStorage.getItem('tidal-library');
  if (saved) {
    try {
      lib = JSON.parse(saved);
    } catch (e) { console.error(e); }
  }

  const exists = lib.find(t => t.provider_id === track.provider_id);
  const token = getAccessToken();

  if (exists) {
    // Remove
    lib = lib.filter(t => t.provider_id !== track.provider_id);
    localStorage.setItem('tidal-library', JSON.stringify(lib));
    if (token && exists.id) {
      try {
        await fetch(`/api/library/${exists.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) { console.error(e); }
    }
    return false;
  } else {
    // Add
    let dbTrack = { ...track };
    if (token) {
      try {
        const payload = {
          provider: track.provider || 'tidal',
          provider_id: track.provider_id,
          title: track.title,
          artists_json: JSON.stringify(track.artists || []),
          cover_url: track.cover_url,
          duration: track.duration || track.duration_s || 0,
          album: track.album || '',
          quality: track.quality || 'HIGH'
        };
        const res = await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          dbTrack = await res.json();
          dbTrack.artists = JSON.parse(dbTrack.artists_json || '[]');
        }
      } catch (e) { console.error(e); }
    }
    lib.push(dbTrack);
    localStorage.setItem('tidal-library', JSON.stringify(lib));
    return true;
  }
};

export const isTrackInLibrary = (trackId) => {
  const saved = localStorage.getItem('tidal-library');
  if (!saved) return false;
  try {
    const lib = JSON.parse(saved);
    return !!lib.find(t => t.provider_id === trackId);
  } catch {
    return false;
  }
};
