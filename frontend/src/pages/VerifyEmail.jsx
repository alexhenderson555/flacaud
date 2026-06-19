import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmailToken } from '../utils/authSession';
import { messageForApiError } from '../utils/apiClient';

const dict = {
  en: {
    title: 'Verify email',
    working: 'Verifying…',
    ok: 'Email verified. You can log in now.',
    okSpamHint: 'If you did not receive the earlier verification email, check Spam.',
    fail: 'Verification failed.',
    login: 'Go to login',
  },
  ru: {
    title: 'Подтверждение email',
    working: 'Проверяем…',
    ok: 'Email подтверждён. Можно войти.',
    okSpamHint: 'Если письмо для подтверждения не приходило, проверьте «Спам».',
    fail: 'Не удалось подтвердить.',
    login: 'Войти',
  },
};

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const lang = (localStorage.getItem('tidal-lang') || 'en').startsWith('ru') ? 'ru' : 'en';
  const t = (k) => dict[lang][k] || dict.en[k];
  const [status, setStatus] = useState('working');
  const [message, setMessage] = useState(t('working'));
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('fail'));
      return;
    }
    verifyEmailToken(token)
      .then((data) => {
        setStatus('ok');
        setMessage(data.message || t('ok'));
        setHint(t('okSpamHint'));
      })
      .catch((err) => {
        setStatus('error');
        setMessage(messageForApiError(err, lang) || t('fail'));
      });
  }, [token, lang, t]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="glass-panel" style={{ maxWidth: '480px', padding: '32px', borderRadius: '20px', textAlign: 'center' }}>
        <h1 style={{ marginBottom: '16px' }}>{t('title')}</h1>
        <p style={{ color: status === 'ok' ? 'var(--accent-solid)' : 'var(--text-secondary)', marginBottom: hint ? '8px' : '24px' }}>
          {message}
        </p>
        {hint && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '24px', lineHeight: 1.45 }}>
            {hint}
          </p>
        )}
        <Link to="/account" className="btn-primary" style={{ display: 'inline-block', padding: '12px 24px', borderRadius: '24px', textDecoration: 'none' }}>
          {t('login')}
        </Link>
      </div>
    </div>
  );
}
