import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MessageCircle, ArrowRight } from 'lucide-react';
import TelegramIcon from '../icons/TelegramIcon';
import { TELEGRAM_CONTACT_URL } from '../../constants/supportLinks';

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className={`landing-faq__item${open ? ' landing-faq__item--open' : ''}`}>
      <button
        type="button"
        className="landing-faq__q"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="landing-faq__q-text">{q}</span>
        <ChevronDown size={18} className="landing-faq__chevron" aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="landing-faq__a-wrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="landing-faq__a">
              <p>{a}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingFaq({ t }) {
  const [openFaq, setOpenFaq] = useState(-1);

  return (
    <section id="faq" className="landing__faq">
      <div className="landing__faq-head">
        <h2 className="landing__section-title">{t.faqTitle}</h2>
        <p className="landing__section-sub landing__section-sub--center">{t.faqSub}</p>
      </div>

      <div className="landing-faq__layout">
        <aside className="landing-faq__aside glass-panel">
          <div className="landing-faq__aside-icon">
            <MessageCircle size={22} aria-hidden />
          </div>
          <h3>{t.faqContactTitle}</h3>
          <p>{t.faqContactSub}</p>
          <Link to="/account" className="landing-faq__aside-cta">
            {t.faqContactCta}
            <ArrowRight size={16} aria-hidden />
          </Link>

          <div className="landing-faq__tg">
            <p className="landing-faq__tg-title">{t.faqTelegramTitle}</p>
            <p className="landing-faq__tg-sub">{t.faqTelegramSub}</p>
            <a
              href={TELEGRAM_CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-faq__tg-btn"
            >
              <TelegramIcon size={20} aria-hidden />
              {t.faqTelegramCta}
            </a>
          </div>
        </aside>

        <div className="landing-faq">
          {t.faq.map((item, i) => (
            <FaqItem
              key={item.q}
              q={item.q}
              a={item.a}
              open={openFaq === i}
              onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
