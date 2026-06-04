import { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { Disc, Download, Loader2, Music, Mic2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { enqueueDownloadJob } from '../utils/downloadJobs';

export default function StemSplitter() {
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [error, setError] = useState(null);

  const startSplit = async () => {
    if (!url.trim()) return;
    try {
      setError(null);
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
        body: JSON.stringify({ url, job_type: 'download', quality: 'LOSSLESS', split: true })
      });
      if (!res.ok) throw new Error('Failed to start stem splitting');
      const data = await res.json();
      setJobId(data.job_id);
      setStatus(data.status);
      enqueueDownloadJob(data.job_id);
      showToast('Stem split started — see progress bottom-right');
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    let interval;
    let attempts = 0;
    const maxAttempts = 120;
    if (jobId && (status === 'queued' || status === 'running')) {
      interval = setInterval(async () => {
        attempts += 1;
        if (attempts > maxAttempts) {
          clearInterval(interval);
          setError('Job timed out — check that the worker is running');
          setStatus('failed');
          return;
        }
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` } });
          if (res.ok) {
            const data = await res.json();
            setStatus(data.status);
            if (data.status === 'failed') {
              setError(data.tracks?.[0]?.error || 'Job failed');
              clearInterval(interval);
            } else if (data.status === 'done') {
              setTracks(data.tracks || []);
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
          Stem <span className="text-gradient">Splitter</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '500px' }}>
          Extract Vocals and Instrumentals from any Tidal track using AI (Demucs).
        </p>
      </motion.div>

      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} style={{ display: 'flex', gap: '12px', maxWidth: '800px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', flex: 1 }}>
          <Disc size={24} color="var(--text-muted)" style={{ marginRight: '16px' }} />
          <input
            type="text"
            placeholder="Paste Tidal track URL here..."
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.2rem', padding: '12px 0' }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startSplit()}
            disabled={status === 'running' || status === 'queued'}
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={startSplit}
          disabled={status === 'running' || status === 'queued' || !url.trim()}
          style={{ borderRadius: '24px', padding: '12px 32px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {status === 'running' || status === 'queued' ? (
            <><Loader2 className="spinner" size={20} /> Splitting...</>
          ) : (
            <><Disc size={20} /> Split Track</>
          )}
        </button>
      </motion.div>

      {error && (
        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '24px', maxWidth: '800px' }}>
          {error}
        </div>
      )}

      {tracks.length > 0 && status === 'done' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ maxWidth: '800px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Disc size={24} /> Split Results
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tracks.map((t, i) => (
              <div key={i} className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '16px', borderRadius: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px', color: 'var(--accent-solid)' }}>
                  {i === 0 ? <Mic2 size={24} /> : <Music size={24} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white' }}>{i === 0 ? 'Vocals' : 'Instrumental'}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>Ready to download</div>
                </div>
                <a href={`/api/files/${t.file_token}`} download className="btn-secondary" style={{ padding: '10px 20px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                  <Download size={18} /> Download FLAC
                </a>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
