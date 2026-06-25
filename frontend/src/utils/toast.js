export const showToast = (message, type = 'info') => {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return;
  const event = new CustomEvent('app-toast', { detail: { message: text, type } });
  window.dispatchEvent(event);
};
