import type {ColorThemeId} from '../types/fhem';

export interface ColorThemeDefinition {
  id: ColorThemeId;
  name: string;
  description: string;
  darkCanvas: string;
  lightCanvas: string;
  swatchPrimary: string;
  swatchContainerDark: string;
  swatchContainerLight: string;
  chartHex: string;
}

export const COLOR_THEMES: ColorThemeDefinition[] = [
  {
    id: 'ocean',
    name: 'Ozeanblau',
    description: 'Klassisches Material 3 Schieferblau',
    darkCanvas: '#0E1116',
    lightCanvas: '#F4F6F9',
    swatchPrimary: '#2563EB',
    swatchContainerDark: '#1D3456',
    swatchContainerLight: '#DBEAFE',
    chartHex: '#3B82F6',
  },
  {
    id: 'emerald',
    name: 'Smaragd',
    description: 'Frisches Smart-Home-Grün & Petrol',
    darkCanvas: '#0B1311',
    lightCanvas: '#F2F7F5',
    swatchPrimary: '#059669',
    swatchContainerDark: '#12382D',
    swatchContainerLight: '#D1FAE5',
    chartHex: '#10B981',
  },
  {
    id: 'amber',
    name: 'Bernstein',
    description: 'Warmes Licht-Gold & Graphit',
    darkCanvas: '#13100D',
    lightCanvas: '#F8F5F0',
    swatchPrimary: '#D97706',
    swatchContainerDark: '#3E2B12',
    swatchContainerLight: '#FEF3C7',
    chartHex: '#F59E0B',
  },
  {
    id: 'indigo',
    name: 'Nacht-Indigo',
    description: 'Tiefes Indigo mit kühlem Kontrast',
    darkCanvas: '#0E1019',
    lightCanvas: '#F3F4FA',
    swatchPrimary: '#4F46E5',
    swatchContainerDark: '#23265A',
    swatchContainerLight: '#E0E7FF',
    chartHex: '#6366F1',
  },
  {
    id: 'rose',
    name: 'Rubin',
    description: 'Präzises Karminrot & Rauchgrau',
    darkCanvas: '#140F12',
    lightCanvas: '#F9F4F6',
    swatchPrimary: '#E11D48',
    swatchContainerDark: '#471828',
    swatchContainerLight: '#FFE4E6',
    chartHex: '#F43F5E',
  },
  {
    id: 'graphite',
    name: 'Graphit Mono',
    description: 'Reduziertes Schwarz-Weiß & Stahl',
    darkCanvas: '#0D0F12',
    lightCanvas: '#F5F6F8',
    swatchPrimary: '#475569',
    swatchContainerDark: '#262E3A',
    swatchContainerLight: '#E2E8F0',
    chartHex: '#94A3B8',
  },
];

export function getThemeDefinition(id: ColorThemeId): ColorThemeDefinition {
  return COLOR_THEMES.find((t) => t.id === id) || COLOR_THEMES[0];
}
