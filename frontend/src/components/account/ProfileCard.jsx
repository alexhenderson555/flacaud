import { useState, useRef } from 'react';
import { Shield, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  loginWithPassword,
  registerUser,
  userDataFromLogin,
  persistUserProfile,
} from '../../utils/authSession';
import { persistAccessToken } from '../../utils/tokenStorage';
import { getLegal } from '../../content/legalContent';
import { planDisplayName } from '../../constants/plans';
import { peekPendingShareToken } from '../../utils/shareApi';
import {
  apiFetch,
  parseJsonSafe,
  messageForApiError,
} from '../../utils/apiClient';
import {
  pauseBackgroundRequests,
  resumeBackgroundRequests,
} from '../../utils/authBusy';
import { primeMediaToken } from '../../utils/mediaToken';
import { showToast } from '../../utils/toast';
import PromoCodeBlock from '../upgrade/PromoCodeBlock';

/**
 * Profile / auth card — shows the logged-in profile (avatar, plan, downloads,
 * billing, upgrade/cancel/logout) OR the login/register form when logged out.
 * Extracted from Account.jsx.
 */
export default function ProfileCard({
  t,
  lang,
  isLoggedIn,
  userData,
  authError,
  activationCode,
  setActivationCode,
  avatar,
  onAvatarCycle,
  onLogout,
  onCheckAuth,
  onUpgradeOpen,
  onAuthErrorChange,
  onLoginSuccess,
  cancelLoading,
  onCancelSubscription,
}) {
  const navigate = useNavigate();

  const expiryWarning = (() => {
    if (!userData?.subscription_expires_at) return null;
    if (userData.effective_plan === 'lifetime' || userData.effective_plan === 'free') return null;
    const days = Math.ceil((new Date(userData.subscription_expires_at) - Date.now()) / 864e5);
    if (days > 7) return null;
    return lang === 'ru'
      ? `Подписка истекает через ${days} дн. — продлите в разделе тарифов.`
      : `Subscription expires in ${days} day(s) — renew from Upgrade.`;
  })();

  return (
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
        <LoggedInView
          t={t}
          lang={lang}
          userData={userData}
          avatar={avatar}
          onAvatarCycle={onAvatarCycle}
          expiryWarning={expiryWarning}
          onUpgradeOpen={onUpgradeOpen}
          cancelLoading={cancelLoading}
          onCancelSubscription={onCancelSubscription}
          onLogout={onLogout}
        />
      ) : (
        <LoggedOutView
          t={t}
          lang={lang}
          authError={authError}
          activationCode={activationCode}
          setActivationCode={setActivationCode}
          onAuthErrorChange={onAuthErrorChange}
          onLoginSuccess={onLoginSuccess}
          onCheckAuth={onCheckAuth}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function LoggedInView({
  t, lang, userData, avatar, onAvatarCycle, expiryWarning,
  onUpgradeOpen, cancelLoading, onCancelSubscription, onLogout,
}) {
  return (
    <>
      {userData && userData.email_verified === false && (
        <VerifyBanner t={t} lang={lang} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={onAvatarCycle}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onAvatarCycle(); }}
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
        <DownloadsMeter t={t} userData={userData} />

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
        <button type="button" className="btn-primary" onClick={() => onUpgradeOpen(true)}>
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
            onClick={onCancelSubscription}
          >
            {lang === 'ru' ? 'Отменить автопродление' : 'Cancel auto-renew'}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onLogout}>
          {t('logout')}
        </button>
      </div>
    </>
  );
}

function DownloadsMeter({ t, userData }) {
  return (
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
  );
}

function VerifyBanner({ t, lang }) {
  const [verifyResendMsg, setVerifyResendMsg] = useState('');
  const handleResend = async () => {
    setVerifyResendMsg('');
    try {
      const res = await apiFetch('/api/auth/resend-verification', { method: 'POST', auth: true });
      const data = await parseJsonSafe(res);
      setVerifyResendMsg(data.message || t('resendVerify'));
    } catch (err) {
      setVerifyResendMsg(messageForApiError(err, lang));
    }
  };
  return (
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
        onClick={handleResend}
      >
        {t('resendVerify')}
      </button>
      {verifyResendMsg && (
        <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{verifyResendMsg}</div>
      )}
    </div>
  );
}

function LoggedOutView({
  t, lang, authError,
  activationCode, setActivationCode,
  onAuthErrorChange, onLoginSuccess, onCheckAuth, navigate,
}) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authSlow, setAuthSlow] = useState(false);
  const authInFlightRef = useRef(false);

  const handleAuth = async () => {
    if (authInFlightRef.current) return;
    onAuthErrorChange('');
    if (!loginId || !password || (isRegistering && !email)) {
      onAuthErrorChange(lang === 'ru' ? 'Заполните все поля' : 'Please fill in all fields');
      return;
    }
    if (isRegistering && !acceptTerms) {
      onAuthErrorChange(lang === 'ru' ? 'Примите условия использования' : 'Please accept the Terms and Privacy Policy');
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
      persistUserProfile(profile);
      await primeMediaToken();
      window.dispatchEvent(new CustomEvent('tidal-auth-login'));
      onCheckAuth().catch(() => {});
      onLoginSuccess(profile);

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
            await onCheckAuth();
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
      onAuthErrorChange(messageForApiError(err, lang));
    } finally {
      clearTimeout(slowTimer);
      setAuthSlow(false);
      resumeBackgroundRequests();
      authInFlightRef.current = false;
      setAuthLoading(false);
    }
  };

  return (
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
            style={inputStyle}
          />
        )}
        <input
          type="text"
          placeholder={t(isRegistering ? 'loginIdRegister' : 'loginId')}
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegistering ? 'new-password' : 'current-password'}
          style={inputStyle}
        />
        {isRegistering && (
          <label style={termsLabelStyle}>
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
        role="button"
        tabIndex={0}
        onClick={() => setIsRegistering(!isRegistering)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsRegistering(!isRegistering); }}
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
        onRedeem={() => {}}
        redeeming={false}
        redeemAfterLogin
        compact
      />
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '12px',
  background: 'var(--bg-main)',
  border: '1px solid var(--border-subtle)',
  color: 'white',
};

const termsLabelStyle = {
  display: 'flex',
  gap: '10px',
  alignItems: 'flex-start',
  textAlign: 'left',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
};

