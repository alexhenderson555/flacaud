import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, User, HardDrive, Shield, Zap, Palette, Activity, History, LogIn, Mail, Globe } from 'lucide-react';
import UpgradeModal from '../components/UpgradeModal';

const dict = {
  en: {
    account: 'Your',
    accountBold: 'Account',
    accountDesc: 'Manage your subscription, downloads, and preferences.',
    downloads: 'Downloads Today',
    nextBilling: 'Next Billing Date',
    upgrade: 'Upgrade Plan',
    welcome: 'Welcome!',
    loginDesc: 'Log in to access high-res downloads, create playlists, and save your preferences.',
    loginTg: 'Login with Telegram',
    loginGo: 'Login with Google',
    loginEm: 'Continue with Email',
    defAudio: 'Default Audio Quality',
    dlHistory: 'Download History',
    dlDesc: 'View your previously requested tracks',
    bgVis: 'Background Visualizer',
    bgDesc: 'Classic EQ bars reacting to music',
    bgDesc: 'Classic EQ bars reacting to music',
    appearance: 'Appearance',
    appDesc: 'Choose your visual aesthetic',
    langTitle: 'Language',
    langDesc: 'Choose your interface language',
    volNorm: 'Volume Normalization',
    volDesc: 'Auto Gain Control (keeps all tracks at same loudness)',
    billingDate: 'June 30, 2026',
    themeOcean: 'Ocean Blue',
    themePurple: 'Cyber Purple',
    themeCrimson: 'Crimson Red',
    themeEmerald: 'Emerald Green'
  },
  ru: {
    account: 'Ваш',
    accountBold: 'Профиль',
    accountDesc: 'Управляйте подпиской, загрузками и настройками.',
    downloads: 'Скачано сегодня',
    nextBilling: 'Следующее списание',
    upgrade: 'Улучшить план',
    welcome: 'Добро пожаловать!',
    loginDesc: 'Войдите, чтобы скачивать в высоком качестве, создавать плейлисты и сохранять настройки.',
    loginTg: 'Войти через Telegram',
    loginGo: 'Войти через Google',
    loginEm: 'Продолжить по Email',
    defAudio: 'Качество по умолчанию',
    dlHistory: 'История скачиваний',
    dlDesc: 'Посмотреть ранее скачанные треки',
    bgVis: 'Визуализатор',
    bgDesc: 'Классический EQ, реагирующий на музыку',
    bgDesc: 'Классический EQ, реагирующий на музыку',
    appearance: 'Оформление',
    appDesc: 'Выберите визуальный стиль',
    langTitle: 'Язык',
    langDesc: 'Выберите язык интерфейса',
    volNorm: 'Нормализация громкости',
    volDesc: 'Автоматически выравнивает громкость всех треков (Auto Gain Control)',
    billingDate: '30 Июня 2026',
    themeOcean: 'Океанский Синий',
    themePurple: 'Кибер-Пурпур',
    themeCrimson: 'Багровый',
    themeEmerald: 'Изумрудный'
  }
};

