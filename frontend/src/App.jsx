import { Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { LibraryDataProvider } from './context/LibraryDataContext';
import { usePlayer } from './store/usePlayerStore';
import PlayerLogic from './components/player/PlayerLogic';
import AppShell from './components/layout/AppShell';
import { isGuestRoute } from './utils/guestRoutes';
import { hasAuthSession } from './utils/hasAuthSession';

function AppRoutes() {
  const location = useLocation();
  const { sessionReady, lang, libraryRevision, authTick } = usePlayer();
  const shellPaddingTop = window.__TAURI__ ? '38px' : '0';

  if (!sessionReady) {
    return (
      <div
        className="app-container app-container--loading"
        style={{ paddingTop: shellPaddingTop }}
      >
        <div className="app-loading-message">
          {lang === 'ru' ? 'Загрузка…' : 'Loading…'}
        </div>
      </div>
    );
  }

  const hasToken = hasAuthSession();
  void authTick;

  if (!hasToken && !isGuestRoute(location.pathname)) {
    return <Navigate to="/account" replace />;
  }
  return (
    <LibraryDataProvider revision={libraryRevision} lang={lang}>
      <AppShell shellPaddingTop={shellPaddingTop} />
    </LibraryDataProvider>
  );
}

export default function App() {
  useEffect(() => {
    const sync = () => {
      const on = Boolean(document.fullscreenElement);
      document.documentElement.classList.toggle('is-browser-fullscreen', on);
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  return (
    <PlayerLogic>
      <AppRoutes />
    </PlayerLogic>
  );
}
