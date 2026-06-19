let ytApiPromise;
let scApiPromise;

export function loadYoutubeIframeApi() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onerror = () => reject(new Error('YouTube iframe API failed to load'));
        document.head.appendChild(tag);
      }
    });
  }
  return ytApiPromise;
}

export function loadSoundCloudWidgetApi() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.SC?.Widget) return Promise.resolve();
  if (!scApiPromise) {
    scApiPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="https://w.soundcloud.com/player/api.js"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        return;
      }
      const tag = document.createElement('script');
      tag.src = 'https://w.soundcloud.com/player/api.js';
      tag.onload = () => resolve();
      tag.onerror = () => reject(new Error('SoundCloud widget API failed to load'));
      document.head.appendChild(tag);
    });
  }
  return scApiPromise;
}
