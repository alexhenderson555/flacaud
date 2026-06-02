import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sliders, X } from 'lucide-react';

export default function Equalizer({ audioCtx, audioRef, onClose }) {
  const [nodes, setNodes] = useState([]);
  const [gains, setGains] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  useEffect(() => {
    if (!audioCtx || !audioRef.current || !audioRef.current._sourceNode) return;

    // Check if we already have EQ nodes attached to audioRef
    if (!audioRef.current._eqNodes) {
      const eqNodes = frequencies.map(freq => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1;
        filter.gain.value = 0;
        return filter;
      });

      // Currently chain is: source -> analyser -> destination
      // We'll insert between source and analyser.
      
      const sourceNode = audioRef.current._sourceNode;
      const analyser = audioRef.current._analyser;
      
      if (sourceNode && analyser) {
        sourceNode.disconnect();
        
        sourceNode.connect(eqNodes[0]);
        for (let i = 0; i < eqNodes.length - 1; i++) {
          eqNodes[i].connect(eqNodes[i + 1]);
        }
        eqNodes[eqNodes.length - 1].connect(analyser);
        
        audioRef.current._eqNodes = eqNodes;
        setNodes(eqNodes);
      }
    } else {
      setNodes(audioRef.current._eqNodes);
      setGains(audioRef.current._eqNodes.map(n => n.gain.value));
    }
  }, [audioCtx, audioRef]);

  const handleGainChange = (index, value) => {
    const newGains = [...gains];
    newGains[index] = value;
    setGains(newGains);
    
    if (nodes[index]) {
      nodes[index].gain.value = value;
    }
  };

  const applyPreset = (preset) => {
    let newGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (preset === 'bass') newGains = [6, 5, 4, 2, 0, -1, -2, 0, 1, 2];
    if (preset === 'vocal') newGains = [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1];
    if (preset === 'electronic') newGains = [5, 4, 2, 0, -2, 0, 1, 3, 4, 5];
    
    setGains(newGains);
    nodes.forEach((n, i) => n.gain.value = newGains[i]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className="glass-panel"
      style={{
        position: 'fixed',
        bottom: '100px',
        right: '24px',
        width: '400px',
        padding: '24px',
        borderRadius: '24px',
        zIndex: 100,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '1.2rem' }}>
          <Sliders size={20} /> Equalizer
        </div>
        <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
        <button onClick={() => applyPreset('flat')} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '0.85rem' }}>Flat</button>
        <button onClick={() => applyPreset('bass')} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '0.85rem' }}>Bass</button>
        <button onClick={() => applyPreset('vocal')} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '0.85rem' }}>Vocal</button>
        <button onClick={() => applyPreset('electronic')} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '0.85rem' }}>Electronic</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', height: '150px' }}>
        {frequencies.map((freq, i) => (
          <div key={freq} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', position: 'relative', width: '20px' }}>
              <input 
                type="range" 
                min="-12" 
                max="12" 
                step="0.1" 
                value={gains[i]} 
                onChange={(e) => handleGainChange(i, parseFloat(e.target.value))}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(-90deg)',
                  width: '120px',
                  height: '4px',
                  accentColor: 'var(--accent-solid)',
                  cursor: 'pointer'
                }}
              />
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {freq >= 1000 ? `${freq/1000}k` : freq}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
