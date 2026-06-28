import { Tag } from 'lucide-react';

export default function PromoCodeBlock({
  lang,
  activationCode,
  setActivationCode,
  onRedeem,
  redeeming,
  compact = false,
  /** On login screen: enter code, then sign in — no separate Activate until logged in. */
  redeemAfterLogin = false,
}) {
  const t = (en, ru) => (lang === 'ru' ? ru : en);

  return (
    <div className={`upgrade-promo${compact ? ' upgrade-promo--compact' : ''}`}>
      <div className="upgrade-promo__title">
        <Tag size={16} aria-hidden />
        <span>{t('Promo or activation code', 'Промокод или код активации')}</span>
      </div>
      <div className="upgrade-promo__row">
        <input
          type="text"
          data-testid="activation-code-input"
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={activationCode}
          onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
          className="upgrade-promo__input"
          autoComplete="off"
          spellCheck={false}
        />
        {!redeemAfterLogin && (
          <button
            type="button"
            data-testid="activation-redeem-btn"
            className="btn-primary upgrade-promo__btn"
            disabled={redeeming || !activationCode.trim()}
            onClick={onRedeem}
          >
            {redeeming ? '…' : t('Activate', 'Активировать')}
          </button>
        )}
      </div>
      <p
        className="upgrade-promo__hint"
        style={redeemAfterLogin ? {
          color: 'var(--text-secondary)',
          background: 'rgba(37, 117, 252, 0.1)',
          border: '1px solid rgba(37, 117, 252, 0.25)',
          borderRadius: '10px',
          padding: '8px 12px',
          fontSize: '0.85rem',
        } : undefined}
      >
        {redeemAfterLogin
          ? t(
            'Enter your code, then Log In or Sign Up — the plan applies automatically right after.',
            'Введите код и войдите или зарегистрируйтесь — тариф применится автоматически сразу после входа.',
          )
          : t(
            'Codes from Telegram or promotions apply instantly.',
            'Коды из Telegram и акций применяются сразу.',
          )}
      </p>
    </div>
  );
}
