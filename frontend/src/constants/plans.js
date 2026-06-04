/** Display plans — prices aligned with backend (payments.py / bot). */
export const PLAN_CATALOG = [
  {
    id: 'free',
    nameEn: 'Free',
    nameRu: 'Бесплатно',
    priceEn: '0 ₽',
    priceRu: '0 ₽',
    periodEn: '',
    periodRu: '',
    backendId: null,
    featuresEn: ['3 downloads / day', '96 kbps streaming', 'Search & library'],
    featuresRu: ['3 скачивания / день', 'Стрим 96 kbps', 'Поиск и медиатека'],
  },
  {
    id: 'basic',
    nameEn: 'Basic',
    nameRu: 'Базовый',
    priceEn: '199 ₽',
    priceRu: '199 ₽',
    periodEn: '/ month',
    periodRu: '/ мес',
    backendId: 'basic',
    featuresEn: ['50 downloads / day', '320 kbps & FLAC', 'Playlists'],
    featuresRu: ['50 скачиваний / день', '320 kbps и FLAC', 'Плейлисты'],
  },
  {
    id: 'pro',
    nameEn: 'Pro',
    nameRu: 'Про',
    priceEn: '399 ₽',
    priceRu: '399 ₽',
    periodEn: '/ month',
    periodRu: '/ мес',
    backendId: 'pro',
    popular: true,
    featuresEn: ['200 downloads / day', 'Lossless FLAC', 'DJ tools & EQ'],
    featuresRu: ['200 скачиваний / день', 'Lossless FLAC', 'DJ и эквалайзер'],
  },
  {
    id: 'lifetime',
    nameEn: 'Lifetime',
    nameRu: 'Навсегда',
    priceEn: '4 990 ₽',
    priceRu: '4 990 ₽',
    periodEn: 'one-time',
    periodRu: 'разово',
    backendId: 'lifetime',
    featuresEn: ['200 downloads / day forever', 'MAX when track supports it', 'Karaoke & priority queue'],
    featuresRu: ['200 скачиваний / день навсегда', 'MAX если трек поддерживает', 'Караоке и приоритет'],
  },
];

export function planDisplayName(planId, lang = 'en') {
  const id = (planId || 'free').toLowerCase();
  const p = PLAN_CATALOG.find((x) => x.id === id) || PLAN_CATALOG[0];
  return lang === 'ru' ? p.nameRu : p.nameEn;
}