export default function Account() {
  const { theme, setTheme, visualizerEnabled, setVisualizerEnabled, playbackQuality, setPlaybackQuality, lang, setLang } = useOutletContext();
  const t = (key) => dict[lang][key] || key;
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userData, setUserData] = useState(null);

  const checkAuth = async () => {
    const token = localStorage.getItem('tidal-token');
    if (!token) {
      setIsLoggedIn(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserData(data);
        setIsLoggedIn(true);
      } else if (res.status === 401) {
        setIsLoggedIn(false);
        localStorage.removeItem('tidal-token');
      }
    } catch (e) {
      // Network error, assume logged in if we have a token
      setIsLoggedIn(true);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleAuth = async () => {
    setAuthError('');
    if (!username || !password || (isRegistering && !email)) {
      setAuthError('Please fill in all fields');
      return;
    }
    
    try {
      if (isRegistering) {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, username, password })
        });
        if (!res.ok) {
          const data = await res.json();
          setAuthError(data.detail || 'Registration failed');
          return;
        }
      }
      
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setAuthError(errData.detail || 'Invalid credentials');
        return;
      }

      const data = await res.json();
      localStorage.setItem('tidal-token', data.access_token);
      localStorage.setItem('tidal-user', data.username);
      setIsLoggedIn(true);
      
    } catch (err) {
      setAuthError('Network error');
    }
  };
  
  const handleLogout = () => {
    localStorage.removeItem('tidal-token');
    localStorage.removeItem('tidal-user');
    setIsLoggedIn(false);
  };

  const emojis = ['😎', '👽', '🦊', '🎧', '🚀', '👾', '🔥', '🥷'];
  const [avatar, setAvatar] = useState('😎');
  const cycleAvatar = () => setAvatar(emojis[(emojis.indexOf(avatar) + 1) % emojis.length]);

  return (
    <div style={{ paddingBottom: '40px' }}>
      <AnimatePresence>
        {isUpgradeOpen && <UpgradeModal onClose={() => setIsUpgradeOpen(false)} lang={lang} />}
      </AnimatePresence>
      
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{ marginBottom: '40px' }}
      >
        <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{t('account')} <span className="text-gradient">{t('accountBold')}</span></h1>
        <p style={{ color: 'var(--text-secondary)' }}>{t('accountDesc')}</p>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxWidth: '1000px' }}>
        {/* LEFT COLUMN: Account & Audio */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          {/* Profile Card */}
          <div className="glass-panel" style={{ padding: '32px', borderRadius: '24px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)', opacity: 0.3 }}></div>
          
          {isLoggedIn ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
                <div 
                  onClick={cycleAvatar}
                  style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--accent-solid)', cursor: 'pointer', transition: 'transform 0.2s', userSelect: 'none' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  title="Change avatar"
                >
                  <span style={{ fontSize: '2.5rem' }}>{avatar}</span>
                </div>
                <div>
                  <h2 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{userData?.username || localStorage.getItem('tidal-user') || 'User'}</h2>
                  <div style={{ color: 'var(--accent-solid)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase' }}>
                    <Shield size={16} />
                    {userData?.effective_plan || 'FREE'} Plan
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('downloads')}</span>
                  <span style={{ fontWeight: 600 }}>{userData?.downloads_today || 0} <span style={{ color: 'var(--text-muted)' }}>/ {userData?.daily_limit || 3}</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('nextBilling')}</span>
                  <span style={{ fontWeight: 600 }}>{t('billingDate')}</span>
                </div>
              </div>

              <button className="btn-primary" onClick={() => setIsUpgradeOpen(true)} style={{ width: '100%', marginTop: '32px' }}>
                {t('upgrade')}
              </button>
              <button className="btn-secondary" onClick={handleLogout} style={{ width: '100%', marginTop: '12px' }}>
                Log out
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: '16px', padding: '20px 0' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(37, 117, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-solid)', marginBottom: '8px' }}>
                <LogIn size={32} />
              </div>
              <h2 style={{ margin: 0 }}>{isRegistering ? 'Create Account' : t('welcome')}</h2>
              
              {authError && <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{authError}</div>}
              
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                {isRegistering && (
                  <input 
                    type="email" 
                    placeholder="Email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', color: 'white' }}
                  />
                )}
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', color: 'white' }}
                />
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', color: 'white' }}
                />
                <button className="btn-primary" onClick={handleAuth} style={{ width: '100%', padding: '12px', marginTop: '8px' }}>
                  {isRegistering ? 'Sign Up' : 'Log In'}
                </button>
                <div onClick={() => setIsRegistering(!isRegistering)} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer', marginTop: '8px' }}>
                  {isRegistering ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
                </div>
              </div>
            </div>
          )}
          </div>
          {/* Default Audio Quality */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(37, 117, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-solid)' }}>
              <Settings size={24} />
            </div>
            <div style={{ width: '100%' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>{t('defAudio')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { id: 'LOW', label: 'Low', desc: '96kbps AAC', icon: '📻' },
                  { id: 'HIGH', label: 'High', desc: '320kbps AAC', icon: '🎧' },
                  { id: 'LOSSLESS', label: 'Lossless', desc: 'FLAC 16-bit', icon: '💿' },
                  { id: 'HI_RES', label: 'Max', desc: 'FLAC 24-bit', icon: '✨' }
                ].map(q => (
                  <div
                    key={q.id}
                    onClick={() => setPlaybackQuality(q.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 16px', borderRadius: '12px',
                      background: playbackQuality === q.id ? 'var(--accent-glow)' : 'var(--bg-surface-hover)',
                      border: playbackQuality === q.id ? '1px solid var(--accent-solid)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      boxShadow: playbackQuality === q.id ? '0 0 12px var(--accent-glow)' : 'none'
                    }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>{q.icon}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontWeight: playbackQuality === q.id ? 700 : 500, color: playbackQuality === q.id ? 'white' : 'var(--text-primary)' }}>{q.label}</div>
                      <div style={{ fontSize: '0.75rem', marginTop: '2px', color: playbackQuality === q.id ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)' }}>{q.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Download History */}
          <div className="glass-panel" onClick={() => alert(lang === 'ru' ? "История скачиваний в разработке! Вы можете найти скачанные треки в локальной папке 'downloads'." : "Download history is coming soon! You can find all downloaded files in your local 'downloads' folder.")} style={{ padding: '24px', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255, 179, 0, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warning)' }}>
              <History size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('dlHistory')}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('dlDesc')}</p>
            </div>
          </div>
        </motion.div>

        {/* RIGHT COLUMN: UI & Display */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(37, 117, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-solid)' }}>
                <Activity size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('bgVis')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('bgDesc')}</p>
              </div>
            </div>
            <button 
              onClick={() => setVisualizerEnabled(!visualizerEnabled)}
              style={{ background: visualizerEnabled ? 'var(--accent-solid)' : 'var(--bg-surface-hover)', color: 'white', border: 'none', padding: '8px 24px', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s ease', fontWeight: 600 }}
            >
              {visualizerEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Themes */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(156, 39, 176, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9c27b0' }}>
                <Palette size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('appearance')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('appDesc')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {[
                { id: 'dark', label: 'Dark', color: '#1a1a2e' },
                { id: 'ocean', label: t('themeOcean'), color: '#0f2027' },
                { id: 'purple', label: t('themePurple'), color: '#1f1c2c' },
                { id: 'crimson', label: t('themeCrimson'), color: '#2b1010' },
                { id: 'emerald', label: t('themeEmerald'), color: '#092015' }
              ].map(th => (
                <div
                  key={th.id}
                  onClick={() => setTheme(th.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 16px', borderRadius: '12px',
                    background: theme === th.id ? 'var(--accent-glow)' : 'var(--bg-surface-hover)',
                    border: theme === th.id ? '1px solid var(--accent-solid)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    boxShadow: theme === th.id ? '0 0 12px var(--accent-glow)' : 'none'
                  }}
                >
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: th.color, border: '2px solid rgba(255,255,255,0.2)' }} />
                  <span style={{ fontSize: '0.95rem', fontWeight: theme === th.id ? 600 : 400, color: theme === th.id ? 'white' : 'var(--text-primary)' }}>{th.label}</span>
                </div>
              ))}
            </div>
          </div>


          {/* Language Switcher */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(0, 200, 83, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c853' }}>
                <Globe size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{t('langTitle')}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('langDesc')}</p>
              </div>
            </div>
            <div style={{ display: 'flex', background: 'var(--bg-surface-hover)', borderRadius: '12px', padding: '4px' }}>
              <button 
                onClick={() => setLang('en')}
                style={{ background: lang === 'en' ? 'var(--accent-solid)' : 'transparent', color: lang === 'en' ? 'white' : 'var(--text-secondary)', border: 'none', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600 }}
              >
                EN
              </button>
              <button 
                onClick={() => setLang('ru')}
                style={{ background: lang === 'ru' ? 'var(--accent-solid)' : 'transparent', color: lang === 'ru' ? 'white' : 'var(--text-secondary)', border: 'none', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: 600 }}
              >
                RU
              </button>
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
