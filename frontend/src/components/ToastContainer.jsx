import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, ...e.detail }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
    };
    window.addEventListener('app-toast', handleToast);
    return () => window.removeEventListener('app-toast', handleToast);
  }, []);

  return (
    <div style={{ position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 10001, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ 
              background: t.type === 'error' ? 'var(--error, #ef4444)' : 'var(--bg-surface)', 
              color: t.type === 'error' ? 'white' : 'var(--text-primary)',
              padding: '12px 24px', 
              borderRadius: '8px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.9rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
