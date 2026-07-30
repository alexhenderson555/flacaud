import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import AudioVisualizer from '../AudioVisualizer';
import Titlebar from '../Titlebar';
import ToastContainer from '../ToastContainer';
import AppSidebar from './AppSidebar';
import PlayerChrome from './PlayerChrome';
import AuthRequiredBanner from '../AuthRequiredBanner';
import LegalFooter from './LegalFooter';
import { usePlayer } from '../../store/usePlayerStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePlayerCinemaMode } from '../../hooks/usePlayerCinemaMode';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';

export default function AppShell({ shellPaddingTop = '0' }) {
  const location = useLocation();
  const pageContainerRef = useRef(null);
  useScrollRestoration(pageContainerRef);
  const {
  playerContext,
  mediaEnabled,
    sessionReady,
  visualizerEnabled,
  audioRef,
  getMainAudioEl,
  overlays,
  t,
  lang,
  } = usePlayer();

  const isMobile = useMediaQuery('(max-width: 768px)');
  const cinema = usePlayerCinemaMode();
  // Cinema mode is visualizer-first, so force it on (within desktop) regardless
  // of the user's visualizer preference.
  const showVisualizer = mediaEnabled && (visualizerEnabled || cinema) && !isMobile;

  const [authBannerDismissed, setAuthBannerDismissed] = useState(
    () => sessionStorage.getItem('tidal-auth-banner-dismissed') === '1',
  );

  useEffect(() => {
    const onLogin = () => {
      sessionStorage.removeItem('tidal-auth-banner-dismissed');
      setAuthBannerDismissed(false);
    };
    window.addEventListener('tidal-auth-login', onLogin);
    return () => window.removeEventListener('tidal-auth-login', onLogin);
  }, []);

  const showAuthBanner = sessionReady
    && !mediaEnabled
    && location.pathname !== '/account'
    && !authBannerDismissed;

  const dismissAuthBanner = () => {
    sessionStorage.setItem('tidal-auth-banner-dismissed', '1');
    setAuthBannerDismissed(true);
  };

  return (
    <div
      className="app-container app-container--shell"
      style={{ paddingTop: shellPaddingTop }}
    >
      <Titlebar />
      {showVisualizer ? (
        <AudioVisualizer audioRef={audioRef} getMainAudioEl={getMainAudioEl} />
      ) : (
        <>
          <div className="ambient-glow glow-1" />
          <div className="ambient-glow glow-2" />
          <div className="ambient-glow glow-3" />
        </>
      )}

      <AppSidebar
        t={t}
        isMobileMenuOpen={overlays.isMobileMenuOpen}
        setIsMobileMenuOpen={overlays.setIsMobileMenuOpen}
      />

      <main className="main-content">
        <div className="page-container" ref={pageContainerRef}>
          {showAuthBanner && (
            <AuthRequiredBanner lang={lang} onDismiss={dismissAuthBanner} />
          )}
          <div key={location.pathname} className="page-transition page-transition--active">
              <Outlet context={playerContext} />
          </div>
        </div>
        <LegalFooter lang={lang} />
      </main>

      {sessionReady && (
        <PlayerChrome playbackEnabled={mediaEnabled} />
      )}

      <ToastContainer />
    </div>
  );
}

