import { Tag } from 'lucide-react';

export default function PromoCodeBlock({
  lang,
  activationCode,
  setActivationCode,
  onRedeem,
  redeeming,
  compact = false,
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
        <button
          type="button"
          data-testid="activation-redeem-btn"
          className="btn-primary upgrade-promo__btn"
          disabled={redeeming || !activationCode.trim()}
          onClick={onRedeem}
        >
          {redeeming ? '…' : t('Activate', 'Активировать')}
        </button>
      </div>
      <p className="upgrade-promo__hint">
        {t(
          'Codes from Telegram or promotions apply instantly.',
          'Коды из Telegram и акций применяются сразу.',
        )}
      </p>
    </div>
  );
}
