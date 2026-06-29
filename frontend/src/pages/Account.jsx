import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../store/usePlayerStore';
import { apiFetch, parseJsonSafe, messageForApiError } from '../utils/apiClient';
import {
  loginWithPassword,
  registerUser,
  userDataFromLogin,
  persistEffectivePlan,
  persistUserProfile,
  getStoredUserProfile,
  signOut,
  getAccessToken,
} from '../utils/authSession';
import { persistAccessToken, clearAccessToken } from '../utils/tokenStorage';
import { getLegal } from '../content/legalContent';
import { isQualityAllowedForPlan, clampQualityToPlan } from '../utils/qualityPrefs';
import { dispatchDjPrefsChanged } from '../utils/djPrefs';
import { pauseBackgroundRequests, resumeBackgroundRequests } from '../utils/authBusy';
import { primeMediaToken } from '../utils/mediaToken';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Shield,
  Activity,
  History,
  LogIn,
  Globe,
  Sparkles,
  Disc3,
  HardDrive,
  Palette,
} from 'lucide-react';
import UpgradeModal from '../components/UpgradeModal';
import DownloadHistory from '../components/account/DownloadHistory';
import ThemeList from '../components/account/ThemeList';
import PromoCodeBlock from '../components/upgrade/PromoCodeBlock';
import { planDisplayName } from '../constants/plans';
import { PROFILE_EMOJIS } from '../utils/profileAvatars';
import { peekPendingShareToken } from '../utils/shareApi';
import { getOfflineCacheStats, clearOfflineCache, OFFLINE_CACHE_UPDATED } from '../utils/cache';
import { showToast } from '../utils/toast';

const dict = {
  en: {
    account: 'Your',
    accountBold: 'Account',
    accountDesc: 'Manage your subscription, downloads, and preferences.',
    downloads: 'Downloads Today',
    nextBilling: 'Next Billing Date',
    upgrade: 'Upgrade Plan',
    logout: 'Log out',
    welcome: 'Welcome!',
    loginDesc: 'Log in to access high-res downloads, create playlists, and save your preferences.',
    loginEm: 'Continue with Email',
    forgotPassword: 'Forgot password?',
    loginId: 'Username or email',
    loginIdRegister: 'Username',
    defAudio: 'Playback Quality',
    defAudioAuto: 'Automatic',
    defAudioAutoDesc: 'Best quality for each track within your plan',
    defAudioManual: 'Fixed quality',
    defAudioManualDesc: 'Always use the selected tier (downgrades per track if needed)',
    dlHistory: 'Download History',
    dlDesc: 'View your previously requested tracks',
    bgVis: 'Background Visualizer',
    bgDesc: 'Classic EQ bars reacting to music',
    appearance: 'Appearance',
    appDesc: 'Choose your visual aesthetic',
    langTitle: 'Language',
    langDesc: 'Choose your interface language',
    volNorm: 'Volume Normalization',
    volDesc: 'Auto Gain Control (keeps all tracks at same loudness)',
    planStatus: 'Status',
    noBilling: '—',
    djAnalysis: 'BPM & key analysis',
    djAnalysisDesc: 'Background track analysis and DJ filters in your library (Pro plan)',
    djPlanRequired: 'Available on Pro and Lifetime plans',
    offlineCache: 'Offline cache',
    offlineCacheDesc: 'Tracks saved on this device for playback without network',
    offlineCacheEmpty: 'No cached tracks',
    offlineCacheClear: 'Clear cache',
    offlineCacheCleared: 'Offline cache cleared',
    acceptTerms: 'I accept the Terms of Use and Privacy Policy',
    verifyBanner: 'Please verify your email — check your inbox.',
    verifySpamHint: 'If you do not see it, check Spam — mail from a new domain often lands there first.',
    resendVerify: 'Resend verification email',
  },
  ru: {
    account: 'Ваш',
    accountBold: 'Профиль',
    accountDesc: 'Управляйте подпиской, загрузками и настройками.',
    downloads: 'Скачано сегодня',
    nextBilling: 'Следующее списание',
    upgrade: 'Улучшить план',
    logout: 'Выйти',
    welcome: 'Добро пожаловать!',
    loginDesc: 'Войдите, чтобы скачивать в высоком качестве, создавать плейлисты и сохранять настройки.',
    loginEm: 'Продолжить по Email',
    forgotPassword: 'Забыли пароль?',
    loginId: 'Логин или email',
    loginIdRegister: 'Имя пользователя',
    defAudio: 'Качество воспроизведения',
    defAudioAuto: 'Автоматически',
    defAudioAutoDesc: 'Максимум для каждого трека в рамках вашего тарифа',
    defAudioManual: 'Фиксированное качество',
    defAudioManualDesc: 'Всегда выбранный уровень (при необходимости понизится для трека)',
    dlHistory: 'История скачиваний',
    dlDesc: 'Посмотреть ранее скачанные треки',
    bgVis: 'Визуализатор',
    bgDesc: 'Классический EQ, реагирующий на музыку',
    appearance: 'Оформление',
    appDesc: 'Выберите визуальный стиль',
    langTitle: 'Язык',
    langDesc: 'Выберите язык интерфейса',
    volNorm: 'Нормализация громкости',
    volDesc: 'Автоматически выравнивает громкость всех треков (Auto Gain Control)',
    planStatus: 'Статус',
    noBilling: '—',
    djAnalysis: 'Анализ BPM и тональности',
    djAnalysisDesc: 'Фоновый анализ треков и DJ-фильтры в медиатеке (тариф Про)',
    djPlanRequired: 'Доступно на тарифах Про и Навсегда',
    offlineCache: 'Офлайн-кэш',
    offlineCacheDesc: 'Треки на этом устройстве для прослушивания без сети',
    offlineCacheEmpty: 'Нет кэшированных треков',
    offlineCacheClear: 'Очистить кэш',
    offlineCacheCleared: 'Офлайн-кэш очищен',
    acceptTerms: 'Я принимаю Условия и Политику конфиденциальности',
    verifyBanner: 'Подтвердите email — проверьте почту.',
    verifySpamHint: 'Если письма нет, загляните в «Спам» — с нового домена письма часто попадают туда.',
    resendVerify: 'Отправить письмо снова',
  },
};

