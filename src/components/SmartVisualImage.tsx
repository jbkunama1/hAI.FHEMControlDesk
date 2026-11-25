import React, {useEffect, useState} from 'react';
import {getRoomFallbackTheme} from '../lib/roomVisuals';

interface SmartVisualImageProps {
  src: string | null;
  alt: string;
  label?: string;
  className?: string;
  imgClassName?: string;
}

export const SmartVisualImage: React.FC<SmartVisualImageProps> = ({
  src,
  alt,
  label = 'Raum',
  className = '',
  imgClassName = '',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const fallback = getRoomFallbackTheme(label);

  if (!src || failed) {
    return (
      <div
        className={`relative overflow-hidden bg-gradient-to-br ${fallback.gradient} ${className}`}
        role="img"
        aria-label={alt}
      >
        {/* Architectural blueprint grid & smart home schematic vector graphic */}
        <svg
          viewBox="0 0 400 225"
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full opacity-55"
          aria-hidden="true"
        >
          <defs>
            <pattern id={`grid-${fallback.kind}`} width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="0.75"
              />
            </pattern>
            <radialGradient id={`glow-${fallback.kind}`} cx="78%" cy="22%" r="60%">
              <stop offset="0%" stopColor={fallback.accentHex} stopOpacity="0.32" />
              <stop offset="100%" stopColor={fallback.accentHex} stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="400" height="225" fill={`url(#grid-${fallback.kind})`} />
          <rect width="400" height="225" fill={`url(#glow-${fallback.kind})`} />

          {fallback.kind === 'tech' ? (
            <g stroke={fallback.accentHex} strokeWidth="1.2" fill="none" opacity="0.65">
              <rect x="230" y="34" width="124" height="140" rx="10" />
              <line x1="246" y1="62" x2="338" y2="62" />
              <line x1="246" y1="92" x2="338" y2="92" />
              <line x1="246" y1="122" x2="338" y2="122" />
              <circle cx="258" cy="48" r="3" fill={fallback.accentHex} />
              <circle cx="272" cy="48" r="3" />
              <circle cx="258" cy="78" r="3" fill={fallback.accentHex} />
              <circle cx="258" cy="108" r="3" fill={fallback.accentHex} />
              <path d="M 160 105 L 230 105" strokeDasharray="4 4" />
              <circle cx="152" cy="105" r="8" />
              <circle cx="152" cy="105" r="18" opacity="0.35" />
            </g>
          ) : fallback.kind === 'hallway' ? (
            <g stroke={fallback.accentHex} strokeWidth="1.25" fill="none" opacity="0.65">
              <path d="M 225 180 L 225 46 L 325 46 L 325 180" />
              <path d="M 248 180 L 248 68 L 302 68 L 302 180" opacity="0.55" />
              <circle cx="292" cy="118" r="3.5" fill={fallback.accentHex} />
              <path d="M 150 180 L 360 180" opacity="0.4" />
              <path d="M 185 88 C 195 72, 210 72, 220 88" opacity="0.45" />
            </g>
          ) : (
            <g stroke={fallback.accentHex} strokeWidth="1.2" fill="none" opacity="0.6">
              <rect x="210" y="38" width="146" height="118" rx="8" />
              <line x1="282" y1="38" x2="282" y2="112" />
              <line x1="210" y1="112" x2="314" y2="112" />
              <path d="M 314 112 A 28 28 0 0 1 342 140" strokeDasharray="3 3" />
              <circle cx="246" cy="74" r="5" fill={fallback.accentHex} opacity="0.85" />
              <circle cx="246" cy="74" r="14" opacity="0.35" />
              <circle cx="318" cy="74" r="4" />
            </g>
          )}
        </svg>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-900 ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${imgClassName}`}
      />
    </div>
  );
};
