import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ListMusic, Link, Plus, ListChecks, Search, Trash2, ExternalLink, Share2,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { messageForApiError } from '../utils/apiClient';
import { canPlaySetUrl } from '../components/LazySetPlayer';
import { formatTrackCountAndDuration } from '../utils/trackDuration';
import {
  normalizeSetUrl,
  analyzerQueryForSet,
  resolveSetDisplayTitle,
  setSourceHost,
} from '../utils/setLibrary';
import { useSetLibraryData } from '../hooks/useSetLibraryData';
import { createSetShareLink, shareUrlFromToken } from '../utils/shareApi';
import { hasAuthSession } from '../utils/hasAuthSession';

const dict = {
  en: {
    title: 'Set',
    titleBold: 'Library',
    desc: 'Saved DJ sets. View tracklist opens what was already found; Analyze runs Shazam (listening happens in the analyzer).',
    addPlaceholder: 'Paste YouTube or SoundCloud set URL…',
    addBtn: 'Add to library',
    empty: 'No saved sets yet. Add a link or save a set from the analyzer.',
    analyze: 'Analyze',
    reanalyze: 'Re-analyze',
    remove: 'Remove',
    viewTracklist: 'View tracklist',
    invalidUrl: 'Paste a valid YouTube or SoundCloud link',
    added: 'Set saved to library',
    removed: 'Set removed',
    share: 'Share',
    shareCopied: 'Share link copied',
    shareNeedLogin: 'Log in to share sets',
  },
  ru: {
    title: 'Библиотека',
    titleBold: 'сетов',
    desc: 'Сохранённые сеты. «Треклист» — открыть уже найденное; «Анализ» — запуск Shazam (слушать — в анализаторе).',
    addPlaceholder: 'Ссылка YouTube или SoundCloud…',
    addBtn: 'Добавить',
    empty: 'Пока нет сетов. Добавьте ссылку или сохраните сет в анализаторе.',
    analyze: 'Анализ',
    reanalyze: 'Повторный анализ',
    remove: 'Удалить',
    viewTracklist: 'Треклист',
    invalidUrl: 'Нужна ссылка YouTube или SoundCloud',
    added: 'Сет сохранён',
    removed: 'Сет удалён',
    share: 'Поделиться',
    shareCopied: 'Ссылка скопирована',
    shareNeedLogin: 'Войдите, чтобы делиться сетами',
  },
};

export default function SetLibrary() {
  const { lang } = useOutletContext();
  const t = (key) => dict[lang]?.[key] || dict.en[key] || key;
  const navigate = useNavigate();
  const { sets, loading, addByUrl, removeSet, reload } = useSetLibraryData(lang);
  const [addUrl, setAddUrl] = useState('');

  const handleAdd = async () => {
    const url = normalizeSetUrl(addUrl);
    if (!url || !canPlaySetUrl(url)) {
      showToast(t('invalidUrl'));
      return;
    }
    const ok = await addByUrl(url);
    if (ok) {
      setAddUrl('');
      showToast(t('added'));
    }
  };

  const goAnalyzer = (url, opts) => {
    navigate(analyzerQueryForSet(url, opts));
  };

  const handleRemove = async (row) => {
    await removeSet(row);
    showToast(t('removed'));
  };

  const handleShare = async (row) => {
    if (!hasAuthSession()) {
      showToast(t('shareNeedLogin'));
      return;
    }
    if (!row.serverId) {
      showToast(t('shareNeedLogin'));
      return;
    }
    try {
      let token = row.shareToken;
      if (!token) {
        const data = await createSetShareLink(row.serverId, lang);
        token = data.token;
        await reload();
      }
      const link = shareUrlFromToken(token);
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        window.prompt(lang === 'ru' ? 'Скопируйте ссылку:' : 'Copy link:', link);
      }
      showToast(t('shareCopied'));
    } catch (err) {
      showToast(messageForApiError(err, lang));
    }
  };

  const metaLine = (row) => {
    const count = row.trackCount ?? row.setTracks?.length ?? 0;
    const dur = row.durationSeconds
      ?? (row.setTracks?.length ? row.setTracks.reduce((s, tr) => s + (Number(tr.duration || tr.duration_s) || 0), 0) : 0);
    return formatTrackCountAndDuration(count, dur, (k) => (k === 'libTrackWord' ? (lang === 'ru' ? 'трек' : 'track') : (lang === 'ru' ? 'треков' : 'tracks')));
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: '1100px', margin: '0 auto' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '12px', marginTop: 0 }}>
          {t('title')} <span className="text-gradient">{t('titleBold')}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '640px', margin: 0 }}>{t('desc')}</p>
      </motion.div>

      <div
        className="glass-panel"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 16px',
          borderRadius: '20px',
          marginBottom: '28px',
          alignItems: 'stretch',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flex: '1 1 280px', minWidth: 0, gap: '12px' }}>
          <Link size={20} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            type="url"
            data-testid="set-library-add-input"
            placeholder={t('addPlaceholder')}
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none',
              minWidth: 0,
            }}
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          data-testid="set-library-add-btn"
          onClick={handleAdd}
          style={{ borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
        >
          <Plus size={18} /> {t('addBtn')}
        </button>
      </div>

      {loading && sets.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>…</p>
      ) : sets.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px 24px' }}>
          <ListMusic size={48} style={{ opacity: 0.35, marginBottom: '16px' }} />
          <p>{t('empty')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '32px' }}>
          {sets.map((set, i) => {
            const displayTitle = resolveSetDisplayTitle(set);
            const hasTracks = (set.trackCount ?? set.setTracks?.length ?? 0) > 0;

            return (
              <motion.div
                key={set.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="glass-panel"
                data-testid="set-library-row"
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <button
                      type="button"
                      data-testid="set-library-title"
                      onClick={() => goAnalyzer(set.url)}
                      title={t('viewTracklist')}
                      style={{
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        marginBottom: '6px',
                        color: 'var(--text-primary)',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                        lineHeight: 1.35,
                      }}
                    >
                      {displayTitle}
                    </button>
                    <a
                      href={set.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={set.url}
                      style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ExternalLink size={12} /> {setSourceHost(set.url)}
                    </a>
                    <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--accent-solid)' }}>
                      {metaLine(set) || (lang === 'ru' ? '0 треков · 0:00' : '0 tracks · 0:00')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {hasTracks && (
                      <button
                        type="button"
                        className="btn-primary"
                        data-testid="set-library-view-tracklist"
                        onClick={() => goAnalyzer(set.url)}
                        style={{ borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
                      >
                        <ListChecks size={16} /> {t('viewTracklist')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={hasTracks ? 'btn-secondary' : 'btn-primary'}
                      data-testid="set-library-analyze"
                      onClick={() => goAnalyzer(set.url, { analyze: true })}
                      style={{ borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
                    >
                      <Search size={16} /> {hasTracks ? t('reanalyze') : t('analyze')}
                    </button>
                    {set.serverId && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleShare(set)}
                        style={{ borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
                      >
                        <Share2 size={16} /> {t('share')}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t('remove')}
                      onClick={() => handleRemove(set)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '8px',
                      }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

