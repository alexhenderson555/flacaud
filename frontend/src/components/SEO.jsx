import { Helmet } from 'react-helmet-async';
import { usePlayerStore } from '../store/usePlayerStore';

export default function SEO({ title, description, image = 'https://flacaud.ru/og-landing.jpg', path = '/' }) {
  const lang = usePlayerStore((state) => state.lang);
  
  const siteName = 'FlacAud';
  const url = `https://flacaud.ru${path}${lang === 'en' ? '?lang=en' : ''}`;

  return (
    <Helmet htmlAttributes={{ lang }}>
      <title>{title ? `${title} | ${siteName}` : siteName}</title>
      {description && <meta name="description" content={description} />}
      
      <link rel="canonical" href={url} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title || siteName} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image" content={image} />
      <meta property="og:locale" content={lang === 'ru' ? 'ru_RU' : 'en_US'} />
      <meta property="og:locale:alternate" content={lang === 'ru' ? 'en_US' : 'ru_RU'} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title || siteName} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
