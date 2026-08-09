import {
  Disc3, Download, ListMusic, Search, Compass,
} from 'lucide-react';

export const LANDING_COPY = {
  en: {
    navFeatures: 'Features',
    navShowcase: 'Preview',
    navCompare: 'Compare',
    navPricing: 'Pricing',
    navFaq: 'FAQ',
    navSignIn: 'Login',
    langToggle: 'RU',
    badge: 'Lossless · Transfer · DJ Tools',
    headline: 'Music belongs on your hard drive',
    headlineAccent: 'not trapped in a stream',
    sub: 'Pull tracks in true FLAC, migrate playlists from Spotify/Apple without losing specific edits, and prep sets by key. Built for geeks, DJs, and audiophiles.',
    ctaPrimary: 'Try for free',
    ctaTransfer: 'Move a playlist',
    authStripTitle: 'Log in to start digging',
    authStripBody: 'Search, download lossless, transfer playlists, and use DJ tools. No credit card needed.',
    authStripCta: 'Log in / Sign up',
    stats: [
      { value: '8', label: 'sources' },
      { value: 'FLAC', label: 'straight to disk' },
      { value: '192kHz', label: 'Hi-Res available' },
    ],
    pillarsTitle: 'Why it’s better',
    pillars: [
      {
        icon: Download,
        title: 'True Lossless',
        text: 'No fake upscales. You download FLAC or Hi-Res — and keep the file forever.',
      },
      {
        icon: ListMusic,
        title: 'Smart Transfer',
        text: 'Verify the exact remix or edit before you download. Fix wrong matches manually.',
      },
      {
        icon: Disc3,
        title: 'For DJs',
        text: 'BPM, Camelot keys, harmonic analyzer, and built-in EQ. Everything you need to prep a set.',
      },
      {
        icon: Search,
        title: 'Find your next favorite',
        text: 'Shazam a track playing anywhere, get real recommendations, or tune into endless genre radio — no algorithm-fed shuffle.',
      },
      {
        icon: Compass,
        title: 'DJ set discovery',
        text: 'Paste any DJ set from YouTube or SoundCloud — we identify the tracklist automatically and let you download each track on its own.',
      },
    ],
    showcaseEyebrow: 'Preview',
    showcaseTitle: 'How it looks',
    showcaseSub: 'All the tools in one tab. No shady desktop apps required.',
    showcaseTabs: [
      {
        id: 'transfer',
        label: 'Transfer',
        desc: 'Check matches before downloading',
        highlights: ['Links from 8 platforms', 'ISRC confidence scores', 'Manual search for tricky tracks'],
      },
      {
        id: 'library',
        label: 'Library',
        desc: 'Local files with DJ tags',
        highlights: ['FLAC & Hi-Res downloads', 'BPM and key visible instantly', 'Audio-reactive visualizer', 'Convenient browser player'],
      },
      {
        id: 'dj',
        label: 'DJs',
        desc: 'Harmonic mixing',
        highlights: ['Track compatibility analysis', 'Set speed curves', 'Built-in EQ'],
      },
      {
        id: 'discover',
        label: 'Discover',
        desc: 'Shazam, radio, recommendations',
        highlights: ['Audio recognition — Shazam any track', 'Endless genre radio', 'Recommendations from your own taste'],
      },
    ],
    compareTitle: 'Why is regular streaming worse?',
    compareSub: 'FlacAud is for people who actually collect and work with music, not just put it on background.',
    compareCols: ['', 'FlacAud', 'Streaming', 'Transfer tools'],
    compareRows: [
      ['Files sit on your drive', true, false, false],
      ['Verify versions before import', true, false, 'partial'],
      ['Manual fix for bad matches', true, false, false],
      ['BPM, key, set tools', true, false, false],
      ['Move from 8 platforms', true, false, true],
      ['Browser player', true, true, false],
      ['Audio recognition (Shazam)', true, false, false],
      ['DJ set tracklist ID', true, false, false],
    ],
    comparePartial: 'Sometimes',
    proofTitle: 'Use cases',
    proof: [
      {
        role: 'Collectors',
        quote: 'I want my playlist to keep working even if a platform changes access or removes tracks.',
        stat: 'Files belong to you',
      },
      {
        role: 'DJs',
        quote: 'Drop a folder, instantly see key and BPM. No more shazaming every track before a gig.',
        stat: 'All data for mixing',
      },
      {
        role: 'Migrators',
        quote: 'Finally a tool that doesn’t silently swap acoustic versions for the original during a transfer.',
        stat: 'Full control',
      },
    ],
    stepsTitle: 'How it works',
    steps: [
      { n: '01', title: 'Find or paste a link', text: 'Drop a playlist URL from Spotify/Apple or just search by name.' },
      { n: '02', title: 'Check matches', text: 'See how accurately we found your tracks. Tweak manually if needed.' },
      { n: '03', title: 'Take it home', text: 'Download files, analyze BPM, and build your sets.' },
    ],
    pricingTitle: 'Pricing',
    pricingSub: 'Use it for free. Only pay if you need to download a lot or want Hi-Res.',
    billingMonthly: 'Monthly',
    billingAnnual: 'Yearly',
    billingSave: '−20%',
    pricingCta: 'Select',
    popular: 'Top',
    platforms: 'Works with',
    faqEyebrow: 'Help',
    faqTitle: 'Common questions',
    faqSub: 'Straight answers, no marketing bullshit.',
    faqContactTitle: 'Still thinking?',
    faqContactSub: 'Try it for free. No credit card required.',
    faqContactCta: 'Create account',
    faqTelegramTitle: 'Any questions left?',
    faqTelegramSub: 'Hit me up directly on Telegram — I’ll answer questions, discuss features or promos.',
    faqTelegramCta: 'Message on Telegram',
    faq: [
      {
        q: 'What exactly does FlacAud do?',
        a: 'It helps you build a real local library: search tracks, check matches from streaming links, download them in FLAC/Hi‑Res and keep all files on your drive.',
      },
      {
        q: 'Where can I transfer music from?',
        a: 'Spotify, Apple Music, YouTube Music, Deezer, SoundCloud, Yandex, VK, and of course Tidal.',
      },
      {
        q: 'Can I just use it without transferring anything?',
        a: 'Yes. You can search directly inside FlacAud, preview tracks in the browser player, download interesting finds and organize them into playlists without touching other services.',
      },
      {
        q: 'What tools do you have for DJs?',
        a: 'We show BPM and Camelot keys, highlight compatible tracks for harmonic mixing and let you analyze whole sets so you can plan speed and energy without extra software.',
      },
      {
        q: 'What is a "match check"?',
        a: 'When you drop a Spotify playlist, we search for those exact tracks in FLAC. We show a percentage of how sure we are it’s the right remix.',
      },
      {
        q: 'What do I get for free?',
        a: 'Unlimited searches. You can download up to 3 tracks per day in CD quality (16bit/44.1kHz) for free.',
      },
    ],
    finalTitle: 'Ready to build a proper library?',
    finalSub: 'Unlimited search, 3 free downloads daily. No card needed.',
    foot: 'Free plan · 3 tracks/day · No hidden subs',
  },
  ru: {
    navFeatures: 'Фичи',
    navShowcase: 'Превью',
    navCompare: 'Сравнение',
    navPricing: 'Цены',
    navFaq: 'Вопросы',
    navSignIn: 'Вход',
    langToggle: 'EN',
    badge: 'Lossless · Трансфер · Диджеинг',
    headline: 'Музыка должна лежать на диске',
    headlineAccent: 'а не пропадать из стримингов',
    sub: 'Тяни треки в честном FLAC, переноси плейлисты из Споти/Яндекса без потери версий и собирай сеты по тональности. Тула для гиков, диджеев и аудиофилов.',
    ctaPrimary: 'Попробовать бесплатно',
    ctaTransfer: 'Перенести плейлист',
    authStripTitle: 'Залогинься, чтобы собрать медиатеку',
    authStripBody: 'Поиск, скачивание в лосслесс, трансфер плейлистов и инструменты для диджеев. Карта для реги не нужна.',
    authStripCta: 'Войти / Рега',
    stats: [
      { value: '8', label: 'источников' },
      { value: 'FLAC', label: 'прямо на диск' },
      { value: '192kHz', label: 'где есть Hi-Res' },
    ],
    pillarsTitle: 'Почему с нами лучше',
    pillars: [
      {
        icon: Download,
        title: 'Реальный Lossless',
        text: 'Никаких апскейлов. Качаешь FLAC или Hi-Res — и файл твой навсегда.',
      },
      {
        icon: ListMusic,
        title: 'Умный перенос',
        text: 'Сам проверяешь, тот ли ремикс или эдит нашелся, еще до импорта. Можно руками поправить.',
      },
      {
        icon: Disc3,
        title: 'Для диджеев',
        text: 'BPM, Camelot-ключи, анализатор гармонии и встроенный EQ. Всё, чтобы собрать идеальный сет.',
      },
      {
        icon: Search,
        title: 'Найти новое любимое',
        text: 'Шазамь трек, играющий где угодно, получай реальные рекомендации или включай бесконечное радио по жанру — без алгоритмического шаффла в стиле «и так сойдёт».',
      },
      {
        icon: Compass,
        title: 'Поиск DJ-сетов',
        text: 'Кидаешь ссылку на любой сет с YouTube или SoundCloud — треклист распознаётся автоматически, каждый трек можно скачать отдельно.',
      },
    ],
    showcaseEyebrow: 'Превью',
    showcaseTitle: 'Как это выглядит',
    showcaseSub: 'Все инструменты в одном окне, без скачивания мутных приложух.',
    showcaseTabs: [
      {
        id: 'transfer',
        label: 'Трансфер',
        desc: 'Проверяй матчи до скачивания',
        highlights: ['Ссылки с 8 площадок', 'Оценка совпадения по ISRC', 'Ручной поиск сложных треков'],
      },
      {
        id: 'library',
        label: 'Библиотека',
        desc: 'Локальные файлы с DJ-тегами',
        highlights: ['Закачка FLAC и Hi-Res', 'Сразу видно BPM и ключ', 'Аудиореактивный визуализатор', 'Удобный плеер прямо в браузере'],
      },
      {
        id: 'dj',
        label: 'Диджеям',
        desc: 'Сведение по тональности',
        highlights: ['Анализ совместимости треков', 'Кривая скорости сета', 'Встроенный EQ'],
      },
      {
        id: 'discover',
        label: 'Обзор',
        desc: 'Shazam, радио, рекомендации',
        highlights: ['Распознавание аудио — шазамь любой трек', 'Бесконечное радио по жанрам', 'Рекомендации на основе твоего вкуса'],
      },
    ],
    compareTitle: 'Чем хуже обычный стриминг?',
    compareSub: 'FlacAud для тех, кто реально собирает музыку и работает с ней, а не просто ставит на фон.',
    compareCols: ['', 'FlacAud', 'Стриминги', 'Трансфер-сервисы'],
    compareRows: [
      ['Файлы лежат у тебя на диске', true, false, false],
      ['Проверка версий до импорта', true, false, 'partial'],
      ['Ручной фикс кривых матчей', true, false, false],
      ['BPM, тональность, сеты', true, false, false],
      ['Перенос с 8 платформ', true, false, true],
      ['Браузерный плеер', true, true, false],
      ['Распознавание аудио (Shazam)', true, false, false],
      ['Распознавание треклиста DJ-сета', true, false, false],
    ],
    comparePartial: 'Иногда',
    proofTitle: 'Сценарии',
    proof: [
      {
        role: 'Коллекционерам',
        quote: 'Хочу, чтобы мой плейлист не зависел от изменений доступа на внешних платформах.',
        stat: 'Файлы принадлежат тебе',
      },
      {
        role: 'Диджеям',
        quote: 'Закинул папку, сразу вижу тональность и BPM. Не надо шазамить каждый трек перед выступлением.',
        stat: 'Вся инфа для сведения',
      },
      {
        role: 'Кто переезжает',
        quote: 'Наконец-то сервис, который не заменяет акустические версии на обычные при переносе.',
        stat: 'Полный контроль',
      },
    ],
    stepsTitle: 'Как это работает',
    steps: [
      { n: '01', title: 'Найти или вставить ссылку', text: 'Закидываешь линк на плейлист из Споти, Яндекса или просто ищешь по названию.' },
      { n: '02', title: 'Проверить совпадения', text: 'Смотришь, насколько точно сервис нашел треки. Правишь руками, если надо.' },
      { n: '03', title: 'Забрать себе', text: 'Качаешь файлы, анализируешь BPM, строишь сеты.' },
    ],
    pricingTitle: 'Цены',
    pricingSub: 'Можно юзать бесплатно. Платишь только если нужно много качать или нужен Hi-Res.',
    billingMonthly: 'Месяц',
    billingAnnual: 'Год',
    billingSave: '−20%',
    pricingCta: 'Выбрать',
    popular: 'Топ',
    platforms: 'Работает с',
    faqEyebrow: 'Помощь',
    faqTitle: 'Частые вопросы',
    faqSub: 'Отвечаем прямо, без маркетингового булшита.',
    faqContactTitle: 'Всё еще думаешь?',
    faqContactSub: 'Попробуй бесплатно. Без привязки карты.',
    faqContactCta: 'Сделать аккаунт',
    faqTelegramTitle: 'Остались вопросы?',
    faqTelegramSub: 'Пиши напрямую в Телегу — отвечу на вопросы, обсудим фичи или промокоды.',
    faqTelegramCta: 'Написать в ТГ',
    faq: [
      {
        q: 'Что именно делает FlacAud?',
        a: 'Помогает собрать нормальную локальную медиатеку: ищешь треки, проверяешь матчи по ссылкам из стримингов, качаешь их в FLAC/Hi‑Res и хранишь файлы у себя на диске.',
      },
      {
        q: 'Откуда можно переносить музло?',
        a: 'Spotify, Яндекс Музыка, VK, Apple Music, YouTube Music, Deezer, SoundCloud, ну и Tidal само собой.',
      },
      {
        q: 'Можно пользоваться без переноса плейлистов?',
        a: 'Да. Можно искать прямо внутри FlacAud, слушать превью в браузере, качать понравившееся и собирать плейлисты вообще без привязки к другим сервисам.',
      },
      {
        q: 'Какие инструменты есть для диджеев?',
        a: 'Показываем BPM и Camelot‑тональность, подсвечиваем совместимые треки для гармоничного сведения и умеем анализировать целые сеты, чтобы планировать скорость и энергию без доп. софта.',
      },
      {
        q: 'Что за «проверка совпадений»?',
        a: 'Когда ты кидаешь плейлист из Споти, мы ищем эти же треки во FLAC и показываем в процентах, насколько уверены, что нашли именно тот ремикс или версию.',
      },
      {
        q: 'Что доступно бесплатно?',
        a: 'Искать можно сколько угодно. Скачивать бесплатно можно до 3 треков в день в CD‑качестве (16bit/44.1kHz).',
      },
    ],
    finalTitle: 'Готов собрать нормальную медиатеку?',
    finalSub: 'Поиск бесконечный, 3 скачивания в день фри. Карта не нужна.',
    foot: 'Free-тариф · 3 трека/день · Никаких скрытых подписок',
  },
};


export const initialLandingLang = () => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('tidal-lang');
      if (stored === 'ru' || stored === 'en') return stored;
      if (navigator.language.toLowerCase().startsWith('ru')) return 'ru';
    } catch { /* ignore */ }
  }
  return 'en';
};

