import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AudioVisualizer from '../AudioVisualizer';
import Titlebar from '../Titlebar';
import ToastContainer from '../ToastContainer';
import AppSidebar from './AppSidebar';
import PlayerChrome from './PlayerChrome';
import AuthRequiredBanner from '../AuthRequiredBanner';
import LegalFooter from './LegalFooter';
import { usePlayer } from '../../store/usePlayerStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export default function AppShell({ shellPaddingTop = '0' }) {
  const location = useLocation();
  const {
  playerContext,
  mediaEnabled,
    sessionReady,
  visualizerEnabled,
  isPlaying,
  audioRef,
  overlays,
  t,
  lang,
  } = usePlayer();

  const isMobile = useMediaQuery('(max-width: 768px)');
  const showVisualizer = mediaEnabled && visualizerEnabled && !isMobile;

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
        <AudioVisualizer audioRef={audioRef} isPlaying={isPlaying} />
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
        <div className="page-container">
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

