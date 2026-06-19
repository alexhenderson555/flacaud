import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, ArrowLeft } from 'lucide-react';
import { apiFetch, messageForApiError, parseJsonSafe } from '../utils/apiClient';

const dict = {
  en: {
    title: 'New password',
    desc: 'Choose a new password for your account.',
    password: 'New password',
    confirm: 'Confirm password',
    submit: 'Update password',
    saving: 'Saving…',
    doneTitle: 'Password updated',
    doneDesc: 'You can log in with your new password now.',
    login: 'Log in',
    backLogin: 'Back to login',
    home: 'FlacAud home',
    mismatch: 'Passwords do not match',
    tooShort: 'Password must be at least 8 characters',
    missingToken: 'Reset link is invalid or missing. Request a new one.',
    requestNew: 'Request new link',
  },
  ru: {
    title: 'Новый пароль',
    desc: 'Придумайте новый пароль для аккаунта.',
    password: 'Новый пароль',
    confirm: 'Подтвердите пароль',
    submit: 'Сохранить пароль',
    saving: 'Сохраняем…',
    doneTitle: 'Пароль обновлён',
    doneDesc: 'Теперь можно войти с новым паролем.',
    login: 'Войти',
    backLogin: 'Назад ко входу',
    home: 'На главную',
    mismatch: 'Пароли не совпадают',
    tooShort: 'Минимум 8 символов',
    missingToken: 'Ссылка недействительна или устарела. Запросите новую.',
    requestNew: 'Запросить новую ссылку',
  },
};

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const lang = localStorage.getItem('tidal-lang') || 'en';
  const t = (key) => dict[lang]?.[key] || dict.en[key] || key;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || !token) return;
    setError('');
    if (password.length < 8) {
      setError(t('tooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('mismatch'));
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        timeoutMs: 30000,
        retries: 1,
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === 'string' ? detail : 'Reset failed');
      }
      setDone(true);
      setTimeout(() => navigate('/account', { replace: true }), 2500);
    } catch (err) {
      setError(messageForApiError(err, lang));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-standalone">
        <div className="auth-standalone__card glass-panel">
          <p className="auth-standalone__error">{t('missingToken')}</p>
          <Link to="/forgot-password" className="btn-primary auth-standalone__btn">
            {t('requestNew')}
          </Link>
          <Link to="/account" className="auth-standalone__link">
            <ArrowLeft size={16} />
            {t('backLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-standalone">
      <div className="auth-standalone__card glass-panel">
        <div className="auth-standalone__icon">
          <KeyRound size={32} />
        </div>
        {done ? (
          <>
            <h1>{t('doneTitle')}</h1>
            <p className="auth-standalone__desc">{t('doneDesc')}</p>
            <Link to="/account" className="btn-primary auth-standalone__btn">
              {t('login')}
            </Link>
          </>
        ) : (
          <>
            <h1>{t('title')}</h1>
            <p className="auth-standalone__desc">{t('desc')}</p>
            {error && <div className="auth-standalone__error">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-standalone__form">
              <input
                type="password"
                placeholder={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <input
                type="password"
                placeholder={t('confirm')}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? t('saving') : t('submit')}
              </button>
            </form>
            <Link to="/forgot-password" className="auth-standalone__link">
              {t('requestNew')}
            </Link>
          </>
        )}
        <Link to="/" className="auth-standalone__muted">{t('home')}</Link>
      </div>
    </div>
  );
}
