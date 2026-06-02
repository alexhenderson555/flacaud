import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, CheckCircle2, Loader2, X } from 'lucide-react';
import { getCachedAudioUrl } from '../utils/cache';

const qualityLabel = (q) => (q === 'HI_RES' ? 'MAX' : q);

export default function DownloadToast() {
  const [activeJobs, setActiveJobs] = useState([]);
  const [browserProgressMap, setBrowserProgressMap] = useState({});
  const autoDownloadedRef = React.useRef(new Set());

  const handleSaveToPC = async (job, setBrowserProgress) => {
    let url = null;
    if (job.file_token) {
      url = `/api/files/${job.file_token}`;
    } else if (job.provider_id) {
      url = await getCachedAudioUrl({ provider: job.provider, provider_id: job.provider_id }, job.quality);
      if (!url) {
        url = `/api/stream/${job.provider}/${job.provider_id}?quality=${job.quality}&token=${localStorage.getItem('tidal-token') || ''}`;
      }
    }
    
    if (!url) return;
    if (window.__TAURI__ && url.startsWith('/api')) {
      url = 'http://localhost:8000' + url;
    }
    
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10);
      let loaded = 0;
      
      const reader = response.body.getReader();
      const chunks = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) {
          setBrowserProgress(Math.round((loaded / total) * 100));
        } else {
          // If chunked encoding, simulate some progress or just keep it at 0 until done
          // We can just rely on the final 100% call below.
        }
      }
      
      setBrowserProgress(100);
      
      const blob = new Blob(chunks);
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const cd = response.headers.get('content-disposition');
      let ext = 'flac';
      if (cd && cd.includes('filename=')) {
        const filename = cd.split('filename=')[1].replace(/['"]/g, '');
        if (filename.includes('.')) {
          ext = filename.split('.').pop();
        }
      } else {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('mp4')) ext = 'mp4';
        if (ct.includes('m4a') || ct.includes('aac')) ext = 'm4a';
      }
      
      a.download = `${job.title}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Download failed:', e);
    }
  };

  useEffect(() => {
    const fetchJobs = async () => {
      const saved = localStorage.getItem('tidal-queue-jobs');
      if (!saved) return;
      try {
        const jobIds = JSON.parse(saved);
        if (jobIds.length === 0) return;
        
        const jobPromises = jobIds.map(id => fetch(`/api/jobs/${id}`).then(r => r.ok ? r.json() : null));
        const results = await Promise.all(jobPromises);
        
        const newItems = [];
        results.forEach(job => {
          if (!job) return;
          const trackProgress = job.tracks && job.tracks[0];
          const isDone = job.status === 'done' || (trackProgress && trackProgress.status === 'done');

          let progress = 0;
          if (trackProgress && trackProgress.bytes_total && trackProgress.bytes_total > 0) {
            // bytes_total can be an ESTIMATE for multi-segment (DASH) downloads, so the
            // running byte count may momentarily reach or exceed it. Cap at 99% until the
            // job actually reports done — otherwise the "save to PC" trigger below would
            // fire against a file the server hasn't finished writing (no file_token yet).
            progress = Math.min(99, Math.round((trackProgress.bytes_written / trackProgress.bytes_total) * 100));
          }
          if (isDone) progress = 100;

          const jobObj = {
            id: job.job_id,
            title: trackProgress ? trackProgress.title : 'Download',
            progress: progress,
            status: job.status,
            provider_id: trackProgress ? trackProgress.provider_id : null,
            file_token: trackProgress ? trackProgress.file_token : null,
            provider: trackProgress ? trackProgress.provider : 'tidal',
            quality: job.quality || 'LOSSLESS'
          };

          // Auto-save to PC only once the server has truly finished (file is ready).
          if (isDone && !autoDownloadedRef.current.has(job.job_id)) {
            autoDownloadedRef.current.add(job.job_id);
            setBrowserProgressMap(prev => ({ ...prev, [job.job_id]: 0 }));
            handleSaveToPC(jobObj, (p) => {
              setBrowserProgressMap(prev => ({ ...prev, [job.job_id]: p }));
              if (p === 100) {
                setTimeout(() => {
                  setBrowserProgressMap(prev => ({ ...prev, [job.job_id]: 101 })); // 101 means ready to hide
                }, 3000);
              }
            });
          }
          
          if (progress < 100 || (browserProgressMap[job.job_id] !== undefined && browserProgressMap[job.job_id] <= 100)) {
            newItems.push(jobObj);
          }
        });
        const activeIds = newItems.map(j => j.id);
        if (activeIds.length !== jobIds.length) {
          localStorage.setItem('tidal-queue-jobs', JSON.stringify(activeIds));
        }
        
        setActiveJobs(newItems);
      } catch (err) {
        console.error(err);
      }
    };

    const interval = setInterval(fetchJobs, 1000);
    return () => clearInterval(interval);
  }, []);



  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <AnimatePresence>
        {activeJobs.map(job => (
          <motion.div
            key={job.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="glass-panel"
            style={{ padding: '16px', borderRadius: '16px', width: '300px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--border-subtle)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: job.progress === 100 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(37, 117, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: job.progress === 100 ? 'var(--success)' : 'var(--accent-solid)' }}>
                  {job.progress === 100 ? <CheckCircle2 size={20} /> : <Download size={20} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{job.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {job.progress === 100 ? (browserProgressMap[job.id] !== undefined ? (browserProgressMap[job.id] === 100 ? 'Saved to PC' : `Saving to PC... ${browserProgressMap[job.id]}%`) : 'Downloaded') : `Downloading... ${job.progress}%`}
                  </div>
                </div>
              </div>
              {job.quality && (
                <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: 'var(--bg-surface-hover)', color: 'var(--text-secondary)', letterSpacing: '0.5px', flexShrink: 0, marginLeft: '8px' }}>
                  {qualityLabel(job.quality)}
                </span>
              )}
            </div>
            
            {(job.progress < 100 || (job.progress === 100 && browserProgressMap[job.id] !== undefined && browserProgressMap[job.id] <= 100)) && (
              <div style={{ width: '100%', height: '4px', background: 'var(--bg-surface-hover)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, job.progress < 100 ? job.progress : browserProgressMap[job.id])}%`, background: job.progress === 100 ? 'var(--success)' : 'var(--accent-gradient)', transition: 'width 0.3s ease' }} />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
