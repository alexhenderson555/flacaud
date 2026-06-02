import React, { useState, useEffect, useRef } from 'react';
import { showToast } from '../utils/toast';
import { useOutletContext } from 'react-router-dom';
import { Search, ListMusic, Download, Play, Clock, Link, Check, Loader2, List, DownloadCloud, Music, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactPlayer from 'react-player';

export default function SetAnalyzer() {
  const { togglePlay, playingTrackId, downloadedTracks } = useOutletContext();
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null); // 'idle', 'running', 'done', 'failed'
  const [setTracks, setSetTracks] = useState([]);
  const [error, setError] = useState(null);
  const playerRef = useRef(null);

  const playFromTimestamp = (timestamp) => {
    const parts = timestamp.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (playerRef.current) {
      playerRef.current.seekTo(seconds, 'seconds');
      playerRef.current.getInternalPlayer()?.playVideo?.();
    }
  };

  const startAnalysis = async () => {
    if (!url.trim()) return;
    try {
      setError(null);
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
        body: JSON.stringify({ url, job_type: 'analyze_set' })
      });
      if (!res.ok) throw new Error('Failed to start analysis');
      const data = await res.json();
      setJobId(data.job_id);
      setStatus(data.status);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    let interval;
    if (jobId && (status === 'queued' || status === 'running')) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            setStatus(data.status);
            setSetTracks(data.set_tracks || []);
            if (data.status === 'done' || data.status === 'failed') {
              clearInterval(interval);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, status]);

  const downloadAll = async () => {
    for (const trackInfo of setTracks) {
      if (trackInfo.matched_track) {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
          body: JSON.stringify({ url: trackInfo.matched_track.source_url, job_type: 'download' })
        });
        if (res.ok) {
          const data = await res.json();
          const saved = localStorage.getItem('tidal-queue-jobs');
          const jobs = saved ? JSON.parse(saved) : [];
          jobs.push(data.job_id);
          localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
        }
      }
    }
    showToast('Started downloading all matches to queue!');
  };

  const copyTracklist = () => {
    const text = setTracks.map(t => `${t.timestamp} - ${t.artist} - ${t.title}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '40px' }}
      >
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
          Set <span className="text-gradient">Analyzer</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '500px' }}>
          Extract tracklists from DJ sets (YouTube / SoundCloud) using Shazam.
        </p>
      </motion.div>

      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        style={{ position: 'relative', width: '100%', maxWidth: '800px', marginBottom: '40px', display: 'flex', gap: '12px' }}
      >
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', flex: 1 }}>
          <Link size={24} color="var(--text-muted)" style={{ marginRight: '16px' }} />
          <input
            type="text"
            placeholder="Paste set URL here..."
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.2rem', padding: '12px 0' }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startAnalysis()}
            disabled={status === 'running' || status === 'queued'}
          />
        </div>
        
        <button
          className="btn-primary"
          onClick={startAnalysis}
          disabled={status === 'running' || status === 'queued' || !url.trim()}
          style={{ borderRadius: '24px', padding: '12px 32px', display: 'flex', alignItems: 'center', gap: '8px', cursor: (status === 'running' || status === 'queued' || !url.trim()) ? 'not-allowed' : 'pointer' }}
        >
          {status === 'running' || status === 'queued' ? (
            <><Loader2 className="spinner" size={20} /> Analyzing...</>
          ) : (
            <><Search size={20} /> Analyze</>
          )}
        </button>

        <button
          className="btn-secondary"
          onClick={async () => {
            const res = await fetch('/api/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
              body: JSON.stringify({ url: url, job_type: 'download', quality: 'LOSSLESS' })
            });
            if (res.ok) {
              const data = await res.json();
              const saved = localStorage.getItem('tidal-queue-jobs');
              const jobs = saved ? JSON.parse(saved) : [];
              jobs.push(data.job_id);
              localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
              showToast('Started downloading original set to server! Check Queue tab.');
            }
          }}
          disabled={!url.trim()}
          style={{ borderRadius: '24px', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px', cursor: !url.trim() ? 'not-allowed' : 'pointer' }}
          title="Download original set"
        >
          <DownloadCloud size={20} />
        </button>
      </motion.div>

      {error && (
        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', marginBottom: '24px', maxWidth: '800px' }}>
          {error}
        </div>
      )}

      {url && (status === 'done' || status === 'running') && ReactPlayer.canPlay(url) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{ borderRadius: '16px', overflow: 'hidden', marginBottom: '24px', width: '100%', maxWidth: '800px', background: 'black', aspectRatio: '16/9' }}
        >
          <ReactPlayer 
            ref={playerRef}
            url={url} 
            width="100%" 
            height="100%" 
            controls={true}
            playing={false}
          />
        </motion.div>
      )}

      {setTracks.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px', width: '100%', flex: 1, minHeight: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ListMusic size={24} /> Tracklist ({setTracks.length} tracks found)
            </h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn-secondary" onClick={copyTracklist} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 24px' }}>
                <List size={16} /> Copy Text
              </button>
              <button className="btn-primary" onClick={downloadAll} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 24px' }}>
                <DownloadCloud size={16} /> Download All Matches
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', paddingRight: '12px', paddingBottom: '24px' }}>
            {setTracks.map((track, i) => (
              <motion.div 
                key={i}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel"
                style={{ display: 'flex', alignItems: 'center', padding: '16px', borderRadius: '16px', transition: 'background 0.2s', cursor: 'default', marginBottom: '12px' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
              >
                <div 
                  onClick={() => playFromTimestamp(track.timestamp)}
                  style={{ width: '64px', color: 'var(--accent-solid)', fontWeight: 600, fontFamily: 'monospace', fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Play set from this timestamp"
                >
                  <Play size={14} /> {track.timestamp}
                </div>
                
                {track.matched_track ? (
                  <img src={track.matched_track.cover_url} alt="Cover" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', marginRight: '16px' }} />
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px', color: 'var(--text-muted)' }}>
                    <Music size={20} />
                  </div>
                )}
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'white', marginBottom: '4px' }}>{track.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{track.artist}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {track.matched_track ? (
                    <>
                      <button 
                        className="btn-secondary" 
                        onClick={(e) => { e.stopPropagation(); togglePlay(track.matched_track, setTracks.map(t => t.matched_track).filter(Boolean)); }}
                        style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: playingTrackId === track.matched_track.provider_id ? 'var(--accent-glow)' : 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'white' }}
                        title="Play"
                      >
                        {playingTrackId === track.matched_track.provider_id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                      </button>
                      <button 
                        className="btn-primary" 
                        onClick={async (e) => {
                          e.stopPropagation();
                          const res = await fetch('/api/jobs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
                            body: JSON.stringify({ url: track.matched_track.source_url, job_type: 'download' })
                          });
                          if (res.ok) {
                            const data = await res.json();
                            const saved = localStorage.getItem('tidal-queue-jobs');
                            const jobs = saved ? JSON.parse(saved) : [];
                            jobs.push(data.job_id);
                            localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
                          }
                        }}
                        style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: downloadedTracks?.has(track.matched_track.provider_id) ? 0.7 : 1 }}
                        title={downloadedTracks?.has(track.matched_track.provider_id) ? "Downloaded" : "Download"}
                      >
                        {downloadedTracks?.has(track.matched_track.provider_id) ? <Check size={18} /> : <Download size={18} />}
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Not found in library</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
