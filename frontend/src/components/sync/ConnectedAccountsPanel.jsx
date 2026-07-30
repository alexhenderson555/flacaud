import { useState, useEffect, useCallback, useRef } from 'react';
import { Link2, Loader2, X, Music, ListMusic } from 'lucide-react';
import { showToast } from '../../utils/toast';
import { hasAuthSession } from '../../utils/hasAuthSession';
import {
  getConnectedAccounts,
  authorizeAccount,
  pollDeviceAuth,
  submitAccountToken,
  disconnectAccount,
  getAccountPlaylists,
  importFromAccount,
} from '../../utils/transferApi';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Connect an external music account (Spotify, YouTube Music, …) and import its
 * private playlists / Liked Songs. Self-contained: talks to /api/connected-accounts.
 * Dormant providers (creds not configured on the server) are shown disabled.
 */
export default function ConnectedAccountsPanel({ lang = 'en' }) {
  const t = (en, ru) => (lang === 'ru' ? ru : en);
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState('');          // provider currently connecting
  const [device, setDevice] = useState(null);    // { provider, user_code, verification_url }
  const [picker, setPicker] = useState(null);    // { provider, name, playlists }
  const [tokenPrompt, setTokenPrompt] = useState(null); // { provider, note, value, saving }
  const [importingId, setImportingId] = useState('');
  const pollSession = useRef(0);
  const authed = hasAuthSession();

  const refresh = useCallback(async () => {
    if (!authed) return;
    try {
      setAccounts(await getConnectedAccounts(lang));
    } catch { /* not logged in / offline */ }
  }, [authed, lang]);

  useEffect(() => { refresh(); }, [refresh]);

  // Handle the redirect-flow return (?connected= / ?connect_error=).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ok = p.get('connected');
    const err = p.get('connect_error');
    if (!ok && !err) return;
    showToast(ok ? t(`Connected ${ok}`, `${ok} подключён`) : t(`Could not connect ${err}`, `Не удалось подключить ${err}`));
    p.delete('connected');
    p.delete('connect_error');
    const qs = p.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    if (ok) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDevicePoll = async (provider, deviceCode, interval, expiresIn) => {
    const session = ++pollSession.current;
    const deadline = Date.now() + (expiresIn || 600) * 1000;
    while (Date.now() < deadline && pollSession.current === session) {
      await sleep((interval || 5) * 1000);
      if (pollSession.current !== session) return;
      let r;
      try { r = await pollDeviceAuth(provider, deviceCode, lang); } catch { r = null; }
      if (r?.status === 'connected') {
        setDevice(null);
        showToast(t('Account connected', 'Аккаунт подключён'));
        refresh();
        return;
      }
    }
    if (pollSession.current === session) {
      setDevice(null);
      showToast(t('Authorization timed out', 'Время авторизации истекло'));
    }
  };

  // Popup instead of a same-tab redirect -- leaving the app entirely to go
  // authorize on Spotify/etc and having to navigate all the way back was the
  // clunky part. Poll the popup rather than window.open's onload (which never
  // fires across the cross-origin hop) -- once it redirects back to our own
  // /sync?connected=... callback it's same-origin again and readable.
  const runRedirectPopup = (provider, authorizationUrl) => {
    const popup = window.open(authorizationUrl, 'connect-account', 'width=520,height=680');
    if (!popup) {
      // Popup blocked -- fall back to the old same-tab flow rather than stall.
      window.location.href = authorizationUrl;
      return;
    }
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setBusy('');
        return;
      }
      let search = null;
      try {
        if (popup.location.origin === window.location.origin) {
          search = popup.location.search;
        }
      } catch {
        return; // Still cross-origin on the provider's own domain.
      }
      if (search === null) return;
      const p = new URLSearchParams(search);
      const ok = p.get('connected');
      const err = p.get('connect_error');
      if (!ok && !err) return;
      clearInterval(timer);
      popup.close();
      setBusy('');
      showToast(ok ? t(`Connected ${ok}`, `${ok} подключён`) : t(`Could not connect ${err}`, `Не удалось подключить ${err}`));
      if (ok) refresh();
    }, 500);
  };

  const connect = async (provider) => {
    setBusy(provider);
    try {
      const res = await authorizeAccount(provider, lang);
      if (res.flow === 'redirect' && res.authorization_url) {
        runRedirectPopup(provider, res.authorization_url);
        return;
      }
      if (res.flow === 'device') {
        setDevice({ provider, user_code: res.user_code, verification_url: res.verification_url });
        runDevicePoll(provider, res.device_code, res.interval, res.expires_in);
        return;
      }
      if (res.flow === 'token') {
        setTokenPrompt({ provider, note: res.note || '', value: '', saving: false });
        return;
      }
      showToast(res.note || t('Follow the instructions to connect', 'Следуйте инструкциям для подключения'));
    } catch (e) {
      showToast(e?.message || t('Could not start authorization', 'Не удалось начать авторизацию'));
    } finally {
      setBusy('');
    }
  };

  const submitToken = async () => {
    if (!tokenPrompt || !tokenPrompt.value.trim()) return;
    const { provider, value } = tokenPrompt;
    setTokenPrompt((p) => ({ ...p, saving: true }));
    try {
      await submitAccountToken(provider, value.trim(), lang);
      setTokenPrompt(null);
      showToast(t('Account connected', 'Аккаунт подключён'));
      refresh();
    } catch (e) {
      showToast(e?.message || t('Could not link account', 'Не удалось подключить аккаунт'));
      setTokenPrompt((p) => (p ? { ...p, saving: false } : p));
    }
  };

  const disconnect = async (provider) => {
    try {
      await disconnectAccount(provider, lang);
      showToast(t('Disconnected', 'Отключено'));
      refresh();
    } catch (e) {
      showToast(e?.message || t('Could not disconnect', 'Не удалось отключить'));
    }
  };

  const openPicker = async (acc) => {
    setPicker({ provider: acc.provider, name: acc.display_name, playlists: null });
    try {
      const playlists = await getAccountPlaylists(acc.provider, lang);
      setPicker({ provider: acc.provider, name: acc.display_name, playlists });
    } catch (e) {
      showToast(e?.message || t('Could not read playlists', 'Не удалось прочитать плейлисты'));
      setPicker(null);
    }
  };

  const runImport = async (provider, pl) => {
    setImportingId(pl.id);
    try {
      const res = await importFromAccount(
        provider,
        { playlistId: pl.id, addToLibrary: true, createPlaylist: true, playlistName: pl.liked ? null : pl.name },
        lang,
      );
      const added = res?.added_to_library ?? 0;
      const total = res?.total_tracks ?? 0;
      showToast(t(`Imported ${total} tracks (${added} new)`, `Импортировано ${total} треков (${added} новых)`));
      setPicker(null);
    } catch (e) {
      showToast(e?.message || t('Import failed', 'Ошибка импорта'));
    } finally {
      setImportingId('');
    }
  };

  if (!authed) return null;
  // Show connectors that are configured OR already connected (dormant ones stay hidden
  // until the server has their credentials).
  const visible = accounts.filter((a) => a.configured || a.connected);
  if (!visible.length) return null;

  return (
    <section className="connected-accounts glass-panel">
      <div className="connected-accounts__head">
        <Link2 size={18} aria-hidden />
        <h2 className="connected-accounts__title">{t('Connect an account', 'Подключить аккаунт')}</h2>
      </div>
      <p className="connected-accounts__sub">
        {t('Import your private playlists and Liked Songs directly — no link needed.',
          'Импортируйте свои приватные плейлисты и лайки напрямую — ссылка не нужна.')}
      </p>

      <div className="connected-accounts__grid">
        {visible.map((a) => (
          <div key={a.provider} className="connected-account-row">
            <span className="connected-account-row__name">
              {a.display_name}
              {a.unofficial ? (
                <span className="connected-account-row__tag" title={t('Unofficial — may break', 'Неофициально — может сломаться')}>
                  {t('unofficial', 'неоф.')}
                </span>
              ) : null}
            </span>
            <div className="connected-account-row__actions">
              {a.connected ? (
                <>
                  <button type="button" className="btn-primary connected-account-row__btn" onClick={() => openPicker(a)}>
                    <ListMusic size={15} /> {t('Pick playlists', 'Выбрать плейлисты')}
                  </button>
                  <button type="button" className="btn-secondary connected-account-row__btn" onClick={() => disconnect(a.provider)}>
                    {t('Disconnect', 'Отключить')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary connected-account-row__btn"
                  disabled={busy === a.provider}
                  onClick={() => connect(a.provider)}
                >
                  {busy === a.provider ? <Loader2 size={15} className="spinner" /> : <Link2 size={15} />}
                  {' '}{t('Connect', 'Подключить')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {device ? (
        <div
          className="ca-modal"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) { pollSession.current++; setDevice(null); } }}
          onKeyDown={(e) => { if (e.key === 'Escape') { pollSession.current++; setDevice(null); } }}
        >
          <div className="ca-modal__box glass-panel" role="dialog" aria-modal="true">
            <button type="button" className="ca-modal__close" aria-label="Close" onClick={() => { pollSession.current++; setDevice(null); }}>
              <X size={20} />
            </button>
            <h3>{t('Authorize on Google', 'Авторизация в Google')}</h3>
            <p>{t('Open this page and enter the code:', 'Откройте страницу и введите код:')}</p>
            <a href={device.verification_url} target="_blank" rel="noreferrer" className="ca-modal__link">
              {device.verification_url}
            </a>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div 
              className="ca-modal__code" 
              title={t('Click to copy', 'Нажмите, чтобы скопировать')}
              onClick={() => {
                navigator.clipboard.writeText(device.user_code);
                showToast(t('Code copied!', 'Код скопирован!'));
              }}
              style={{ cursor: 'pointer' }}
            >
              {device.user_code}
            </div>
            <p className="ca-modal__waiting"><Loader2 size={14} className="spinner" /> {t('Waiting for authorization…', 'Ожидание авторизации…')}</p>
          </div>
        </div>
      ) : null}

      {picker ? (
        <div
          className="ca-modal"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) setPicker(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setPicker(null); }}
        >
          <div className="ca-modal__box glass-panel" role="dialog" aria-modal="true">
            <button type="button" className="ca-modal__close" aria-label="Close" onClick={() => setPicker(null)}>
              <X size={20} />
            </button>
            <h3>{t('Import from', 'Импорт из')} {picker.name || picker.provider}</h3>
            {picker.playlists === null ? (
              <p className="ca-modal__waiting"><Loader2 size={14} className="spinner" /> {t('Loading playlists…', 'Загрузка плейлистов…')}</p>
            ) : (
              <div className="ca-modal__list">
                {picker.playlists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    className="ca-playlist"
                    disabled={!!importingId}
                    onClick={() => runImport(picker.provider, pl)}
                  >
                    <span className="ca-playlist__icon">{pl.liked ? <Music size={16} /> : <ListMusic size={16} />}</span>
                    <span className="ca-playlist__name">{pl.name}</span>
                    <span className="ca-playlist__meta">
                      {importingId === pl.id
                        ? <Loader2 size={15} className="spinner" />
                        : (pl.count != null ? pl.count : '')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tokenPrompt ? (
        <div
          className="ca-modal"
          role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) setTokenPrompt(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setTokenPrompt(null); }}
        >
          <div className="ca-modal__box glass-panel" role="dialog" aria-modal="true">
            <button type="button" className="ca-modal__close" aria-label="Close" onClick={() => setTokenPrompt(null)}>
              <X size={20} />
            </button>
            <h3>{t('Paste your token', 'Вставьте токен')}</h3>
            {tokenPrompt.note ? <p className="ca-modal__waiting" style={{ color: 'var(--text-secondary)' }}>{tokenPrompt.note}</p> : null}
            <input
              type="text"
              className="ca-token-input"
              autoComplete="off"
              placeholder={t('token…', 'токен…')}
              value={tokenPrompt.value}
              onChange={(e) => setTokenPrompt((p) => ({ ...p, value: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitToken(); }}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={!tokenPrompt.value.trim() || tokenPrompt.saving}
              onClick={submitToken}
              style={{ borderRadius: '20px', padding: '10px 18px' }}
            >
              {tokenPrompt.saving ? <Loader2 size={15} className="spinner" /> : <Link2 size={15} />}
              {' '}{t('Connect', 'Подключить')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
