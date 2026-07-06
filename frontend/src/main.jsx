import './storagePolyfill.js'
import { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { initClientObservability } from './clientObservability.js'
import { initFeatureFlags } from './utils/featureFlags.js'
import { lazyRoute } from './utils/lazyRoute.js'
import './styles/fonts.css'
import './index.css'
import './styles/player-bar.css'
import './styles/mobile-shell.css'
import './styles/karaoke.css'

initClientObservability()
initFeatureFlags()

const Search = lazyRoute(() => import('./pages/Search.jsx'));
const Account = lazyRoute(() => import('./pages/Account.jsx'));
const Sync = lazyRoute(() => import('./pages/Sync.jsx'));
const Library = lazyRoute(() => import('./pages/Library.jsx'));
const Genreverse = lazyRoute(() => import('./pages/Genreverse.jsx'));
const SetAnalyzer = lazyRoute(() => import('./pages/SetAnalyzer.jsx'));
const TransitionFinder = lazyRoute(() => import('./pages/TransitionFinder.jsx'));
const ArtistProfile = lazyRoute(() => import('./pages/ArtistProfile.jsx'));
const AlbumView = lazyRoute(() => import('./pages/AlbumView.jsx'));
const Recommendations = lazyRoute(() => import('./pages/Recommendations.jsx'));
const Playlists = lazyRoute(() => import('./pages/Playlists.jsx'));
const Landing = lazyRoute(() => import('./pages/Landing.jsx'));
const SetLibrary = lazyRoute(() => import('./pages/SetLibrary.jsx'));
const ShareImport = lazyRoute(() => import('./pages/ShareImport.jsx'));
const ForgotPassword = lazyRoute(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazyRoute(() => import('./pages/ResetPassword.jsx'));
const VerifyEmail = lazyRoute(() => import('./pages/VerifyEmail.jsx'));
const LegalPage = lazyRoute(() => import('./pages/LegalPage.jsx'));

// Tauri fetch interceptor
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  if (typeof resource === 'string' && resource.startsWith('/api') && window.__TAURI__) {
    resource = 'http://localhost:8000' + resource;
  }
  return originalFetch(resource, config);
};

import { registerSW } from 'virtual:pwa-register';
import { migrateLegacyToken } from './utils/tokenStorage';
import { hasAuthSession } from './utils/hasAuthSession';

migrateLegacyToken();

/** Register PWA only after login — avoids SW competing with auth on first visit. */
function registerPwaAfterAuth() {
  if (!('serviceWorker' in navigator) || window.__tidalPwaRegistered) return;
  window.__tidalPwaRegistered = true;
  registerSW({
    immediate: true,
    onNeedRefresh() {
      window.location.reload();
    },
  });
}

window.addEventListener('tidal-auth-login', registerPwaAfterAuth);
if (hasAuthSession()) {
  registerPwaAfterAuth();
}

// Match App.jsx's auth-boot loading screen exactly so the code-split (Suspense)
// phase and the auth-boot phase read as ONE continuous screen — not two
// ("looks loaded… then loading again"). lang lives in the persisted store.
const bootLang = (() => {
  try {
    const persisted = JSON.parse(localStorage.getItem('tidal-player-store') || '{}');
    return persisted?.state?.lang === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
})();

const LoadingFallback = () => (
  <div
    className="app-container app-container--loading"
    style={{ paddingTop: window.__TAURI__ ? '38px' : '0' }}
  >
    <div className="app-loading-message">
      {bootLang === 'ru' ? 'Загрузка…' : 'Loading…'}
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/landing" element={<Navigate to="/" replace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/s/:token" element={<ShareImport />} />

          <Route element={<App />}>
            <Route path="search" element={<Search />} />
            <Route path="sync" element={<Sync />} />
            <Route path="library" element={<Library />} />
            <Route path="radio" element={<Navigate to="/genreverse" replace />} />
            <Route path="genreverse" element={<Genreverse />} />
            <Route path="account" element={<Account />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="playlists" element={<Playlists />} />
            <Route path="analyzer" element={<SetAnalyzer />} />
            <Route path="set-library" element={<SetLibrary />} />
            <Route path="sets" element={<SetLibrary />} />
            <Route path="splitter" element={<Navigate to="/transitions" replace />} />
            <Route path="transitions" element={<TransitionFinder />} />
            <Route path="share" element={<ShareImport />} />
            <Route path="artist/:id" element={<ArtistProfile />} />
            <Route path="album/:id" element={<AlbumView />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </ErrorBoundary>,
)
