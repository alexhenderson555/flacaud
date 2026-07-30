import { useEffect, useRef } from 'react';

export default function LandingVideoBg({ cinema = false, heroRef = null }) {
  const videoRef = useRef(null);

  // The video sits `fixed` behind the whole scrollable page, not just the hero
  // -- left playing, it keeps decoding/compositing full-viewport frames the
  // entire time someone reads pricing/FAQ far below. Pause it once the hero
  // scrolls out of view and resume if they scroll back up. Cinema mode is a
  // deliberate full-screen visual, so it always plays there regardless.
  useEffect(() => {
    if (cinema || !heroRef?.current) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play?.().catch(() => {});
        else el.pause?.();
      },
      { threshold: 0 },
    );
    observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, [cinema, heroRef]);

  return (
    <div
      className={`landing__canvas-wrap${cinema ? ' landing__canvas-wrap--cinema' : ''}`}
      aria-hidden="true"
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, overflow: 'hidden', pointerEvents: 'none', backgroundColor: '#000',
      }}
    >
      <video
        ref={videoRef}
        src="/videos/1.mp4"
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100vw',
          height: '100vh',
          objectFit: 'cover',
          transform: 'translate(-50%, -50%)',
          opacity: cinema ? 1 : 0.6,
          filter: cinema ? 'none' : 'saturate(1.2)',
        }}
      />

      {!cinema && (
        <>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: 'linear-gradient(to bottom, rgba(5,5,8,0.7) 0%, rgba(5,5,8,0.9) 100%)',
          }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: 'radial-gradient(circle at top, rgba(106, 17, 203, 0.2) 0%, transparent 60%)',
            mixBlendMode: 'screen',
          }} />
        </>
      )}
    </div>
  );
}
