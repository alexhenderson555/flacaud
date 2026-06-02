import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import Search from './pages/Search.jsx'
import Account from './pages/Account.jsx'
import Sync from './pages/Sync.jsx'
import Library from './pages/Library.jsx'
import Radio from './pages/Radio.jsx'
import SetAnalyzer from './pages/SetAnalyzer.jsx'
import StemSplitter from './pages/StemSplitter.jsx'
import './index.css'

import ArtistProfile from './pages/ArtistProfile.jsx'
import AlbumView from './pages/AlbumView.jsx'
import Recommendations from './pages/Recommendations.jsx'
import Playlists from './pages/Playlists.jsx'

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

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/account" replace />} />
          <Route path="search" element={<Search />} />
          <Route path="sync" element={<Sync />} />
          <Route path="library" element={<Library />} />
          <Route path="radio" element={<Radio />} />
          <Route path="account" element={<Account />} />
          <Route path="recommendations" element={<Recommendations />} />
          <Route path="playlists" element={<Playlists />} />
          <Route path="analyzer" element={<SetAnalyzer />} />
          <Route path="splitter" element={<StemSplitter />} />
          <Route path="artist/:id" element={<ArtistProfile />} />
          <Route path="album/:id" element={<AlbumView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
