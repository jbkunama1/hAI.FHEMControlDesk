import {useEffect, useState} from 'react';
import type {ViewMode} from '../types/fhem';

export interface DeviceViewportInfo {
  width: number;
  isPhoneScreen: boolean;
  detectedLayout: 'mobile' | 'desktop';
  effectiveLayout: 'mobile' | 'desktop';
  isMobileView: boolean;
}

const MOBILE_BREAKPOINT_PX = 1024;
const PHONE_BREAKPOINT_PX = 640;

function readViewportWidth(): number {
  if (typeof window === 'undefined') return 1280;
  return window.innerWidth;
}

export function useDeviceViewport(viewMode: ViewMode = 'auto'): DeviceViewportInfo {
  const [width, setWidth] = useState<number>(readViewportWidth);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId: number | null = null;

    const handleResize = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        setWidth(window.innerWidth);
        rafId = null;
      });
    };

    window.addEventListener('resize', handleResize, {passive: true});
    window.addEventListener('orientationchange', handleResize, {passive: true});
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const detectedLayout: 'mobile' | 'desktop' = width < MOBILE_BREAKPOINT_PX ? 'mobile' : 'desktop';
  const effectiveLayout: 'mobile' | 'desktop' =
    viewMode === 'mobile' ? 'mobile' : viewMode === 'desktop' ? 'desktop' : detectedLayout;

  return {
    width,
    isPhoneScreen: width < PHONE_BREAKPOINT_PX || viewMode === 'mobile',
    detectedLayout,
    effectiveLayout,
    isMobileView: effectiveLayout === 'mobile',
  };
}
