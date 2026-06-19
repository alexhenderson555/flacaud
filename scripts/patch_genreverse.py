import re

with open("frontend/src/pages/Genreverse.jsx", "r", encoding="utf-8") as f:
    code = f.read()

with open("scripts/new_universe.txt", "r", encoding="utf-8") as f:
    new_universe = f.read()

# 1. Update imports
new_imports = "import { Radio as RadioIcon, Play, Loader2, ChevronRight, X, RefreshCcw, Cpu, Guitar, Flame, Mic2, Star, Heart, Music, Sun, Feather, Tent, Globe, Coffee } from 'lucide-react';"
code = re.sub(r"import \{ Radio as RadioIcon, Play, Loader2, ChevronRight, X, RefreshCcw \} from 'lucide-react';", new_imports, code)

# 2. Replace GENRE_UNIVERSE
code = re.sub(r"const GENRE_UNIVERSE = \[.*?\];", new_universe.strip(), code, flags=re.DOTALL)

# 3. Update GenreCard mapping
genre_card_old = r"""                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  boxShadow: '0 10px 30px rgba\(0,0,0,0\.3\)',
                  background: '#111',
                  border: '1px solid rgba\(255,255,255,0\.05\)'
                }}
              >
                \{\/\* Base color \*\/\}
                <div style=\{\{
                  position: 'absolute',
                  inset: 0,
                  background: g\.color,
                  opacity: 0\.8,
                  filter: 'saturate\(1\.2\)',
                  transition: 'opacity 0\.3s ease',
                \}\} className="genre-card-bg" \/>

                \{\/\* Image as abstract texture \*\/\}
                \{g\.image && \(
                  <div style=\{\{
                    position: 'absolute',
                    inset: '-20px', \/\/ Expand to hide blur edges
                    backgroundImage: `url\(\$\{g\.image\}\)`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur\(16px\) saturate\(1\.5\)',
                    opacity: 0\.5,
                    mixBlendMode: 'overlay',
                    transition: 'transform 0\.4s ease',
                  \}\} className="genre-card-img" \/>
                \)\}
                
                \{\/\* Gradient overlay for depth \*\/\}
                <div style=\{\{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient\(to bottom, rgba\(0,0,0,0\) 0%, rgba\(0,0,0,0\.7\) 100%\)',
                \}\} \/>

                <div style=\{\{
                  position: 'absolute',
                  bottom: '24px',
                  left: '24px',
                  right: '24px',
                  display: 'flex',
                  alignItems: 'flex-end',
                \}\}>
                  <span style=\{\{
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: '1\.6rem',
                    lineHeight: '1\.2',
                    letterSpacing: '-0\.5px',
                    textShadow: '0 2px 10px rgba\(0,0,0,0\.5\)',
                    fontFamily: '"Inter", sans-serif'
                  \}\}>
                    \{g\.name\}
                  <\/span>
                <\/div>"""

genre_card_new = """                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '24px',
                  transition: 'border-color 0.3s ease, transform 0.3s ease'
                }}
                className="genre-card-minimal"
              >
                {/* Minimalist Theme Background */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(circle at top left, var(--accent-glow) 0%, transparent 60%)',
                  opacity: 0.05,
                  transition: 'opacity 0.3s ease'
                }} className="genre-card-bg" />

                {/* Genre Element Icon */}
                <div style={{
                  position: 'absolute',
                  right: '-10%',
                  bottom: '-10%',
                  color: 'var(--text-secondary)',
                  opacity: 0.1,
                  transform: 'rotate(-15deg)',
                  pointerEvents: 'none'
                }}>
                  {g.icon && <g.icon size={160} />}
                </div>

                <div style={{ zIndex: 1 }}>
                  {g.icon && <g.icon size={32} color="var(--accent-solid)" style={{ marginBottom: '16px' }} />}
                </div>

                <div style={{ zIndex: 1 }}>
                  <span style={{
                    color: 'var(--text-primary)',
                    fontWeight: '700',
                    fontSize: '1.4rem',
                    lineHeight: '1.2',
                    letterSpacing: '-0.5px',
                    fontFamily: '"Inter", sans-serif'
                  }}>
                    {g.name}
                  </span>
                </div>"""

