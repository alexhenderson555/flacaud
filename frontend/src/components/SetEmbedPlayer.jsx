import {
  forwardRef, useEffect, useImperativeHandle, useRef, useId,
} from 'react';
import {
  classifySetUrl,
  parseYoutubeVideoId,
  SOUND_CLOUD_EMBED_HEIGHT,
  soundCloudWidgetSrc,
} from '../utils/setEmbedUrl';
import { loadSoundCloudWidgetApi, loadYoutubeIframeApi } from '../utils/setEmbedScripts';

/**
 * Native YouTube iframe + SoundCloud widget embeds (react-player v3 dropped SC).
 * Ref API: { seekTo(seconds), play(), pause() }
 */
const SetEmbedPlayer = forwardRef(function SetEmbedPlayer({
  src,
  url,
  playing = false,
  onReady,
  onPlay,
  onPause,
  width = '100%',
  height,
}, ref) {
  const mediaSrc = src || url;
  const kind = classifySetUrl(mediaSrc);
  const ytMountId = useId().replace(/:/g, '');
  const scIframeRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const scWidgetRef = useRef(null);
  const readyRef = useRef(false);

  // Keep the latest callbacks in refs so the (re)mount effect below does NOT depend
  // on their identity. Otherwise a parent re-render with fresh inline callbacks
  // (e.g. the analyzer polling once a second) would tear down and recreate the
  // YouTube player, flashing the embed black mid-analysis.
  const onReadyRef = useRef(onReady);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  onReadyRef.current = onReady;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      const s = Number(seconds);
      if (!Number.isFinite(s) || s < 0) return false;
      if (kind === 'youtube' && ytPlayerRef.current?.seekTo) {
        ytPlayerRef.current.seekTo(s, true);
        ytPlayerRef.current.playVideo?.();
        return true;
      }
      if (kind === 'soundcloud' && scWidgetRef.current) {
        scWidgetRef.current.seekTo(Math.round(s * 1000));
        scWidgetRef.current.play();
        return true;
      }
      return false;
    },
    play() {
      if (kind === 'youtube') ytPlayerRef.current?.playVideo?.();
      else if (kind === 'soundcloud') scWidgetRef.current?.play();
    },
    pause() {
      if (kind === 'youtube') ytPlayerRef.current?.pauseVideo?.();
      else if (kind === 'soundcloud') scWidgetRef.current?.pause();
    },
    get currentTime() {
      return undefined;
    },
  }), [kind]);

  useEffect(() => {
    readyRef.current = false;
    ytPlayerRef.current = null;
    scWidgetRef.current = null;

    if (!mediaSrc || !kind) return undefined;

    let cancelled = false;

    const markReady = () => {
      if (cancelled || readyRef.current) return;
      readyRef.current = true;
      onReadyRef.current?.();
    };

    if (kind === 'youtube') {
      const videoId = parseYoutubeVideoId(mediaSrc);
      if (!videoId) return undefined;

      loadYoutubeIframeApi().then(() => {
        if (cancelled || !window.YT?.Player) return;
        ytPlayerRef.current = new window.YT.Player(ytMountId, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => markReady(),
            onStateChange: (ev) => {
              if (ev.data === window.YT.PlayerState.PLAYING) onPlayRef.current?.();
              if (ev.data === window.YT.PlayerState.PAUSED) onPauseRef.current?.();
            },
          },
        });
      }).catch(() => {});

      return () => {
        cancelled = true;
        try {
          ytPlayerRef.current?.destroy?.();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
      };
    }

    if (kind === 'soundcloud') {
      loadSoundCloudWidgetApi().then(() => {
        if (cancelled || !scIframeRef.current || !window.SC?.Widget) return;
        const widget = window.SC.Widget(scIframeRef.current);
        scWidgetRef.current = widget;
        widget.bind(window.SC.Widget.Events.READY, () => markReady());
        widget.bind(window.SC.Widget.Events.PLAY, () => onPlayRef.current?.());
        widget.bind(window.SC.Widget.Events.PAUSE, () => onPauseRef.current?.());
      }).catch(() => {});

      return () => {
        cancelled = true;
        scWidgetRef.current = null;
      };
    }

    return undefined;
    // Intentionally excludes onReady/onPlay/onPause — they're read via refs so the
    // player is only rebuilt when the actual media source changes.
  }, [mediaSrc, kind, ytMountId]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (playing) {
      if (kind === 'youtube') ytPlayerRef.current?.playVideo?.();
      else if (kind === 'soundcloud') scWidgetRef.current?.play();
    } else {
      if (kind === 'youtube') ytPlayerRef.current?.pauseVideo?.();
      else if (kind === 'soundcloud') scWidgetRef.current?.pause();
    }
  }, [playing, kind]);

  if (!mediaSrc || !kind) {
    return null;
  }

  if (kind === 'soundcloud') {
    const h = height ?? SOUND_CLOUD_EMBED_HEIGHT;
    return (
      <iframe
        ref={scIframeRef}
        data-testid="set-embed-player"
        data-embed-type="soundcloud"
        title="SoundCloud player"
        width={width}
        height={h}
        scrolling="no"
        frameBorder="no"
        allow="autoplay"
        src={soundCloudWidgetSrc(mediaSrc)}
        style={{ border: 0, display: 'block', maxWidth: '100%' }}
      />
    );
  }

  return (
    <div
      data-testid="set-embed-player"
      data-embed-type="youtube"
      style={{
        width,
        height: height ?? '100%',
        minHeight: height ? undefined : 200,
      }}
    >
      <div id={ytMountId} style={{ width: '100%', height: '100%' }} />
    </div>
  );
});

export default SetEmbedPlayer;
