import type { ResourceType } from './types';

// ===========================================================================
// Single shared color source of truth — used by BOTH macro and micro views so
// a deposit's color is identical inside and out (acceptance criteria).
// ===========================================================================

export const COLORS = {
  // Backdrop / grid
  bg: '#f6f6f4',
  gridLine: 'rgba(60,60,70,0.05)', // ~5% contrast, only subtly visible
  gridLineActive: 'rgba(60,60,70,0.12)', // slightly stronger while building

  // City
  city: '#ffb4a2',
  cityCore: '#e5989b',

  // Roads / vehicles
  road: '#c3ccd5',

  // Micro world
  microBg: '#efefed',
  belt: '#4a4e57',
  beltChevron: 'rgba(255,255,255,0.55)',
  warehouse: '#2b2d42',
  warehouseText: '#edf2f4',
  ghostOk: 'rgba(60,180,120,0.45)',
  ghostBad: 'rgba(230,57,70,0.5)',
  danger: '#e63946',
  badge: '#e63946',
} as const;

/** Resource type → fill color. Fixed across both views. */
export const RESOURCE_COLORS: Record<ResourceType, string> = {
  coal: '#8d99ae', // grey
  wood: '#8fae7f', // green
  ore: '#e9c46a', // yellow
};

/** Darker shade of a resource color (for ore veins / accents). */
export const RESOURCE_COLORS_DARK: Record<ResourceType, string> = {
  coal: '#6c7689',
  wood: '#6f8f61',
  ore: '#d4a62f',
};

export const RESOURCE_LABEL: Record<ResourceType, string> = {
  coal: 'Szénbánya',
  wood: 'Favágó telep',
  ore: 'Ércbánya',
};

export const RESOURCE_TYPES: ResourceType[] = ['coal', 'wood', 'ore'];
