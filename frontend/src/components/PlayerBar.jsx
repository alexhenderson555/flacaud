import React from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Heart, Plus, Download, Mic2, Disc3, Sliders, ListMusic, Volume2, Waves } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PlayerBar({
  t,
  currentTrack,
  actualQuality,
  isLoading,
  isPlaying,
  progress,
  trackDuration,
  volume,
  playbackQuality,
  likedTracks,
  isKaraokeOpen,
  isDJOpen,
  isEQOpen,
  isQueueOpen,
  playlist,
  currentTrackIndex,
  togglePlay,
  playPrevious,
  playNext,
  handleSeek,
  changeQuality,
  toggleLike,
  setIsPlaylistModalOpenPlayer,
  handleDownloadPlayer,
  toggleOverlay,
  setVolume,
  timeSpanRef,
  progressRef
}) {

  const formatTime = (timeInSeconds) => {
    if (!timeInSeconds || isNaN(timeInSeconds)) return "0:00";
    const m = Math.floor(timeInSeconds / 60);
    const s = Math.floor(timeInSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="player-bar glass-panel" style={{ borderBottom: 'none', borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '8px', background: 'var(--bg-surface-hover)', overflow: 'hidden' }}>
           {currentTrack?.cover_url ? (
             <img src={currentTrack.cover_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
           ) : (
             <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Waves size={24} color="var(--text-muted)" />
             </div>
           )}
        </div>
        <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             {currentTrack ? currentTrack.title : t('readyToPlay')}
             {currentTrack && (
               <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                 {actualQuality && (
                   <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--accent-solid)', borderRadius: '4px', color: '#fff' }}>
                     {actualQuality === 'HI_RES' || actualQuality === 'HI_RES_LOSSLESS' ? 'MAX' : actualQuality === 'LOSSLESS' ? 'FLAC' : actualQuality}
                   </span>
                 )}
                 {currentTrack.release_date && (
                   <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--bg-surface-hover)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                     {currentTrack.release_date.split('-')[0]}
                   </span>
                 )}
               </div>
             )}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {currentTrack ? (
              currentTrack.artists ? currentTrack.artists.map((artistName, i) => {
                const artistId = currentTrack.artist_ids?.[i];
                return (
                  <React.Fragment key={i}>
                    {i > 0 && ", "}
                    {artistId ? (
                      <Link to={`/artist/${artistId}`} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.target.style.textDecoration='underline'} onMouseLeave={e => e.target.style.textDecoration='none'}>
                        {artistName}
                      </Link>
                    ) : artistName}
                  </React.Fragment>
                );
              }) : 'Unknown Artist'
            ) : t('selectTrack')}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 2, justifyContent: 'center', color: 'var(--text-primary)' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
           <SkipBack 
             size={20} 
             opacity={currentTrack ? 1 : 0.5} 
             cursor={currentTrack ? "pointer" : "default"} 
             onClick={playPrevious}
           />
           <div 
              onClick={() => currentTrack && !isLoading && togglePlay(currentTrack)}
              style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentTrack && !isLoading ? 'pointer' : 'default', opacity: currentTrack ? 1 : 0.5, position: 'relative' }}
           >
             {isLoading ? (
               <motion.div 
                 animate={{ rotate: 360 }} 
                 transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                 style={{ width: '18px', height: '18px', border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%' }}
               />
             ) : (
               isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '4px' }} />
             )}
           </div>
           <SkipForward 
             size={20} 
             opacity={(playlist.length > 0 && currentTrackIndex < playlist.length - 1) ? 1 : 0.5} 
             cursor={(playlist.length > 0 && currentTrackIndex < playlist.length - 1) ? "pointer" : "default"} 
             onClick={playNext}
           />
         </div>
         <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '600px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
           <span ref={timeSpanRef} style={{ width: '45px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatTime(progress)}</span>
           <div 
             onClick={handleSeek}
             style={{ flex: 1, height: '8px', background: 'var(--bg-surface-hover)', borderRadius: '4px', cursor: trackDuration ? 'pointer' : 'default', position: 'relative', overflow: 'visible' }}
           >
             <div ref={progressRef} style={{ width: `${trackDuration ? Math.min(100, (progress/trackDuration)*100) : 0}%`, height: '100%', background: 'var(--accent-solid)', borderRadius: '4px', position: 'relative' }}>
               <div style={{ 
                 position: 'absolute', 
                 right: '-6px', 
                 top: '50%', 
                 transform: 'translateY(-50%)', 
                 width: '12px', 
                 height: '12px', 
                 borderRadius: '50%', 
                 background: '#fff', 
                 boxShadow: '0 0 5px rgba(0,0,0,0.5)' 
               }} />
             </div>
           </div>
           <span style={{ width: '45px', textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{formatTime(trackDuration)}</span>
         </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'flex-end', color: 'var(--text-secondary)' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '16px', borderRight: '1px solid var(--border-subtle)', paddingRight: '24px' }}>
           <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '20px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
             {[
               { id: 'LOW', label: '96k', color: 'rgba(255,255,255,0.2)', level: 0 },
               { id: 'HIGH', label: '320k', color: 'rgba(255,255,255,0.4)', level: 1 },
               { id: 'LOSSLESS', label: 'FLAC', color: '#2575fc', level: 2 },
               { id: 'HI_RES', label: 'MAX', color: '#ffb703', level: 3 }
             ].map(q => {
               const isDisabled = false;

               return (
                 <div 
                   key={q.id}
                   onClick={() => !isDisabled && changeQuality(q.id)}
                   style={{
                     padding: '4px 10px',
                     fontSize: '0.65rem',
                     fontWeight: playbackQuality === q.id ? 700 : 500,
                     color: playbackQuality === q.id ? '#fff' : (isDisabled ? 'var(--text-muted)' : 'var(--text-secondary)'),
                     background: playbackQuality === q.id ? q.color : 'transparent',
                     borderRadius: '18px',
                     cursor: isDisabled ? 'not-allowed' : 'pointer',
                     opacity: isDisabled ? 0.3 : 1,
                     transition: 'all 0.2s ease',
                     boxShadow: playbackQuality === q.id && q.id !== 'LOW' && q.id !== 'HIGH' ? `0 0 10px ${q.color}60` : 'none',
                     textTransform: 'uppercase',
                     letterSpacing: '0.5px'
                   }}
                   title={isDisabled ? `Track not available in ${q.label}` : q.label}
                 >
                   {q.label}
                 </div>
               );
             })}
           </div>
           
           <div style={{ display: 'flex', alignItems: 'center', gap: '28px', marginRight: '8px' }}>
              <Heart 
                size={22} 
                cursor={currentTrack ? "pointer" : "default"}
                fill={currentTrack && likedTracks.has(String(currentTrack.provider_id)) ? "var(--accent-solid)" : "none"}
                color={currentTrack && likedTracks.has(String(currentTrack.provider_id)) ? "var(--accent-solid)" : "var(--text-primary)"}
                onClick={() => toggleLike(currentTrack)}
                style={{ transition: 'all 0.2s', opacity: currentTrack ? 1 : 0.5 }} 
                title="Like"
              />
              <Plus 
                size={22} 
                cursor={currentTrack ? "pointer" : "default"}
                onClick={() => currentTrack && setIsPlaylistModalOpenPlayer(true)}
                style={{ color: 'var(--text-primary)', transition: 'all 0.2s', opacity: currentTrack ? 1 : 0.5 }}
                title="Add to Playlist"
              />
              {currentTrack && (
               <Download 
                 size={22} 
                 cursor="pointer" 
                 title={`Download in ${playbackQuality}`} 
                 onClick={handleDownloadPlayer}
                 style={{ color: 'var(--text-primary)', transition: 'color 0.2s' }} 
               />
              )}
              <button 
                onClick={() => toggleOverlay('karaoke')}
                style={{ background: 'transparent', border: 'none', color: isKaraokeOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                title="Karaoke Mode"
              >
                <Mic2 size={22} />
              </button>
              <button 
                onClick={() => toggleOverlay('dj')}
                style={{ background: 'transparent', border: 'none', color: isDJOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                title="DJ Tools"
              >
                <Disc3 size={22} />
              </button>
              <button 
                onClick={() => toggleOverlay('eq')}
                style={{ background: 'transparent', border: 'none', color: isEQOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                title="Target Quality"
              >
                <Sliders size={22} />
              </button>
              <button 
                onClick={() => toggleOverlay('queue')}
                style={{ background: 'transparent', border: 'none', color: isQueueOpen ? 'var(--accent-solid)' : 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }}
                title="Queue"
              >
                <ListMusic size={22} />
              </button>
            </div>
         </div>

         <Volume2 size={20} />
         <div 
           style={{ width: '100px', height: '4px', background: 'var(--bg-surface-hover)', borderRadius: '2px', cursor: 'pointer', position: 'relative' }}
           onClick={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const val = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
             setVolume(val);
           }}
         >
           <div style={{ width: `${volume * 100}%`, height: '100%', background: 'var(--text-primary)', borderRadius: '2px', transition: 'width 0.1s' }}></div>
         </div>
      </div>
    </div>
  );
}
