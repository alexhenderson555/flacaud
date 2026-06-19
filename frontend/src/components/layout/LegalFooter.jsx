import { Link } from 'react-router-dom';

export default function LegalFooter({ lang = 'en' }) {
  const terms = lang === 'ru' ? 'Условия' : 'Terms';
  const privacy = 'Privacy';

  return (
    <footer className="legal-footer" aria-label={lang === 'ru' ? 'Правовая информация' : 'Legal'}>
      <Link to="/terms" className="legal-footer__link">{terms}</Link>
      <Link to="/privacy" className="legal-footer__link">{privacy}</Link>
    </footer>
  );
}
