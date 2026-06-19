import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Repeat, Heart, Disc3 } from 'lucide-react';
import LandingProductFrame from './LandingProductFrame';
import { TransferPanel, LibraryPanel, DjPanel } from './LandingShowcasePanels';

const TAB_ICONS = {
  transfer: Repeat,
  library: Heart,
  dj: Disc3,
};

const ROUTE_BY_TAB = {
  transfer: 'transfer',
  library: 'library',
  dj: 'dj',
};

export default function LandingShowcase({ t, lang }) {
  const [tab, setTab] = useState('transfer');
  const active = t.showcaseTabs.find((item) => item.id === tab) || t.showcaseTabs[0];
  const TabIcon = TAB_ICONS[tab] || Repeat;

  return (
    <section id="showcase" className="landing__showcase">
      <div className="landing__showcase-head landing__showcase-head--center">
        <h2 className="landing__section-title">{t.showcaseTitle}</h2>
        <p className="landing__section-sub landing__section-sub--center">{t.showcaseSub}</p>
      </div>

      <div className="landing-showcase__layout">
        <div className="landing-showcase__aside">
          <div className="landing-showcase__tabs" role="tablist" aria-label={t.showcaseTitle}>
            {t.showcaseTabs.map((item) => {
              const Icon = TAB_ICONS[item.id] || Repeat;
              const isActive = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`landing-showcase__tab${isActive ? ' landing-showcase__tab--active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <span className="landing-showcase__tab-icon">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="landing-showcase__tab-copy">
                    <strong>{item.label}</strong>
                    <span>{item.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="landing-showcase__highlights glass-panel">
            <div className="landing-showcase__highlights-head">
              <TabIcon size={16} aria-hidden />
              <span>{active.label}</span>
            </div>
            <ul>
              {active.highlights.map((line) => (
                <li key={line}>
                  <Check size={14} aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="landing-showcase__preview">
          <div className="landing-showcase__preview-badge" aria-hidden>
            <span className="landing-showcase__preview-dot" />
            {lang === 'ru' ? 'Живой интерфейс' : 'Live UI'}
          </div>
          <LandingProductFrame lang={lang} activeRoute={ROUTE_BY_TAB[tab]}>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                className="landing-showcase__panel-wrap"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {tab === 'transfer' && <TransferPanel lang={lang} />}
                {tab === 'library' && <LibraryPanel lang={lang} />}
                {tab === 'dj' && <DjPanel lang={lang} />}
              </motion.div>
            </AnimatePresence>
          </LandingProductFrame>
        </div>
      </div>
    </section>
  );
}
