import React, { useState } from 'react';
import { showToast } from '../utils/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Zap, Star, Crown, CreditCard, Apple, ArrowRight } from 'lucide-react';

export default function UpgradeModal({ onClose, lang }) {
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [showPayment, setShowPayment] = useState(false);

  const t = (en, ru) => lang === 'ru' ? ru : en;

  const plans = [
    {
      id: 'basic',
      name: t('Basic', 'Бесплатный'),
      price: t('$0', '0 ₽'),
      period: t('/ month', '/ мес'),
      icon: <Zap size={24} color="#a1a1aa" />,
      color: '#a1a1aa',
      features: [
        t('10 downloads per day', '10 скачиваний в день'),
        t('High Quality (320kbps AAC)', 'Высокое качество (320kbps AAC)'),
        t('Basic Search', 'Базовый поиск')
      ]
    },
    {
      id: 'pro',
      name: t('PRO', 'Про'),
      price: t('$4.99', '149 ₽'),
      period: t('/ month', '/ мес'),
      icon: <Star size={24} color="#2575fc" />,
      color: '#2575fc',
      popular: true,
      features: [
        t('200 downloads per day', '200 скачиваний в день'),
        t('Lossless Quality (FLAC 16-bit)', 'Lossless качество (FLAC 16-bit)'),
        t('DJ Tools & Pitch Control', 'DJ инструменты и Pitch Control'),
        t('No Ads', 'Без рекламы')
      ]
    },
    {
      id: 'lifetime',
      name: t('Ultimate', 'Ультиматум'),
      price: t('$12.99', '299 ₽'),
      period: t('/ month', '/ мес'),
      icon: <Crown size={24} color="#ffb703" />,
      color: '#ffb703',
      features: [
        t('Unlimited downloads', 'Безлимитные скачивания'),
        t('MAX Quality (FLAC 24-bit)', 'MAX качество (FLAC 24-bit)'),
        t('Karaoke Mode with Synced Lyrics', 'Режим Караоке с текстом песен'),
        t('Priority Server Queue', 'Приоритетная очередь на сервере')
      ]
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px'
      }}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-panel"
        style={{
          width: '100%', maxWidth: '1000px',
          background: 'var(--bg-surface)',
          borderRadius: '24px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          position: 'relative',
          maxHeight: '90vh'
        }}
      >
        <button 
          onClick={onClose}
          style={{ position: 'absolute', top: '24px', right: '24px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', zIndex: 10 }}
        >
          <X size={20} />
        </button>

        <div style={{ padding: '40px', overflowY: 'auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '8px', color: 'white' }}>{t('Choose Your Plan', 'Выберите тариф')}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>{t('Unlock the full power of high-resolution audio downloads.', 'Откройте всю мощь скачивания музыки в высоком разрешении.')}</p>
          </div>

          {!showPayment ? (
            <>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '40px' }}>
                {plans.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id)}
                    style={{
                      flex: '1 1 280px', maxWidth: '320px',
                      background: selectedPlan === p.id ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, ${p.color}20 100%)` : 'rgba(255,255,255,0.02)',
                      border: `2px solid ${selectedPlan === p.id ? p.color : 'var(--border-subtle)'}`,
                      borderRadius: '20px', padding: '32px 24px',
                      cursor: 'pointer', transition: 'all 0.3s ease',
                      position: 'relative',
                      transform: selectedPlan === p.id ? 'translateY(-8px)' : 'none',
                      boxShadow: selectedPlan === p.id ? `0 10px 30px ${p.color}40` : 'none'
                    }}
                  >
                    {p.popular && (
                      <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', background: p.color, color: 'white', fontSize: '0.75rem', fontWeight: 700, padding: '4px 16px', borderRadius: '20px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                        {t('Most Popular', 'Популярный')}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${p.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {p.icon}
                      </div>
                      <h3 style={{ fontSize: '1.5rem', margin: 0, color: 'white' }}>{p.name}</h3>
                    </div>
                    
                    <div style={{ marginBottom: '24px' }}>
                      <span style={{ fontSize: '3rem', fontWeight: 800, color: 'white' }}>{p.price}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{p.period}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {p.features.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                          <Check size={18} color={p.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button 
                  onClick={() => setShowPayment(true)}
                  className="btn-primary" 
                  style={{ padding: '16px 48px', fontSize: '1.2rem', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  {t('Continue to Payment', 'Перейти к оплате')} <ArrowRight size={20} />
                </button>
              </div>
            </>
          ) : (
            <motion.div 
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              style={{ maxWidth: '500px', margin: '0 auto', background: 'rgba(255,255,255,0.03)', padding: '40px', borderRadius: '24px', border: '1px solid var(--border-subtle)' }}
            >
              <h3 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'white' }}>{t('Payment Method', 'Способ оплаты')}</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/payments/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ plan: selectedPlan })
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        showToast("Error generating payment URL");
                      }
                    } catch (e) {
                      console.error(e);
                      showToast("Server error");
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%', padding: '16px', background: '#2575fc', color: 'white', borderRadius: '12px', border: 'none', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  <CreditCard size={24} /> {t('Pay with Card (YooKassa)', 'Оплатить картой (ЮKassa)')}
                </button>
                <button 
                  onClick={() => window.open('https://t.me/alexhenderson', '_blank')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%', padding: '16px', background: '#2AABEE', color: 'white', borderRadius: '12px', border: 'none', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('Buy Code in Telegram', 'Купить код в Telegram (@alexhenderson)')}
                </button>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('Already have an activation code?', 'Уже есть код активации?')}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" placeholder={t('Enter code', 'Введите код')} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-main)', color: 'white' }} />
                  <button className="btn-primary" style={{ padding: '0 16px', borderRadius: '8px' }}>{t('Activate', 'Активировать')}</button>
                </div>
              </div>

              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('Secure payment powered by YooKassa. You can cancel your subscription at any time.', 'Безопасная оплата через ЮKassa. Вы можете отменить подписку в любой момент.')}
              </p>
              
              <button 
                onClick={() => setShowPayment(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', display: 'block', margin: '24px auto 0', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                {t('← Back to plans', '← Назад к тарифам')}
              </button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
