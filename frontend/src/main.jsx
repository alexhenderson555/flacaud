import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import { initClientObservability } from './clientObservability.js'
import './index.css'
import './styles/mobile-shell.css'

initClientObservability()

const Search = React.lazy(() => import('./pages/Search.jsx'));
const Account = React.lazy(() => import('./pages/Account.jsx'));
const Sync = React.lazy(() => import('./pages/Sync.jsx'));
const Library = React.lazy(() => import('./pages/Library.jsx'));
const Genreverse = React.lazy(() => import('./pages/Genreverse.jsx'));
const SetAnalyzer = React.lazy(() => import('./pages/SetAnalyzer.jsx'));
const StemSplitter = React.lazy(() => import('./pages/StemSplitter.jsx'));
const ArtistProfile = React.lazy(() => import('./pages/ArtistProfile.jsx'));
const AlbumView = React.lazy(() => import('./pages/AlbumView.jsx'));
const Recommendations = React.lazy(() => import('./pages/Recommendations.jsx'));
const Playlists = React.lazy(() => import('./pages/Playlists.jsx'));
const Landing = React.lazy(() => import('./pages/Landing.jsx'));
const SetLibrary = React.lazy(() => import('./pages/SetLibrary.jsx'));
const ShareImport = React.lazy(() => import('./pages/ShareImport.jsx'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword.jsx'));
const VerifyEmail = React.lazy(() => import('./pages/VerifyEmail.jsx'));
const LegalPage = React.lazy(() => import('./pages/LegalPage.jsx'));

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
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)' }}>
    Loading...
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(
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
    </BrowserRouter>,
)
