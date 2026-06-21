import { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { initClientObservability } from './clientObservability.js'
import { lazyRoute } from './utils/lazyRoute.js'
import './index.css'
import './styles/mobile-shell.css'

initClientObservability()

const Search = lazyRoute(() => import('./pages/Search.jsx'));
const Account = lazyRoute(() => import('./pages/Account.jsx'));
const Sync = lazyRoute(() => import('./pages/Sync.jsx'));
const Library = lazyRoute(() => import('./pages/Library.jsx'));
const Genreverse = lazyRoute(() => import('./pages/Genreverse.jsx'));
const SetAnalyzer = lazyRoute(() => import('./pages/SetAnalyzer.jsx'));
const StemSplitter = lazyRoute(() => import('./pages/StemSplitter.jsx'));
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

const LoadingFallback = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      color: 'var(--text-muted)',
      background: 'var(--bg-main)',
    }}
  >
    Loading...
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
            <Route path="splitter" element={<StemSplitter />} />
            <Route path="share" element={<ShareImport />} />
            <Route path="artist/:id" element={<ArtistProfile />} />
            <Route path="album/:id" element={<AlbumView />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </ErrorBoundary>,
)
