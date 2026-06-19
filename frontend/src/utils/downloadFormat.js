/** File extension for a downloaded / cached track tier (Tidal 320k = AAC in .m4a, not MP3). */
export function extensionForQuality(quality, blobType = '') {
  const type = String(blobType || '').toLowerCase();
  if (type.includes('flac')) return 'flac';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';

  const q = String(quality || '').toUpperCase();
  if (q === 'LOSSLESS' || q === 'HI_RES' || q === 'HI_RES_LOSSLESS') return 'flac';
  return 'm4a';
}

/** Prefer server filename / MIME — never guess FLAC from job quality alone. */
export function extensionFromResponse(contentDisposition, contentType, fallback = 'm4a') {
  if (contentDisposition?.includes('filename=')) {
    const raw = contentDisposition.split('filename=')[1].replace(/['"]/g, '').trim();
    const base = raw.split(';')[0];
    if (base.includes('.')) {
      return base.split('.').pop().toLowerCase();
    }
  }
  const type = String(contentType || '').toLowerCase();
  if (type.includes('flac')) return 'flac';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  return fallback;
}
