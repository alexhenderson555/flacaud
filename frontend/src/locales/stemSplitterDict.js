/** Stem Splitter page copy (en/ru). */

export const stemSplitterDict = {
  en: {
    title: 'Stem',
    titleBold: 'Splitter',
    desc: 'Extract vocals and instrumentals from any Tidal track using AI (Demucs).',
    placeholder: 'Paste Tidal track URL here…',
    splitTrack: 'Split Track',
    splitting: 'Splitting…',
    splitStarted: 'Stem split started — see progress bottom-right',
    jobTimeout: 'Job timed out — check that the worker is running',
    jobFailed: 'Job failed',
    splitResults: 'Split Results',
    vocals: 'Vocals',
    instrumental: 'Instrumental',
    readyDownload: 'Ready to download',
    downloadFlac: 'Download FLAC',
  },
  ru: {
    title: 'Стем',
    titleBold: 'Сплиттер',
    desc: 'Отделите вокал и инструментал от любого трека Tidal с помощью AI (Demucs).',
    placeholder: 'Вставьте ссылку на трек Tidal…',
    splitTrack: 'Разделить трек',
    splitting: 'Разделение…',
    splitStarted: 'Разделение стемов запущено — прогресс внизу справа',
    jobTimeout: 'Таймаут задачи — проверьте, что worker запущен',
    jobFailed: 'Задача не удалась',
    splitResults: 'Результаты',
    vocals: 'Вокал',
    instrumental: 'Инструментал',
    readyDownload: 'Готово к скачиванию',
    downloadFlac: 'Скачать FLAC',
  },
};

export function tStem(key, lang = 'en') {
  return stemSplitterDict[lang]?.[key] || stemSplitterDict.en[key] || key;
}
