export type PickupId =
  | 'medkit'
  | 'shield'
  | 'haste'
  | 'ammo'
  | 'emp'
  | 'decoy'
  | 'scan'
  | 'doubleDamage';

export type PickupDef = {
  id: PickupId;
  name: string;
  color: string;
  duration?: number;
};

export const PICKUPS: PickupDef[] = [
  { id: 'medkit', name: 'Medkit', color: '#54f0a8' },
  { id: 'shield', name: 'Shield Battery', color: '#7df9ff', duration: 8 },
  { id: 'haste', name: 'Haste Boots', color: '#ffe66d', duration: 6 },
  { id: 'ammo', name: 'Ammo Crate', color: '#ff9f43' },
  { id: 'emp', name: 'EMP Grenade', color: '#c77dff' },
  { id: 'decoy', name: 'Decoy Drone', color: '#a0aec0', duration: 5 },
  { id: 'scan', name: 'Vision Scan', color: '#90cdf4', duration: 7 },
  { id: 'doubleDamage', name: 'Overcharge', color: '#ff2d6a', duration: 5 },
];
