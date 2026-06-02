import React, { useEffect, useRef } from 'react';

export default function AudioVisualizer({ audioRef }) {
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const reqRef = useRef(null);

  useEffect(() => {
    if (!audioRef || !audioRef.current) return;
    
    const initVisualizer = () => {
      try {
        if (audioRef.current._analyser) {
          analyserRef.current = audioRef.current._analyser;
          dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        }
      } catch (err) {
        console.warn("Could not setup visualizer:", err);
      }
    };

    // Try to init immediately, and also when audio starts playing
    initVisualizer();
    audioRef.current.addEventListener('play', initVisualizer);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      reqRef.current = requestAnimationFrame(draw);
      
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      
      const rootStyle = getComputedStyle(document.documentElement);
      let accent = rootStyle.getPropertyValue('--accent-solid').trim() || '#2575fc';
      let transparentAccent = `${accent}40`;
      
      if (accent.startsWith('rgb(')) {
        transparentAccent = accent.replace('rgb(', 'rgba(').replace(')', ', 0.25)');
      }
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const drawBins = Math.floor(bufferLength * 0.75); 
      const barWidth = (width / drawBins);
      
      ctx.shadowBlur = 30;
      ctx.shadowColor = accent;
      
      let x = 0;
      for (let i = 0; i < drawBins; i++) {
        const val = dataArrayRef.current[i];
        const barHeight = (val / 255) * (height * 0.6);
        
        const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, transparentAccent);
        grad.addColorStop(1, accent);
        
        ctx.fillStyle = grad;
        // Draw from the bottom up, leaving a small gap between bars
        ctx.fillRect(x, height - barHeight, barWidth - 4, barHeight);
        
        x += barWidth;
      }
    };

    draw();

    return () => {
      if (reqRef.current) cancelAnimationFrame(reqRef.current);
    };
  }, [audioRef]);

  return (
    <canvas 
      ref={canvasRef} 
      width={1200} 
      height={800} 
      style={{ 
        position: 'fixed', 
        top: 0, left: 0, 
        width: '100vw', height: '100vh', 
        zIndex: 0, 
        opacity: 0.15, // Subtle background opacity
        pointerEvents: 'none',
        transform: 'translateZ(0)'
      }} 
    />
  );
}