code = re.sub(genre_card_old, genre_card_new, code)

# 4. Update Active Genre Banner
active_genre_old = r"""              style=\{\{
                background: activeGenre\.color,
                borderRadius: '30px',
                padding: '40px',
                marginBottom: '32px',
                boxShadow: '0 20px 40px rgba\(0,0,0,0\.3\)',
                position: 'relative',
                overflow: 'hidden'
              \}\}
            >
              <div style=\{\{ position: 'relative', zIndex: 1 \}\}>
                <h2 style=\{\{ fontSize: '3rem', margin: '0 0 20px 0', color: \['jazz', 'classical', 'country'\]\.includes\(activeGenre\.id\) \? '#222' : '#fff', textShadow: \['jazz', 'classical', 'country'\]\.includes\(activeGenre\.id\) \? 'none' : '0 2px 10px rgba\(0,0,0,0\.2\)' \}\}>
                  \{activeGenre\.name\}
                <\/h2>
                <motion\.button
                  whileHover=\{\{ scale: 1\.05 \}\}
                  whileTap=\{\{ scale: 0\.95 \}\}
                  onClick=\{\(\) => generateVibe\(activeGenre\.name\)\}
                  disabled=\{isGenerating\}
                  style=\{\{
                    background: \['jazz', 'classical', 'country'\]\.includes\(activeGenre\.id\) \? 'rgba\(0,0,0,0\.8\)' : 'rgba\(255,255,255,0\.2\)',
                    backdropFilter: 'blur\(10px\)',
                    border: '1px solid ' \+ \(\['jazz', 'classical', 'country'\]\.includes\(activeGenre\.id\) \? 'rgba\(0,0,0,0\.1\)' : 'rgba\(255,255,255,0\.3\)'\),
                    color: \['jazz', 'classical', 'country'\]\.includes\(activeGenre\.id\) \? '#fff' : '#fff',"""

active_genre_new = """              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '30px',
                padding: '40px',
                marginBottom: '32px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                gap: '24px'
              }}
            >
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at right, var(--accent-glow) 0%, transparent 60%)',
                opacity: 0.1,
              }} />
              
              <div style={{ position: 'relative', zIndex: 1, color: 'var(--accent-solid)', display: 'flex', alignItems: 'center' }}>
                 {activeGenre.icon && <activeGenre.icon size={80} />}
              </div>

              <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
                <h2 style={{ fontSize: '3rem', margin: '0 0 20px 0', color: 'var(--text-primary)' }}>
                  {activeGenre.name}
                </h2>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => generateVibe(activeGenre.name)}
                  disabled={isGenerating}
                  style={{
                    background: 'var(--accent-solid)',
                    border: 'none',
                    color: '#fff',"""

code = re.sub(active_genre_old, active_genre_new, code)

# 5. Fix subtle colored glow below active genre subgenres
sub_glow_old = r"""                  \{/\* subtle colored glow based on parent genre \*/\}
                  \{\!subImage && \(
                  <div style=\{\{
                    position: 'absolute',
                    bottom: '-20px',
                    right: '-20px',
                    width: '80px',
                    height: '80px',
                    background: activeGenre\.color,
                    filter: 'blur\(30px\)',
                    opacity: 0\.3,
                    borderRadius: '50%',
                    zIndex: 0
                  \}\} />
                  \)\}"""

sub_glow_new = """                  {/* subtle colored glow based on theme */}
                  {!subImage && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-20px',
                    right: '-20px',
                    width: '80px',
                    height: '80px',
                    background: 'var(--accent-solid)',
                    filter: 'blur(30px)',
                    opacity: 0.15,
                    borderRadius: '50%',
                    zIndex: 0
                  }} />
                  )}"""

code = re.sub(sub_glow_old, sub_glow_new, code)

with open("frontend/src/pages/Genreverse.jsx", "w", encoding="utf-8") as f:
    f.write(code)
