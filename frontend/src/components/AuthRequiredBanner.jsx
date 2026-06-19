import { Link } from 'react-router-dom';
import { LogIn, X } from 'lucide-react';

export default function AuthRequiredBanner({ lang = 'en', onDismiss }) {
  const ru = lang === 'ru';

  return (
    <div className="auth-required-banner" role="status">
      <div className="auth-required-banner__content">
        <LogIn size={18} aria-hidden />
        <div className="auth-required-banner__text">
          <strong>{ru ? 'Вход обязателен' : 'Sign in required'}</strong>
          <span>
            {ru
              ? 'Стриминг, библиотека и загрузки доступны только после авторизации.'
              : 'Streaming, library, and downloads require an account.'}
          </span>
        </div>
      </div>
      <div className="auth-required-banner__actions">
        <Link to="/account" className="auth-required-banner__cta btn-primary">
          {ru ? 'Войти' : 'Sign in'}
        </Link>
        <button
          type="button"
          className="auth-required-banner__dismiss"
          aria-label={ru ? 'Скрыть' : 'Dismiss'}
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
