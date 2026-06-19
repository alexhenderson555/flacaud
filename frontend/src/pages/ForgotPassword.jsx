import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { apiFetch, messageForApiError, parseJsonSafe } from '../utils/apiClient';

const dict = {
  en: {
    title: 'Forgot password',
    desc: 'Enter your account email — we will send a link to reset your password.',
    email: 'Email',
    submit: 'Send reset link',
    sending: 'Sending…',
    sentTitle: 'Check your inbox',
    sentDesc: 'If an account with that email exists, we sent a password reset link. It expires in 1 hour.',
    sentSpamHint: 'If nothing arrives in a few minutes, check Spam or Promotions — mail from a new domain often lands there first.',
    backLogin: 'Back to login',
    home: 'FlacAud home',
  },
  ru: {
    title: 'Забыли пароль',
    desc: 'Введите email аккаунта — мы отправим ссылку для смены пароля.',
    email: 'Email',
    submit: 'Отправить ссылку',
    sending: 'Отправляем…',
    sentTitle: 'Проверьте почту',
    sentDesc: 'Если аккаунт с таким email есть, мы отправили ссылку. Она действует 1 час.',
    sentSpamHint: 'Если письма нет через несколько минут, загляните в «Спам» — с нового домена письма часто попадают туда.',
    backLogin: 'Назад ко входу',
    home: 'На главную',
  },
};

export default function ForgotPassword() {
  const lang = localStorage.getItem('tidal-lang') || 'en';
  const t = (key) => dict[lang]?.[key] || dict.en[key] || key;

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError(lang === 'ru' ? 'Введите корректный email' : 'Enter a valid email');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
        timeoutMs: 30000,
        retries: 1,
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        const detail = data?.detail;
        throw new Error(typeof detail === 'string' ? detail : 'Request failed');
      }
      setSent(true);
    } catch (err) {
      setError(messageForApiError(err, lang));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-standalone">
      <div className="auth-standalone__card glass-panel">
        <div className="auth-standalone__icon">
          <Mail size={32} />
        </div>
        {sent ? (
          <>
            <h1>{t('sentTitle')}</h1>
            <p className="auth-standalone__desc">{t('sentDesc')}</p>
            <p className="auth-standalone__hint">{t('sentSpamHint')}</p>
            <Link to="/account" className="btn-primary auth-standalone__btn">
              {t('backLogin')}
            </Link>
          </>
        ) : (
          <>
            <h1>{t('title')}</h1>
            <p className="auth-standalone__desc">{t('desc')}</p>
            {error && <div className="auth-standalone__error">{error}</div>}
            <form onSubmit={handleSubmit} className="auth-standalone__form">
              <input
                type="email"
                placeholder={t('email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? t('sending') : t('submit')}
              </button>
            </form>
            <Link to="/account" className="auth-standalone__link">
              <ArrowLeft size={16} />
              {t('backLogin')}
            </Link>
          </>
        )}
        <Link to="/" className="auth-standalone__muted">{t('home')}</Link>
      </div>
    </div>
  );
}
