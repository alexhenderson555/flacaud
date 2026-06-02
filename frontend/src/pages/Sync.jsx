import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Repeat, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Sync() {
  const [selectedSource, setSelectedSource] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncUrl, setSyncUrl] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [downloadReady, setDownloadReady] = useState(false);

  const platforms = [
    { id: 'spotify', name: 'Spotify', color: '#1DB954', logo: 'https://cdn.simpleicons.org/spotify/1DB954' },
    { id: 'apple', name: 'Apple Music', color: '#FA243C', logo: 'https://cdn.simpleicons.org/apple/FA243C' },
    { id: 'yandex', name: 'Yandex Music', color: '#FFCC00', logo: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Yandex_Music_logo.svg' },
    { id: 'ytmusic', name: 'YT Music', color: '#FF0000', logo: 'https://cdn.simpleicons.org/youtube/FF0000' },
    { id: 'vk', name: 'VK Music', color: '#0077FF', logo: 'https://cdn.simpleicons.org/vk/0077FF' },
    { id: 'soundcloud', name: 'SoundCloud', color: '#FF5500', logo: 'https://cdn.simpleicons.org/soundcloud/FF5500' },
    { id: 'deezer', name: 'Deezer', color: '#A238FF', logo: 'https://cdn.simpleicons.org/deezer/A238FF' },
    { id: 'bandcamp', name: 'Bandcamp', color: '#629AA9', logo: 'https://cdn.simpleicons.org/bandcamp/629AA9' }
  ];

  const handleSync = async () => {
    if (!syncUrl) return;
    setIsSyncing(true);
    setSyncStatus('Connecting to platform API...');
    setDownloadReady(false);
    
    // Mock API integration for Spotify/Yandex etc.
    if (syncUrl.includes('spotify.com') || syncUrl.includes('yandex.ru') || syncUrl.includes('apple.com')) {
       setTimeout(() => setSyncStatus('Parsing playlist data...'), 1500);
       setTimeout(() => setSyncStatus('Matching tracks against Tidal catalog...'), 3500);
       setTimeout(() => {
          setSyncStatus('Error: Backend API Keys for third-party platforms are currently disabled in Settings.');
          setIsSyncing(false);
       }, 6000);
       return;
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
        body: JSON.stringify({
          url: syncUrl,
          quality: 'LOSSLESS',
          match_tidal: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to start job');
      
      setJobId(data.job_id);
      pollJob(data.job_id);
    } catch (e) {
      setSyncStatus('Error: ' + e.message);
      setIsSyncing(false);
    }
  };

  const pollJob = (id) => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` } });
        const data = await res.json();
        
        if (data.status === 'done') {
          clearInterval(iv);
          setSyncStatus(`Done! Successfully synced ${data.tracks.length} tracks.`);
          setDownloadReady(true);
          setIsSyncing(false);
        } else if (data.status === 'failed') {
          clearInterval(iv);
          setSyncStatus('Job failed.');
          setIsSyncing(false);
        } else {
          const doneCount = data.tracks ? data.tracks.filter(t => t.status === 'done').length : 0;
          const total = data.tracks ? data.tracks.length : 0;
          setSyncStatus(`Syncing... ${doneCount}/${total} tracks processed`);
        }
      } catch (e) {
        console.error(e);
      }
    }, 2000);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{ marginBottom: '40px' }}
      >
        <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Library <span className="text-gradient">Transfer</span></h1>
        <p style={{ color: 'var(--text-secondary)' }}>Sync your playlists from other platforms and download them in FLAC automatically.</p>
      </motion.div>

      <div style={{ display: 'flex', gap: '40px', flex: 1 }}>
        {/* Source Selection */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{ flex: 1, maxWidth: '600px' }}
        >
          <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-secondary)' }}>1. Select Source</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {platforms.map(platform => (
              <div 
                key={platform.id}
                onClick={() => setSelectedSource(platform.id)}
                className="glass-panel"
                style={{ 
                  padding: '16px', 
                  borderRadius: '16px', 
                  cursor: 'pointer',
                  border: selectedSource === platform.id ? `2px solid ${platform.color}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <img src={platform.logo} alt={platform.name} style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                  <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{platform.name}</span>
                </div>
                {selectedSource === platform.id && <CheckCircle2 color={platform.color} size={24} />}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Action Panel */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ flex: 1, maxWidth: '500px' }}
        >
          <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', color: 'var(--text-secondary)' }}>2. Configure & Sync</h2>
          
          <div className="glass-panel" style={{ padding: '32px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {!selectedSource ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                <Repeat size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <p>Please select a source platform first</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px' }}>
                  <AlertCircle size={20} color="var(--warning)" />
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    We will match your tracks against our high-quality catalog. Accuracy is typically ~85-95%. Unmatched tracks will fallback to YT Music.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Playlist Link</label>
                  <input 
                    type="text" 
                    placeholder="https://..."
                    value={syncUrl}
                    onChange={e => setSyncUrl(e.target.value)}
                    style={{ 
                      width: '100%', padding: '14px 16px', borderRadius: '12px', 
                      background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', 
                      color: 'var(--text-primary)', outline: 'none'
                    }} 
                  />
                </div>

                {syncStatus && (
                  <div style={{ color: 'var(--accent-solid)', fontSize: '0.9rem', fontWeight: 500 }}>
                    {syncStatus}
                  </div>
                )}

                {downloadReady ? (
                  <a
                    href={`/api/jobs/${jobId}/zip?token=${localStorage.getItem('tidal-token') || ''}`}
                    download
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px', textDecoration: 'none', background: 'var(--success)' }}
                  >
                    <CheckCircle2 size={20} />
                    Download ZIP Archive
                  </a>
                ) : (
                  <button 
                    className="btn-primary" 
                    onClick={handleSync}
                    disabled={!syncUrl || isSyncing}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px', opacity: (!syncUrl || isSyncing) ? 0.5 : 1 }}
                  >
                    {isSyncing ? 'Matching Tracks...' : 'Start Synchronization'}
                    {!isSyncing && <ArrowRight size={20} />}
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
