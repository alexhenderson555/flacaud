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
      <p className="upgrade-promo__hint">
        {redeemAfterLogin
          ? t(
            'Enter your code, then press Log In or Sign Up — the plan applies right after.',
            'Введите код и нажмите «Войти» или «Регистрация» — тариф применится сразу после входа.',
          )
          : t(
            'Codes from Telegram or promotions apply instantly.',
            'Коды из Telegram и акций применяются сразу.',
          )}
      </p>
    </div>
  );
}