const QUALITY_TIERS = [
  { id: 'HIGH', label: '320k', spec: 'AAC 320 kbps' },
  { id: 'LOSSLESS', label: 'Lossless', spec: 'FLAC (CD on Basic, Hi-Res on Pro)' },
];

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function Account() {
  const navigate = useNavigate();
  const {
    theme,
    setTheme,
    visualizerEnabled,
    setVisualizerEnabled,
    visualSensitivity = 1.0,
    setVisualSensitivity,
    visualSmoothing = 0.5,
    setVisualSmoothing,
    defaultPlaybackQuality,
    setDefaultPlaybackQuality,
    autoPlaybackQuality,
    setAutoPlaybackQuality,
    lang,
    setLang,
    djAnalysisEnabled,
    setDjAnalysisEnabled,
    djFeaturesAvailable,
  } = useOutletContext();


  const t = (key) => dict[lang][key] || key;

  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getAccessToken());
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [downloadHistoryOpen, setDownloadHistoryOpen] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [authError, setAuthError] = useState('');
  // Seed from the cached profile so the real plan/limits show instantly instead
  // of a free-plan placeholder while the slow /api/auth/me request is in flight.
  const [userData, setUserData] = useState(() => (getAccessToken() ? getStoredUserProfile() : null));
  const [authLoading, setAuthLoading] = useState(false);
  const [authSlow, setAuthSlow] = useState(false);
  const [verifyResendMsg, setVerifyResendMsg] = useState('');
  const [offlineCacheStats, setOfflineCacheStats] = useState({ count: 0, bytes: 0, quota: null });
  const [cancelLoading, setCancelLoading] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [avatar, setAvatar] = useState(PROFILE_EMOJIS[0]);
  const authInFlightRef = useRef(false);

  const refreshOfflineCacheStats = async () => {
    setOfflineCacheStats(await getOfflineCacheStats());
  };

  const checkAuth = async () => {
    const token = getAccessToken();
    if (!token) {
      setIsLoggedIn(false);
      return;
    }
    try {
      const res = await apiFetch('/api/auth/me', { auth: true, timeoutMs: 20000, retries: 1 });
      if (res.ok) {
        const data = await parseJsonSafe(res);
        if (data?.effective_plan) persistEffectivePlan(data.effective_plan);
        persistUserProfile(data);
        setUserData(data);
        setDjAnalysisEnabled?.(!!data?.dj_enabled);
        setIsLoggedIn(true);
      } else if (res.status === 401) {
        setIsLoggedIn(false);
        setUserData(null);
        clearAccessToken();
        localStorage.removeItem('tidal-user');
        persistUserProfile(null);
      } else {
        setUserData(null);
        setIsLoggedIn(false);
      }
    } catch {
      setIsLoggedIn(!!token);
      setUserData(null);
    }
  };

  useEffect(() => {
    if (!getAccessToken()) {
      setIsLoggedIn(false);
      return;
    }
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return undefined;
    refreshOfflineCacheStats();
    const onUpdate = () => { void refreshOfflineCacheStats(); };
    window.addEventListener(OFFLINE_CACHE_UPDATED, onUpdate);
    return () => window.removeEventListener(OFFLINE_CACHE_UPDATED, onUpdate);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!userData?.effective_plan) return;
    const capped = clampQualityToPlan(defaultPlaybackQuality, userData.effective_plan);
    if (capped !== defaultPlaybackQuality) setDefaultPlaybackQuality(capped);
  }, [userData?.effective_plan, defaultPlaybackQuality, setDefaultPlaybackQuality]);

  const handleCancelSubscription = async () => {
    if (cancelLoading) return;
    setCancelLoading(true);
    try {
      await apiFetch('/api/subscription/cancel', { method: 'POST', auth: true, lang });
      await checkAuth();
    } catch (err) {
      setAuthError(messageForApiError(err, lang));
    } finally {
      setCancelLoading(false);
    }
  };

  const handleRedeemActivation = async () => {
    const code = activationCode.trim();
    if (!code) return;
    if (!isLoggedIn) {
      setAuthError(lang === 'ru' ? 'Сначала войдите в аккаунт' : 'Log in first to activate a code');
      return;
    }
    setRedeeming(true);
    try {
      const res = await apiFetch('/api/activation/redeem', {
        method: 'POST',
        auth: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        lang,
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        showToast(data.detail || (lang === 'ru' ? 'Неверный код' : 'Invalid code'));
        return;
      }
      showToast(data.message || (lang === 'ru' ? 'Тариф активирован!' : 'Plan activated!'));
      setActivationCode('');
      await checkAuth();
    } catch (err) {
      showToast(messageForApiError(err, lang));
    } finally {
      setRedeeming(false);
    }
  };

  const handleAuth = async () => {
    if (authInFlightRef.current) return;
    setAuthError('');
    if (!loginId || !password || (isRegistering && !email)) {
      setAuthError(lang === 'ru' ? 'Заполните все поля' : 'Please fill in all fields');
      return;
    }
    if (isRegistering && !acceptTerms) {
      setAuthError(lang === 'ru' ? 'Примите условия использования' : 'Please accept the Terms and Privacy Policy');
      return;
    }

    authInFlightRef.current = true;
    sessionStorage.setItem('tidal-login-start-ms', String(Date.now()));
    setAuthLoading(true);
    setAuthSlow(false);
    const slowTimer = setTimeout(() => setAuthSlow(true), 4000);
    pauseBackgroundRequests();
    try {
      if (isRegistering) {
        await registerUser({ email, username: loginId, password, acceptTerms });
      }
      const data = await loginWithPassword(loginId, password);
      persistAccessToken(data.access_token);
      localStorage.setItem('tidal-user', data.username || loginId);
      const profile = userDataFromLogin(data, loginId);
      setUserData(profile);
      setDjAnalysisEnabled?.(!!profile?.dj_enabled);
      setIsLoggedIn(true);
      await primeMediaToken();
      window.dispatchEvent(new CustomEvent('tidal-auth-login'));
      checkAuth().catch(() => {});

      const pendingCode = activationCode.trim();
      if (pendingCode) {
        try {
          const res = await apiFetch('/api/activation/redeem', {
            method: 'POST',
            auth: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: pendingCode }),
            lang,
          });
          const redeemData = await parseJsonSafe(res);
          if (res.ok) {
            showToast(redeemData.message || (lang === 'ru' ? 'Тариф активирован!' : 'Plan activated!'));
            setActivationCode('');
            await checkAuth();
          } else {
            showToast(redeemData.detail || (lang === 'ru' ? 'Неверный код' : 'Invalid code'));
          }
        } catch (err) {
          showToast(messageForApiError(err, lang));
        }
      }

      const shareToken = peekPendingShareToken();
      if (shareToken) {
        window.location.assign(`/s/${encodeURIComponent(shareToken)}`);
        return;
      }
    } catch (err) {
      setAuthError(messageForApiError(err, lang));
    } finally {
      clearTimeout(slowTimer);
      setAuthSlow(false);
      resumeBackgroundRequests();
      authInFlightRef.current = false;
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setIsLoggedIn(false);
    setUserData(null);
    window.dispatchEvent(new CustomEvent('tidal-auth-expired', { detail: { silent: true } }));
  };

  const handleResendVerification = async () => {
    setVerifyResendMsg('');
    try {
      const res = await apiFetch('/api/auth/resend-verification', { method: 'POST', auth: true });
      const data = await parseJsonSafe(res);
      setVerifyResendMsg(data.message || t('resendVerify'));
    } catch (err) {
      setVerifyResendMsg(messageForApiError(err, lang));
    }
  };

  const handleDjToggle = async () => {
    if (!djFeaturesAvailable) {
      setIsUpgradeOpen(true);
      return;
    }
    const next = !djAnalysisEnabled;
    try {
      const res = await apiFetch('/api/auth/me/preferences', {
        method: 'PATCH',
        auth: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dj_enabled: next }),
      });
      if (res.ok) {
        const data = await parseJsonSafe(res);
        setDjAnalysisEnabled(!!data.dj_enabled);
        setUserData((prev) => (prev ? { ...prev, dj_enabled: data.dj_enabled } : prev));
        if (data.dj_enabled) dispatchDjPrefsChanged();
      } else if (res.status === 403) {
        setAuthError(t('djPlanRequired'));
        setIsUpgradeOpen(true);
      }
    } catch {
      setAuthError(lang === 'ru' ? 'Не удалось сохранить настройку' : 'Could not save preference');
    }
  };

  const cycleAvatar = () => {
    setAvatar(PROFILE_EMOJIS[(PROFILE_EMOJIS.indexOf(avatar) + 1) % PROFILE_EMOJIS.length]);
  };

  const expiryWarning = (() => {
    if (!userData?.subscription_expires_at) return null;
    if (userData.effective_plan === 'lifetime' || userData.effective_plan === 'free') return null;
    const days = Math.ceil((new Date(userData.subscription_expires_at) - Date.now()) / 864e5);
    if (days > 7) return null;
    return lang === 'ru'
      ? `Подписка истекает через ${days} дн. — продлите в разделе тарифов.`
      : `Subscription expires in ${days} day(s) — renew from Upgrade.`;
  })();

  const plan = userData?.effective_plan || 'free';

  return (
    <div style={{ paddingBottom: '40px' }}>
      <DownloadHistory
        open={downloadHistoryOpen}
        onClose={() => setDownloadHistoryOpen(false)}
        lang={lang}
        isLoggedIn={isLoggedIn}
      />

      <AnimatePresence>
        {isUpgradeOpen && (
          <UpgradeModal
            onClose={() => setIsUpgradeOpen(false)}
            lang={lang}
            onPlanUpdated={checkAuth}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{ marginBottom: '40px' }}
      >
        <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>
          {t('account')}{' '}
          <span className="text-gradient">{t('accountBold')}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>{t('accountDesc')}</p>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '1000px' }}>
        {/* LEFT COLUMN */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          {/* Profile / Auth */}
          <div
            className="glass-panel"
            style={{ padding: '32px', borderRadius: '24px', position: 'relative', overflow: 'hidden' }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-50px',
                right: '-50px',
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
                opacity: 0.3,
              }}
            />

            {isLoggedIn ? (
              <>
                {userData && userData.email_verified === false && (
                  <div
                    style={{
                      marginBottom: '16px',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      background: 'rgba(255, 193, 7, 0.12)',
                      border: '1px solid rgba(255, 193, 7, 0.35)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <div>{t('verifyBanner')}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {t('verifySpamHint')}
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: '8px' }}
                      onClick={handleResendVerification}
                    >
                      {t('resendVerify')}
                    </button>
                    {verifyResendMsg && (
                      <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{verifyResendMsg}</div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
                  <div
                    onClick={cycleAvatar}
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      background: 'var(--bg-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid var(--accent-solid)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    title="Change avatar"
                  >
                    <span style={{ fontSize: '2.5rem' }}>{avatar}</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>
                      {userData?.username || localStorage.getItem('tidal-user') || 'User'}
                    </h2>
                    <div
                      style={{
                        color: 'var(--accent-solid)',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textTransform: 'uppercase',
                      }}
                    >
                      <Shield size={16} />
                      {planDisplayName(userData?.effective_plan, lang)}{' '}
                      {lang === 'ru' ? 'тариф' : 'Plan'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{t('downloads')}</span>
                      <span style={{ fontWeight: 600 }}>
                        {userData?.downloads_today ?? 0}
                        <span style={{ color: 'var(--text-muted)' }}>
                          {' '}/ {userData?.daily_limit ?? 3}
                        </span>
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={userData?.downloads_today ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={userData?.daily_limit ?? 3}
                      style={{
                        height: '8px',
                        borderRadius: '999px',
                        background: 'var(--bg-main)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, ((userData?.downloads_today ?? 0) / Math.max(1, userData?.daily_limit ?? 3)) * 100)}%`,
                          background: 'var(--accent-solid)',
                          borderRadius: '999px',
                          transition: 'width 0.2s ease',
                        }}
                      />
                    </div>
                  </div>

                  {expiryWarning && (
                    <div className="account-expiry-warn" role="status">
                      {expiryWarning}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingBottom: '16px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>{t('nextBilling')}</span>
                    <span style={{ fontWeight: 600 }}>
                      {userData?.effective_plan === 'lifetime'
                        ? (lang === 'ru' ? 'Навсегда' : 'Lifetime')
                        : userData?.subscription_expires_at
                          ? new Date(userData.subscription_expires_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
                          : t('noBilling')}
                    </span>
                  </div>
                </div>

                <div className="account-profile-actions">
                  <button type="button" className="btn-primary" onClick={() => setIsUpgradeOpen(true)}>
                    {userData?.subscription_cancel_at_period_end
                      ? (lang === 'ru' ? 'Продлить' : 'Renew')
                      : t('upgrade')}
                  </button>
                  {userData?.effective_plan !== 'free'
                    && userData?.effective_plan !== 'lifetime'
                    && !userData?.subscription_cancel_at_period_end && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={cancelLoading}
                      onClick={handleCancelSubscription}
                    >
                      {lang === 'ru' ? 'Отменить автопродление' : 'Cancel auto-renew'}
                    </button>
                  )}
                  <button type="button" className="btn-secondary" onClick={handleLogout}>
                    {t('logout')}
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  justifyContent: 'center',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '16px',
                  padding: '20px 0',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(37, 117, 252, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-solid)',
                    marginBottom: '8px',
                  }}
                >
                  <LogIn size={32} />
                </div>
                <h2 style={{ margin: 0 }}>{isRegistering ? 'Create Account' : t('welcome')}</h2>

                {authError && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{authError}</div>
                )}

                <form
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    marginTop: '8px',
                  }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!authLoading) handleAuth();
                  }}
                >
                  {isRegistering && (
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '12px',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-subtle)',
                        color: 'white',
                      }}
                    />
                  )}
                  <input
                    type="text"
                    placeholder={t(isRegistering ? 'loginIdRegister' : 'loginId')}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    autoComplete="username"
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '12px',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-subtle)',
                      color: 'white',
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '12px',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-subtle)',
                      color: 'white',
                    }}
                  />
                  {isRegistering && (
                    <label
                      style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <span>
                        {getLegal(lang, 'acceptLabel')}{' '}
                        (
                        <a href="/terms" style={{ color: 'var(--accent-solid)' }}>
                          {lang === 'ru' ? 'Условия' : 'Terms'}
                        </a>
                        {' · '}
                        <a href="/privacy" style={{ color: 'var(--accent-solid)' }}>
                          {lang === 'ru' ? 'Конфиденциальность' : 'Privacy'}
                        </a>
                        )
                      </span>
                    </label>
                  )}
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={authLoading}
                    style={{
                      width: '100%',
                      padding: '12px',
                      marginTop: '8px',
                      opacity: authLoading ? 0.7 : 1,
                    }}
                  >
                    {authLoading
                      ? (authSlow
                        ? (lang === 'ru' ? 'Подключение к серверу…' : 'Connecting to server…')
                        : (lang === 'ru' ? 'Подождите…' : 'Please wait…'))
                      : (isRegistering
                        ? (lang === 'ru' ? 'Регистрация' : 'Sign Up')
                        : (lang === 'ru' ? 'Войти' : 'Log In'))}
                  </button>
                </form>

                {!isRegistering && (
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={() => navigate('/forgot-password')}
                  >
                    {t('forgotPassword')}
                  </button>
                )}

                <div
                  onClick={() => setIsRegistering(!isRegistering)}
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    marginTop: '8px',
                  }}
                >
                  {isRegistering
                    ? 'Already have an account? Log In'
                    : "Don't have an account? Sign Up"}
                </div>

                <PromoCodeBlock
                  lang={lang}
                  activationCode={activationCode}
                  setActivationCode={setActivationCode}
                  onRedeem={handleRedeemActivation}
                  redeeming={redeeming}
                  redeemAfterLogin
                  compact
                />
              </div>
            )}
          </div>

          {/* Playback Quality */}
          <div className="glass-panel settings-panel">
            <div className="settings-panel__header">
              <div
                className="settings-panel__icon"
                style={{ background: 'rgba(37, 117, 252, 0.12)', color: 'var(--accent-solid)' }}
              >
                <Settings size={24} />
              </div>
              <div>
                <h3 className="settings-panel__title">{t('defAudio')}</h3>
                <p className="settings-panel__desc">
                  {t(autoPlaybackQuality ? 'defAudioAutoDesc' : 'defAudioManualDesc')}
                </p>
              </div>
            </div>

            <div
              className={`quality-auto-card${autoPlaybackQuality ? ' quality-auto-card--active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setAutoPlaybackQuality(!autoPlaybackQuality)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setAutoPlaybackQuality(!autoPlaybackQuality);
              }}
            >
              <div className="quality-auto-card__main">
                <div className="quality-auto-card__badge">
                  <Sparkles size={20} />
                </div>
                <div>
                  <div className="quality-auto-card__label">{t('defAudioAuto')}</div>
                  <div className="quality-auto-card__hint">{t('defAudioAutoDesc')}</div>
                </div>
              </div>
              <button
                type="button"
                className="settings-toggle"
                aria-pressed={autoPlaybackQuality}
                style={{ background: autoPlaybackQuality ? 'var(--accent-solid)' : 'var(--bg-surface-hover)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setAutoPlaybackQuality(!autoPlaybackQuality);
                }}
              >
                <div
                  className="settings-toggle__knob"
                  style={{ left: autoPlaybackQuality ? '24px' : '4px' }}
                />
              </button>
            </div>

            {!autoPlaybackQuality && (
              <>
                <div className="quality-manual-label">{t('defAudioManual')}</div>
                <div className="quality-tier-grid">
                  {QUALITY_TIERS.map((q) => {
                    const allowed = isQualityAllowedForPlan(q.id, plan);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        className={`quality-tier-card${defaultPlaybackQuality === q.id ? ' quality-tier-card--active' : ''}${allowed ? '' : ' quality-tier-card--disabled'}`}
                        disabled={!allowed}
                        onClick={() => {
                          if (!allowed) {
                            setAuthError(
                              lang === 'ru'
                                ? 'Это качество доступно на платном тарифе'
                                : 'This quality requires a paid plan',
                            );
                            return;
                          }
                          setAuthError('');
                          setDefaultPlaybackQuality(q.id);
                        }}
                      >
                        <span className="quality-tier-card__name">{q.label}</span>
                        <span className="quality-tier-card__spec">{q.spec}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Download History */}
          <div
            className="glass-panel account-card--clickable"
            role="button"
            tabIndex={0}
            onClick={() => isLoggedIn && setDownloadHistoryOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isLoggedIn) setDownloadHistoryOpen(true);
            }}
            style={{ opacity: isLoggedIn ? 1 : 0.5, cursor: isLoggedIn ? 'pointer' : 'not-allowed' }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(255, 179, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--warning)',
              }}
            >
              <History size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('dlHistory')}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('dlDesc')}</p>
            </div>
          </div>
        </motion.div>

        {/* RIGHT COLUMN */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          {/* DJ Analysis */}
          <div
            className="glass-panel"
            style={{
              padding: '24px',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: isLoggedIn && djFeaturesAvailable ? 1 : 0.55,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(156, 39, 176, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ce93d8',
                }}
              >
                <Disc3 size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('djAnalysis')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {djFeaturesAvailable ? t('djAnalysisDesc') : t('djPlanRequired')}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={!isLoggedIn || !djFeaturesAvailable}
              onClick={handleDjToggle}
              style={{
                width: '48px',
                height: '28px',
                borderRadius: '14px',
                background: djAnalysisEnabled && djFeaturesAvailable ? 'var(--accent-solid)' : 'var(--bg-surface-hover)',
                border: 'none',
                cursor: isLoggedIn && djFeaturesAvailable ? 'pointer' : 'not-allowed',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: 'var(--control-knob)',
                  position: 'absolute',
                  top: '4px',
                  left: djAnalysisEnabled && djFeaturesAvailable ? '24px' : '4px',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
          {/* Background Visualizer */}
          <div className="glass-panel settings-panel" style={{ flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="settings-panel__header" style={{ marginBottom: 0 }}>
                <div
                  className="settings-panel__icon"
                  style={{
                    background: 'rgba(37, 117, 252, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-solid)',
                  }}
                >
                  <Activity size={24} />
                </div>
                <div>
                  <h3 className="settings-panel__title">{t('bgVis')}</h3>
                  <p className="settings-panel__desc">{t('bgDesc')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVisualizerEnabled(!visualizerEnabled)}
                className={`settings-pill-btn${visualizerEnabled ? ' settings-pill-btn--on' : ' settings-pill-btn--off'}`}
                style={{ flexShrink: 0 }}
              >
                {visualizerEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {visualizerEnabled && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '8px', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                      {lang === 'ru' ? 'Чувствительность к биту' : 'Beat Sensitivity'}
                    </label>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{visualSensitivity.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.1"
                    value={visualSensitivity}
                    onChange={(e) => setVisualSensitivity(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-solid)' }}
                  />
                  <p style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {lang === 'ru' ? 'Выше = анимации дергаются сильнее даже на тихих треках.' : 'Higher = more reactive animations even on quiet tracks.'}
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                      {lang === 'ru' ? 'Сглаживание (Плавность)' : 'Animation Smoothing'}
                    </label>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{Math.round(visualSmoothing * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.95"
                    step="0.05"
                    value={visualSmoothing}
                    onChange={(e) => setVisualSmoothing(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-solid)' }}
                  />
                  <p style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {lang === 'ru' ? 'Меньше = резкие скачки. Больше = плавные, как желе, переходы.' : 'Lower = sharp jumps. Higher = fluid jelly-like motion.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Appearance */}
          <div className="glass-panel settings-panel settings-panel--appearance">
            <div className="settings-panel__header">
              <div
                className="settings-panel__icon"
                style={{ background: 'rgba(156, 39, 176, 0.12)', color: '#ce93d8' }}
              >
                <Palette size={24} />
              </div>
              <div>
                <h3 className="settings-panel__title">{t('appearance')}</h3>
                <p className="settings-panel__desc">{t('appDesc')}</p>
              </div>
            </div>
            <ThemeList theme={theme} setTheme={setTheme} lang={lang} />
          </div>

          {/* Offline cache */}
          {isLoggedIn && (
            <div
              className="glass-panel"
              style={{
                padding: '24px',
                borderRadius: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(33, 150, 243, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#42a5f5',
                  }}
                >
                  <HardDrive size={24} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('offlineCache')}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('offlineCacheDesc')}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
                    {offlineCacheStats.count > 0
                      ? `${offlineCacheStats.count} · ${formatBytes(offlineCacheStats.bytes)}${offlineCacheStats.quota ? ` / ${formatBytes(offlineCacheStats.quota)}` : ''}`
                      : t('offlineCacheEmpty')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={offlineCacheStats.count === 0}
                onClick={async () => {
                  await clearOfflineCache();
                  await refreshOfflineCacheStats();
                  showToast(t('offlineCacheCleared'));
                }}
              >
                {t('offlineCacheClear')}
              </button>
            </div>
          )}

          {/* Language */}
          <div
            className="glass-panel"
            style={{
              padding: '24px',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(0, 200, 83, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#00c853',
                }}
              >
                <Globe size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('langTitle')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('langDesc')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', background: 'var(--bg-surface-hover)', borderRadius: '12px', padding: '4px' }}>
              <button
                type="button"
                onClick={() => setLang('en')}
                style={{
                  background: lang === 'en' ? 'var(--accent-solid)' : 'transparent',
                  color: lang === 'en' ? 'var(--on-accent)' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: 600,
                }}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('ru')}
                style={{
                  background: lang === 'ru' ? 'var(--accent-solid)' : 'transparent',
                  color: lang === 'ru' ? 'var(--on-accent)' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: 600,
                }}
              >
                RU
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
