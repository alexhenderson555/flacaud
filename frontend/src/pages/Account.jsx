import { useState, useEffect } from 'react';
import { apiFetch, parseJsonSafe, messageForApiError } from '../utils/apiClient';
import {
  persistEffectivePlan,
  persistUserProfile,
  getStoredUserProfile,
  signOut,
  getAccessToken,
} from '../utils/authSession';
import { clearAccessToken } from '../utils/tokenStorage';
import { clampQualityToPlan } from '../utils/qualityPrefs';
import { dispatchDjPrefsChanged } from '../utils/djPrefs';
import { getOfflineCacheStats, OFFLINE_CACHE_UPDATED } from '../utils/cache';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette } from 'lucide-react';
import UpgradeModal from '../components/UpgradeModal';
import DownloadHistory from '../components/account/DownloadHistory';
import ThemeList from '../components/account/ThemeList';
import ProfileCard from '../components/account/ProfileCard';
import PlaybackQualityCard from '../components/account/PlaybackQualityCard';
import DownloadHistoryCard from '../components/account/DownloadHistoryCard';
import DjAnalysisCard from '../components/account/DjAnalysisCard';
import VisualizerCard from '../components/account/VisualizerCard';
import OfflineCacheCard from '../components/account/OfflineCacheCard';
import LanguageCard from '../components/account/LanguageCard';
import { PROFILE_EMOJIS } from '../utils/profileAvatars';
import { useOutletContext } from 'react-router-dom';

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
    offlineCacheShow: 'View tracks',
    offlineCacheHide: 'Hide tracks',
    offlineCacheDownload: 'Download',
    offlineCacheRemove: 'Remove',
    offlineCacheRemoved: 'Removed from offline cache',
    offlineCachePlay: 'Play',
    offlineCachePause: 'Pause',
    offlineCachePlayFailed: 'Could not play this cached track',
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
    offlineCacheShow: 'Показать треки',
    offlineCacheHide: 'Скрыть треки',
    offlineCacheDownload: 'Скачать',
    offlineCacheRemove: 'Удалить',
    offlineCacheRemoved: 'Удалено из офлайн-кэша',
    offlineCachePlay: 'Слушать',
    offlineCachePause: 'Пауза',
    offlineCachePlayFailed: 'Не удалось воспроизвести этот трек из кэша',
    acceptTerms: 'Я принимаю Условия и Политику конфиденциальности',
    verifyBanner: 'Подтвердите email — проверьте почту.',
    verifySpamHint: 'Если письма нет, загляните в «Спам» — с нового домена письма часто попадают туда.',
    resendVerify: 'Отправить письмо снова',
  },
};

export default function Account() {
  const {
    theme,
    setTheme,
    visualizerEnabled,
    setVisualizerEnabled,
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
  const [authError, setAuthError] = useState('');
  // Seed from the cached profile so the real plan/limits show instantly instead
  // of a free-plan placeholder while the slow /api/auth/me request is in flight.
  const [userData, setUserData] = useState(() => (getAccessToken() ? getStoredUserProfile() : null));
  const [offlineCacheStats, setOfflineCacheStats] = useState({ count: 0, bytes: 0, quota: null });
  const [cancelLoading, setCancelLoading] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [avatar, setAvatar] = useState(PROFILE_EMOJIS[0]);
  const [isPlanValidated, setIsPlanValidated] = useState(false);

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
        setIsPlanValidated(true);
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
    if (!userData?.effective_plan || !isPlanValidated) return;
    const capped = clampQualityToPlan(defaultPlaybackQuality, userData.effective_plan);
    if (capped !== defaultPlaybackQuality) setDefaultPlaybackQuality(capped);
  }, [userData?.effective_plan, defaultPlaybackQuality, setDefaultPlaybackQuality, isPlanValidated]);

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

  const handleLogout = async () => {
    await signOut();
    setIsLoggedIn(false);
    setUserData(null);
    window.dispatchEvent(new CustomEvent('tidal-auth-expired', { detail: { silent: true } }));
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

  const handleLoginSuccess = (profile) => {
    setUserData(profile);
    setDjAnalysisEnabled?.(!!profile?.dj_enabled);
    setIsLoggedIn(true);
  };

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
          <ProfileCard
            t={t}
            lang={lang}
            isLoggedIn={isLoggedIn}
            userData={userData}
            authError={authError}
            activationCode={activationCode}
            setActivationCode={setActivationCode}
            avatar={avatar}
            onAvatarCycle={cycleAvatar}
            onLogout={handleLogout}
            onCheckAuth={checkAuth}
            onUpgradeOpen={setIsUpgradeOpen}
            onAuthErrorChange={setAuthError}
            onLoginSuccess={handleLoginSuccess}
            cancelLoading={cancelLoading}
            onCancelSubscription={handleCancelSubscription}
          />

          <PlaybackQualityCard
            t={t}
            lang={lang}
            plan={plan}
            autoPlaybackQuality={autoPlaybackQuality}
            setAutoPlaybackQuality={setAutoPlaybackQuality}
            defaultPlaybackQuality={defaultPlaybackQuality}
            setDefaultPlaybackQuality={setDefaultPlaybackQuality}
            setAuthError={setAuthError}
          />

          <DownloadHistoryCard
            t={t}
            isLoggedIn={isLoggedIn}
            onOpen={() => setDownloadHistoryOpen(true)}
          />

          <OfflineCacheCard
            t={t}
            isLoggedIn={isLoggedIn}
            offlineCacheStats={offlineCacheStats}
            onCleared={refreshOfflineCacheStats}
          />

          <LanguageCard t={t} lang={lang} setLang={setLang} />
        </motion.div>

        {/* RIGHT COLUMN */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <DjAnalysisCard
            t={t}
            isLoggedIn={isLoggedIn}
            djFeaturesAvailable={djFeaturesAvailable}
            djAnalysisEnabled={djAnalysisEnabled}
            onToggle={handleDjToggle}
          />

          <VisualizerCard
            t={t}
            lang={lang}
            visualizerEnabled={visualizerEnabled}
            setVisualizerEnabled={setVisualizerEnabled}
          />

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
        </motion.div>
      </div>
    </div>
  );
}
