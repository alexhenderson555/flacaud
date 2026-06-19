import { Heart, Plus, Download, Mic2, Disc3, Sliders, ListMusic, Radio } from 'lucide-react';

export default function PlayerMobileActions({
  lang,
  t,
  currentTrack,
  liked,
  toggleLike,
  setIsPlaylistModalOpenPlayer,
  startTrackRadio,
  handleDownloadPlayer,
  toggleOverlay,
  isKaraokeOpen,
  isDJOpen,
  isEQOpen,
  isQueueOpen
}) {
  const actionBtn = (icon, label, onClick, opts = {}) => (
    <button
      type="button"
      className="player-mobile-action-btn"
      onClick={onClick}
      disabled={opts.disabled}
      title={label}
      aria-label={label}
      data-active={opts.active ? 'true' : undefined}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  if (!currentTrack) return null;

  return (
    <div className="player-mobile-actions">
      <div className="player-mobile-actions__row">
        {actionBtn(
          <Heart size={20} fill={liked ? 'var(--accent-solid)' : 'none'} color={liked ? 'var(--accent-solid)' : 'currentColor'} />,
          liked ? (lang === 'ru' ? 'В избранном' : 'Liked') : (lang === 'ru' ? 'Лайк' : 'Like'),
          (e) => toggleLike(currentTrack, e),
        )}
        {actionBtn(
          <Plus size={20} />,
          lang === 'ru' ? 'В плейлист' : 'Add',
          () => setIsPlaylistModalOpenPlayer(true),
        )}
        {actionBtn(
          <Radio size={20} />,
          t('startTrackRadio') || (lang === 'ru' ? 'Радио' : 'Radio'),
          () => startTrackRadio(currentTrack),
        )}
        {actionBtn(
          <Download size={20} />,
          lang === 'ru' ? 'Скачать' : 'Download',
          handleDownloadPlayer,
        )}
      </div>
      <div className="player-mobile-actions__row">
        {actionBtn(
          <Mic2 size={20} />,
          'Karaoke',
          () => toggleOverlay('karaoke'),
          { active: isKaraokeOpen },
        )}
        {actionBtn(
          <Disc3 size={20} />,
          'DJ',
          () => toggleOverlay('dj'),
          { active: isDJOpen },
        )}
        {actionBtn(
          <Sliders size={20} />,
          lang === 'ru' ? 'Эквалайзер' : 'EQ',
          () => toggleOverlay('eq'),
          { active: isEQOpen },
        )}
        {actionBtn(
          <ListMusic size={20} />,
          lang === 'ru' ? 'Очередь' : 'Queue',
          () => toggleOverlay('queue'),
          { active: isQueueOpen },
        )}
      </div>
    </div>
  );
}
