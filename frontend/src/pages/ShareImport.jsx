import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ListMusic, LogIn, Plus } from 'lucide-react';
import { showToast } from '../utils/toast';
import { messageForApiError } from '../utils/apiClient';
import {
  claimShareToken,
  fetchSharePreview,
  shareUrlFromToken,
  storePendingShareToken,
} from '../utils/shareApi';
import { formatTrackCountAndDuration } from '../utils/trackDuration';
import { hasAuthSession } from '../utils/hasAuthSession';

const dict = {
  en: {
    loading: 'Loading shared link…',
    notFound: 'This share link was not found or has expired.',
    sharedBy: 'Shared by',
    add: 'Add to my library',
    loginToAdd: 'Log in to add',
    loginHint: 'Sign in — the playlist or set will be imported automatically.',
    claiming: 'Adding…',
    goLibrary: 'Open library',
    goSets: 'Open set library',
    playlist: 'Playlist',
    set: 'DJ set',
    added: 'Added to your library',
    alreadyHad: 'Already in your library',
  },
  ru: {
    loading: 'Загрузка ссылки…',
    notFound: 'Ссылка не найдена или устарела.',
    sharedBy: 'Поделился',
    add: 'Добавить в медиатеку',
    loginToAdd: 'Войти, чтобы добавить',
    loginHint: 'Войдите — плейлист или сет импортируется автоматически.',
    claiming: 'Добавляем…',
    goLibrary: 'Открыть медиатеку',
    goSets: 'Открыть библиотеку сетов',
    playlist: 'Плейлист',
    set: 'DJ-сет',
    added: 'Добавлено в медиатеку',
    alreadyHad: 'Уже было в медиатеке',
  },
};

export default function ShareImport() {
  const { token } = useParams();
  const navigate = useNavigate();
  const lang = localStorage.getItem('tidal-lang') || 'en';
  const t = (key) => dict[lang]?.[key] || dict.en[key] || key;

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(null);
  const [loggedIn, setLoggedIn] = useState(() => hasAuthSession());

  useEffect(() => {
    const syncAuth = () => setLoggedIn(hasAuthSession());
    window.addEventListener('tidal-auth-login', syncAuth);
    window.addEventListener('tidal-auth-expired', syncAuth);
    return () => {
      window.removeEventListener('tidal-auth-login', syncAuth);
      window.removeEventListener('tidal-auth-expired', syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setError(t('notFound'));
      setLoading(false);
      return;
    }
    storePendingShareToken(token);
    (async () => {
      try {
        const data = await fetchSharePreview(token, lang);
        setPreview(data);
      } catch (err) {
        setError(messageForApiError(err, lang) || t('notFound'));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, lang]);

  const handleClaim = async () => {
    if (!token || !loggedIn) return;
    setClaiming(true);
    try {
      const result = await claimShareToken(token, lang);
      sessionStorage.removeItem('tidal-pending-share-token');
      window.dispatchEvent(new CustomEvent('tidal-sets-changed'));
      showToast(result.already_had ? t('alreadyHad') : t('added'));
      navigate(result.kind === 'set' ? '/sets' : '/library?tab=playlists');
    } catch (err) {
      showToast(messageForApiError(err, lang));
    } finally {
      setClaiming(false);
    }
  };

  const kindLabel = preview?.kind === 'set' ? t('set') : t('playlist');
  const meta = preview
    ? formatTrackCountAndDuration(preview.track_count, preview.duration_seconds, (k) => {
      if (k === 'libTrackWord') return lang === 'ru' ? 'трек' : 'track';
      if (k === 'libTracksWord') return lang === 'ru' ? 'треков' : 'tracks';
      return '';
    })
    : '';

  return (
    <div
      className="app-container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        background: 'var(--bg-dark)',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '32px',
          borderRadius: '24px',
          textAlign: 'center',
        }}
      >
        <ListMusic size={48} color="var(--accent-solid)" style={{ marginBottom: '16px' }} />
        {loading && <p style={{ color: 'var(--text-secondary)' }}>{t('loading')}</p>}
        {!loading && error && (
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
        )}
        {!loading && preview && (
          <>
            <div style={{ fontSize: '0.85rem', color: 'var(--accent-solid)', marginBottom: '8px', fontWeight: 600 }}>
              {kindLabel}
            </div>
            <h1 style={{ fontSize: '1.75rem', margin: '0 0 8px', fontWeight: 800 }}>{preview.title}</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>{meta}</p>
            {preview.owner_username && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
                {t('sharedBy')} {preview.owner_username}
              </p>
            )}
            {loggedIn ? (
              <button
                type="button"
                className="btn-primary"
                disabled={claiming}
                onClick={handleClaim}
                style={{ width: '100%', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}
              >
                <Plus size={18} />
                {claiming ? t('claiming') : t('add')}
              </button>
            ) : (
              <>
                <Link
                  to="/account"
                  className="btn-primary"
                  style={{
                    width: '100%',
                    borderRadius: '20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    textDecoration: 'none',
                  }}
                >
                  <LogIn size={18} /> {t('loginToAdd')}
                </Link>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>{t('loginHint')}</p>
              </>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '20px', wordBreak: 'break-all' }}>
              {shareUrlFromToken(token)}
            </p>
          </>
        )}
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/library" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('goLibrary')}</Link>
          <Link to="/sets" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('goSets')}</Link>
        </div>
      </div>
    </div>
  );
}
