import React from 'react';
import { motion } from 'framer-motion';

const CAMELOT_KEYS = [
  { id: '8B', label: '8B', color: '#E53935' }, // C Major
  { id: '9B', label: '9B', color: '#FB8C00' }, // G Major
  { id: '10B', label: '10B', color: '#FDD835' }, // D Major
  { id: '11B', label: '11B', color: '#8BC34A' }, // A Major
  { id: '12B', label: '12B', color: '#4CAF50' }, // E Major
  { id: '1B', label: '1B', color: '#009688' }, // B Major
  { id: '2B', label: '2B', color: '#00BCD4' }, // F# Major
  { id: '3B', label: '3B', color: '#03A9F4' }, // Db Major
  { id: '4B', label: '4B', color: '#3F51B5' }, // Ab Major
  { id: '5B', label: '5B', color: '#673AB7' }, // Eb Major
  { id: '6B', label: '6B', color: '#9C27B0' }, // Bb Major
  { id: '7B', label: '7B', color: '#E91E63' }, // F Major
];

const CAMELOT_KEYS_MINOR = [
  { id: '8A', label: '8A', color: '#ff706b' }, // A Minor
  { id: '9A', label: '9A', color: '#ffb24a' }, // E Minor
  { id: '10A', label: '10A', color: '#fff461' }, // B Minor
  { id: '11A', label: '11A', color: '#b9f772' }, // F# Minor
  { id: '12A', label: '12A', color: '#79de7d' }, // C# Minor
  { id: '1A', label: '1A', color: '#4ac9bc' }, // G# Minor
  { id: '2A', label: '2A', color: '#55e7fc' }, // D# Minor
  { id: '3A', label: '3A', color: '#5cd5fa' }, // Bb Minor
  { id: '4A', label: '4A', color: '#7a8dfa' }, // F Minor
  { id: '5A', label: '5A', color: '#976dfa' }, // C Minor
  { id: '6A', label: '6A', color: '#da5dfa' }, // G Minor
  { id: '7A', label: '7A', color: '#ff669e' }, // D Minor
];

export default function CamelotWheel({ selectedKey, onSelectKey }) {
  const radiusOuter = 120;
  const radiusInner = 75;
  const center = 150;

  const renderSegments = (keys, radius, isOuter) => {
    return keys.map((k, i) => {
      const angle = (i * 30 - 15) * (Math.PI / 180);
      const nextAngle = ((i + 1) * 30 - 15) * (Math.PI / 180);
      const x1 = center + radius * Math.cos(angle);
      const y1 = center + radius * Math.sin(angle);
      const x2 = center + radius * Math.cos(nextAngle);
      const y2 = center + radius * Math.sin(nextAngle);
      
      const innerRadius = isOuter ? radiusInner : 30;
      const ix1 = center + innerRadius * Math.cos(angle);
      const iy1 = center + innerRadius * Math.sin(angle);
      const ix2 = center + innerRadius * Math.cos(nextAngle);
      const iy2 = center + innerRadius * Math.sin(nextAngle);

      const pathData = `
        M ${x1} ${y1}
        A ${radius} ${radius} 0 0 1 ${x2} ${y2}
        L ${ix2} ${iy2}
        A ${innerRadius} ${innerRadius} 0 0 0 ${ix1} ${iy1}
        Z
      `;

      const textAngle = i * 30 * (Math.PI / 180);
      const textRadius = isOuter ? (radius + radiusInner) / 2 : (radius + 30) / 2;
      const tx = center + textRadius * Math.cos(textAngle);
      const ty = center + textRadius * Math.sin(textAngle);

      const isSelected = selectedKey === k.id;

      return (
        <g key={k.id} onClick={() => onSelectKey(isSelected ? null : k.id)} style={{ cursor: 'pointer' }}>
          <path 
            d={pathData} 
            fill={k.color} 
            opacity={isSelected ? 1 : (selectedKey ? 0.3 : 0.8)}
            stroke="var(--bg-main)" 
            strokeWidth="2"
            style={{ transition: 'opacity 0.2s' }}
            onMouseEnter={(e) => { if (!selectedKey) e.target.setAttribute('opacity', '1') }}
            onMouseLeave={(e) => { if (!selectedKey) e.target.setAttribute('opacity', '0.8') }}
          />
          <text 
            x={tx} y={ty} 
            fill={isOuter ? 'white' : 'black'} 
            fontSize={isOuter ? '14' : '12'} 
            fontWeight="bold" 
            textAnchor="middle" 
            dominantBaseline="middle"
            style={{ pointerEvents: 'none' }}
          >
            {k.label}
          </text>
        </g>
      );
    });
  };

  return (
    <svg width="300" height="300" viewBox="0 0 300 300">
      {renderSegments(CAMELOT_KEYS, radiusOuter, true)}
      {renderSegments(CAMELOT_KEYS_MINOR, radiusInner, false)}
    </svg>
  );
}
