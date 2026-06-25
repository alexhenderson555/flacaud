import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import LandingFaq from '../components/landing/LandingFaq';
import { hasAuthSession } from '../utils/hasAuthSession';
import { SYNC_PLATFORMS } from '../utils/syncPlatforms';
import { PLAN_CATALOG } from '../constants/plans';
import PlatformIcon from '../components/sync/PlatformIcon';
import LegalFooter from '../components/layout/LegalFooter';
import LandingHeroMockup from '../components/landing/LandingHeroMockup';
import LandingVideoBg from '../components/landing/LandingVideoBg';
import LandingHeader from '../components/landing/LandingHeader';
import LandingShowcase from '../components/landing/LandingShowcase';
import LandingCompare from '../components/landing/LandingCompare';
import LandingProof from '../components/landing/LandingProof';
import LandingReveal from '../components/landing/LandingReveal';
import LandingAuthStrip from '../components/landing/LandingAuthStrip';
import { LANDING_COPY } from '../content/landingCopy';
import { useLandingLang } from '../hooks/useLandingLang';
import { useLandingCinemaMode } from '../hooks/useLandingCinemaMode';
import '../styles/landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLandingLang();
  const cinema = useLandingCinemaMode();
  const t = LANDING_COPY[lang] || LANDING_COPY.en;
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    if (hasAuthSession()) {
      navigate('/search', { replace: true });
    }
  }, [navigate]);

  const pricingPlans = useMemo(() => {
    const pick = (id) => PLAN_CATALOG.find((p) => p.id === id);
    const free = pick('free');
    const lifetime = pick('lifetime');
    const paid = billing === 'annual' ? [pick('basic_annual'), pick('pro_annual')] : [pick('basic'), pick('pro')];
    return [free, ...paid, lifetime].filter(Boolean);
  }, [billing]);

  const platformMarquee = [...SYNC_PLATFORMS, ...SYNC_PLATFORMS];

  return (
    <div className={`landing${cinema ? ' landing--cinema' : ''}`} style={{ position: 'relative' }}>
      <LandingVideoBg cinema={cinema} />

      {cinema && (
        <p className="landing__cinema-hint" aria-live="polite">
          {lang === 'ru' ? 'Shift+V или Esc — выйти' : 'Shift+V or Esc to exit'}
        </p>
      )}

      <LandingHeader t={t} onToggleLang={toggleLang} />

      <main className="landing__main">
        <section className="landing__hero">
          <motion.div
            className="landing__hero-copy"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="landing__headline">
              {t.headline}
              <span className="landing__headline-accent">{t.headlineAccent}</span>
            </h1>
            <p className="landing__sub">{t.sub}</p>
            <div className="landing__cta">
              <Link to="/account" className="btn-primary landing__cta-btn landing__cta-btn--primary">
                {t.ctaPrimary}
                <ArrowRight size={18} aria-hidden />
              </Link>
              <Link to="/sync" className="btn-secondary landing__cta-btn">
                {t.ctaTransfer}
              </Link>
            </div>
            <dl className="landing__stats">
              {t.stats.map((stat) => (
                <div key={stat.label} className="landing__stat">
                  <dt>{stat.value}</dt>
                  <dd>{stat.label}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            className="landing__hero-visual"
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <LandingHeroMockup lang={lang} />
          </motion.div>
        </section>

        <LandingReveal>
          <LandingAuthStrip t={t} />
        </LandingReveal>

        <LandingReveal>
          <section id="features" className="landing__pillars">
            <h2 className="landing__section-title">{t.pillarsTitle}</h2>
            <div className="landing__pillars-grid">
              {t.pillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <article key={pillar.title} className="landing__pillar glass-panel">
                    <div className="landing__pillar-icon-wrap">
                      <Icon size={24} aria-hidden />
                    </div>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.text}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </LandingReveal>

        <LandingReveal>
          <LandingShowcase t={t} lang={lang} />
        </LandingReveal>

        <LandingReveal>
          <LandingCompare t={t} />
        </LandingReveal>

        <LandingReveal>
          <LandingProof t={t} />
        </LandingReveal>

        <LandingReveal>
          <section className="landing__steps">
            <h2 className="landing__section-title">{t.stepsTitle}</h2>
            <ol className="landing__steps-list">
              {t.steps.map((step) => (
                <li key={step.n} className="landing__step glass-panel">
                  <span className="landing__step-num">{step.n}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </LandingReveal>

        <section className="landing__platforms landing__platforms--marquee" aria-label={t.platforms}>
          <p className="landing__platforms-label">{t.platforms}</p>
          <div className="landing-marquee">
            <div className="landing-marquee__track">
              {platformMarquee.map((platform, index) => (
                <span key={`${platform.id}-${index}`} className="landing__platform-chip">
                  <PlatformIcon id={platform.id} size={22} />
                  <span>{platform.name}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <LandingReveal>
          <section id="pricing" className="landing__pricing">
            <div className="landing__pricing-head">
              <div>
                <h2 className="landing__section-title">{t.pricingTitle}</h2>
                <p className="landing__section-sub">{t.pricingSub}</p>
              </div>
              <div className="landing__billing" role="group" aria-label="Billing period">
                <button
                  type="button"
                  className={billing === 'monthly' ? 'landing__billing-btn landing__billing-btn--active' : 'landing__billing-btn'}
                  onClick={() => setBilling('monthly')}
                >
                  {t.billingMonthly}
                </button>
                <button
                  type="button"
                  className={billing === 'annual' ? 'landing__billing-btn landing__billing-btn--active' : 'landing__billing-btn'}
                  onClick={() => setBilling('annual')}
                >
                  {t.billingAnnual}
                  <span className="landing__billing-save">{t.billingSave}</span>
                </button>
              </div>
            </div>

            <div className="landing__pricing-grid">
              {pricingPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`landing__price-card glass-panel${plan.popular ? ' landing__price-card--popular' : ''}`}
                >
                  {plan.popular && <span className="landing__price-badge">{t.popular}</span>}
                  <h3>{lang === 'ru' ? plan.nameRu : plan.nameEn}</h3>
                  <div className="landing__price">
                    {lang === 'ru' ? plan.priceRu : plan.priceEn}
                    {(lang === 'ru' ? plan.periodRu : plan.periodEn) && (
                      <span>{lang === 'ru' ? plan.periodRu : plan.periodEn}</span>
                    )}
                  </div>
                  <ul>
                    {(lang === 'ru' ? plan.featuresRu : plan.featuresEn).slice(0, 4).map((feature) => (
                      <li key={feature}>
                        <Check size={14} aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link to="/account" className="landing__price-cta">
                    {t.pricingCta}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </LandingReveal>

        <LandingReveal>
          <LandingFaq t={t} />
        </LandingReveal>

        <LandingReveal>
          <section className="landing__final">
            <div className="landing__final-inner glass-panel">
              <h2>{t.finalTitle}</h2>
              <p>{t.finalSub}</p>
              <Link to="/account" className="btn-primary landing__cta-btn">
                {t.ctaPrimary}
                <ArrowRight size={18} aria-hidden />
              </Link>
            </div>
          </section>
        </LandingReveal>

        <p className="landing__foot">{t.foot}</p>
      </main>

      <footer className="landing__legal">
        <LegalFooter lang={lang} />
      </footer>
    </div>
  );
}
