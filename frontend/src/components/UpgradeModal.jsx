import { useState } from 'react';
import { showToast } from '../utils/toast';
import { motion } from 'framer-motion';
import { X, Check, Zap, Star, Crown, CreditCard, ArrowRight } from 'lucide-react';
import { PLAN_CATALOG } from '../constants/plans';
import { apiPostJson } from '../utils/apiClient';

const ICONS = {
  free: <Zap size={24} color="#a1a1aa" />,
  basic: <Zap size={24} color="#6ee7b7" />,
  pro: <Star size={24} color="#2575fc" />,
  lifetime: <Crown size={24} color="#ffb703" />,
};

const COLORS = { free: '#a1a1aa', basic: '#6ee7b7', pro: '#2575fc', lifetime: '#ffb703' };

export default function UpgradeModal({ onClose, lang, onPlanUpdated }) {
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [showPayment, setShowPayment] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const t = (en, ru) => (lang === 'ru' ? ru : en);

  const paidPlans = PLAN_CATALOG.filter((p) => p.backendId);

  const handleRedeem = async () => {
    const code = activationCode.trim();
    if (!code) return;
    setRedeeming(true);
    try {
      const data = await apiPostJson(
        '/api/activation/redeem',
        { code },
        { auth: true },
      );
      showToast(data.message || t('Plan activated!', 'Тариф активирован!'));
      onPlanUpdated?.();
      onClose();
    } catch {
      showToast(t('Network error', 'Ошибка сети'));
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-panel"
        data-testid="upgrade-modal"
        style={{
          width: '100%', maxWidth: '1100px',
          background: 'var(--bg-surface)',
          borderRadius: '24px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          maxHeight: '90vh',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute', top: '24px', right: '24px',
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
            width: '40px', height: '40px', cursor: 'pointer', color: 'white', zIndex: 10,
          }}
        >
          <X size={20} />
        </button>

        <div style={{ padding: '40px', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '2.2rem', marginBottom: '8px', color: 'white' }}>
              {t('Choose Your Plan', 'Выберите тариф')}
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              {t(
                'Pay via card or buy an activation code in Telegram.',
                'Оплата картой или код активации в Telegram.',
              )}
            </p>
          </div>

          {!showPayment ? (
            <>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '32px' }}>
                {PLAN_CATALOG.map((p) => {
                  const color = COLORS[p.id] || '#2575fc';
                  const selectable = !!p.backendId;
                  return (
                    <div
                      key={p.id}
                      role={selectable ? 'button' : undefined}
                      onClick={() => selectable && setSelectedPlan(p.id)}
                      style={{
                        flex: '1 1 220px', maxWidth: '260px',
                        background: selectedPlan === p.id ? `${color}18` : 'rgba(255,255,255,0.02)',
                        border: `2px solid ${selectedPlan === p.id && selectable ? color : 'var(--border-subtle)'}`,
                        borderRadius: '20px', padding: '24px 20px',
                        cursor: selectable ? 'pointer' : 'default',
                        opacity: selectable ? 1 : 0.85,
                      }}
                    >
                      {p.popular && (
                        <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '0.7rem', fontWeight: 700, color }}>
                          {t('POPULAR', 'ПОПУЛЯРНЫЙ')}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        {ICONS[p.id]}
                        <h3 style={{ margin: 0, color: 'white' }}>{lang === 'ru' ? p.nameRu : p.nameEn}</h3>
                      </div>
                      <div style={{ marginBottom: '16px' }}>
                        <span style={{ fontSize: '2rem', fontWeight: 800, color: 'white' }}>
                          {lang === 'ru' ? p.priceRu : p.priceEn}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                          {lang === 'ru' ? p.periodRu : p.periodEn}
                        </span>
                      </div>
                      {(lang === 'ru' ? p.featuresRu : p.featuresEn).map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                          <Check size={16} color={color} style={{ flexShrink: 0 }} />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  disabled={!paidPlans.find((p) => p.id === selectedPlan)}
                  onClick={() => setShowPayment(true)}
                  className="btn-primary"
                  style={{ padding: '14px 40px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  {t('Continue', 'Продолжить')} <ArrowRight size={18} />
                </button>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              style={{ maxWidth: '520px', margin: '0 auto', padding: '32px', borderRadius: '20px', border: '1px solid var(--border-subtle)' }}
            >
              <h3 style={{ color: 'white', marginBottom: '20px' }}>{t('Payment', 'Оплата')}</h3>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const data = await apiPostJson(
                      '/api/payments/create',
                      { plan: selectedPlan },
                      { auth: true },
                    );
                    if (data.url) window.location.href = data.url;
                    else showToast(data.detail || t('Payment unavailable', 'Оплата недоступна'));
                  } catch (err) {
                    showToast(err?.message || t('Server error', 'Ошибка сервера'));
                  }
                }}
                style={{
                  width: '100%', padding: '14px', marginBottom: '12px',
                  background: '#2575fc', color: 'white', border: 'none', borderRadius: '12px',
                  fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                }}
              >
                <CreditCard size={20} />
                {t('Pay with card (YooKassa)', 'Картой (ЮKassa)')}
              </button>
              <button
                type="button"
                onClick={() => window.open('https://t.me/alexhenderson', '_blank')}
                style={{
                  width: '100%', padding: '14px', marginBottom: '20px',
                  background: '#2AABEE', color: 'white', border: 'none', borderRadius: '12px',
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t('Buy code in Telegram', 'Купить код в Telegram')}
              </button>

              <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                {t('Have an activation code?', 'Есть код активации?')}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  data-testid="activation-code-input"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'white',
                  }}
                />
                <button
                  type="button"
                  data-testid="activation-redeem-btn"
                  className="btn-primary"
                  disabled={redeeming}
                  onClick={handleRedeem}
                  style={{ padding: '0 20px', borderRadius: '8px' }}
                >
                  {redeeming ? '…' : t('Activate', 'Активировать')}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                style={{ marginTop: '20px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', width: '100%' }}
              >
                {t('← Back', '← Назад')}
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
