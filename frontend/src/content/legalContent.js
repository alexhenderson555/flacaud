export const legalContent = {
  en: {
    termsTitle: 'Terms of Use',
    privacyTitle: 'Privacy Policy',
    terms: `By using FlacAud, you agree to these terms:

1. FlacAud is intended for personal use. You may not use the service for unlawful distribution, public rebroadcasting, or other prohibited activity.
2. You are responsible for complying with copyright and related laws in your jurisdiction.
3. You are responsible for account security and for all activity under your account.
4. We may limit, suspend, or terminate access in cases of abuse, fraud, credential sharing, automation abuse, or excessive infrastructure load.
5. Paid functionality is provided through FlacAud plans only. Plan limits, features, and billing periods are defined in the current in-app Pricing section.

Technical and security notes:
- Sessions use short-lived access tokens and httpOnly refresh cookies.
- Media and file links use short-lived signed tokens.

Support contact: admin@flacaud.ru`,
    privacy: `Privacy Policy

What we collect:
- Account data: email, hashed password, and basic profile/security fields.
- Product data: library metadata, playlists, preferences, and usage events required to provide features.
- Operational data: technical logs and aggregated service metrics.

What we do not collect/store:
- Plaintext passwords.
- Long-lived refresh credentials in browser-accessible storage.

How we use data:
- To authenticate you, operate FlacAud features, prevent abuse, and improve reliability/performance.

Retention:
- Temporary processing files and signed links are automatically cleaned up (typically within 24 hours).
- You may request account deletion at admin@flacaud.ru.

Session lifetime:
- Access token: about 1 hour.
- Refresh session: up to 30 days.`,
    acceptLabel: 'I accept the Terms of Use and Privacy Policy',
    verifyBanner: 'Please verify your email — check your inbox or resend the link.',
    resendVerify: 'Resend verification email',
  },
  ru: {
    termsTitle: 'Условия использования',
    privacyTitle: 'Политика конфиденциальности',
    terms: `Используя FlacAud, вы принимаете следующие условия:

1. FlacAud предназначен для личного использования. Нельзя использовать сервис для незаконного распространения, публичной ретрансляции или иной запрещённой деятельности.
2. Вы самостоятельно соблюдаете авторское право и смежные нормы в вашей юрисдикции.
3. Вы отвечаете за безопасность аккаунта и все действия, выполненные под ним.
4. Мы можем ограничить, приостановить или прекратить доступ при злоупотреблениях, мошенничестве, передаче доступа третьим лицам, автоматизированной накрутке или чрезмерной нагрузке на инфраструктуру.
5. Платные возможности предоставляются только по тарифам FlacAud. Лимиты, функции и период оплаты указываются в актуальном разделе цен внутри сервиса.

Технические и защитные меры:
- Для сессий используются короткие access-токены и httpOnly refresh-cookie.
- Для медиа и файлов применяются короткоживущие подписанные ссылки.

Контакт для обращений: admin@flacaud.ru`,
    privacy: `Политика конфиденциальности

Что мы собираем:
- Данные аккаунта: email, хэш пароля и базовые поля профиля/безопасности.
- Данные продукта: метаданные библиотеки, плейлисты, настройки и события использования, необходимые для работы функций.
- Операционные данные: технические логи и агрегированные метрики сервиса.

Что мы не собираем/не храним:
- Пароли в открытом виде.
- Долгоживущие refresh-учётные данные в хранилищах, доступных из браузерного JavaScript.

Как используем данные:
- Для аутентификации, работы функций FlacAud, защиты от злоупотреблений и повышения надёжности/производительности.

Сроки хранения:
- Временные файлы обработки и подписанные ссылки очищаются автоматически (обычно в течение 24 часов).
- Запрос на удаление аккаунта: admin@flacaud.ru.

Сессии:
- Access-токен: около 1 часа.
- Refresh-сессия: до 30 дней.`,
    acceptLabel: 'Я принимаю Условия использования и Политику конфиденциальности',
    verifyBanner: 'Подтвердите email — проверьте почту или отправьте письмо снова.',
    resendVerify: 'Отправить письмо снова',
  },
};

export function getLegal(lang, key) {
  const pack = legalContent[lang] || legalContent.en;
  return pack[key] ?? legalContent.en[key];
}
