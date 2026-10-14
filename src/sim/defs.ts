// Static industry / cargo definitions (SPEC 6).

import { CARGO_COLOR, PALETTE } from '../constants';
import type { Cargo, IndustryKind } from '../types';

export interface IndustryDef {
  label: string;
  primary: boolean;
  produces: Cargo | null;
  accepts: readonly Cargo[];
  color: string;
}

export const INDUSTRY_DEFS: Record<IndustryKind, IndustryDef> = {
  coalMine: { label: 'Szénbánya', primary: true, produces: 'coal', accepts: [], color: CARGO_COLOR.coal },
  oreMine: { label: 'Ércbánya', primary: true, produces: 'ore', accepts: [], color: CARGO_COLOR.ore },
  forest: { label: 'Erdészet', primary: true, produces: 'wood', accepts: [], color: CARGO_COLOR.wood },
  powerPlant: { label: 'Erőmű', primary: false, produces: null, accepts: ['coal'], color: PALETTE.powerPlant },
  steelMill: { label: 'Vasmű', primary: false, produces: 'steel', accepts: ['ore'], color: CARGO_COLOR.steel },
  factory: { label: 'Gyár', primary: false, produces: 'goods', accepts: ['steel', 'wood'], color: CARGO_COLOR.goods },
};

export const INDUSTRY_ORDER: readonly IndustryKind[] = [
  'coalMine', 'oreMine', 'forest', 'powerPlant', 'steelMill', 'factory',
];

export const CARGO_LABEL: Record<Cargo, string> = {
  coal: 'Szén',
  ore: 'Érc',
  wood: 'Fa',
  steel: 'Acél',
  goods: 'Áru',
};

export const TOWN_NAMES: readonly string[] = [
  'Kisvárda', 'Nagyrét', 'Hegyalja', 'Tópart', 'Szilas', 'Fenyves',
  'Dombóvég', 'Ercsény', 'Bükkös', 'Révfalu', 'Malomszeg', 'Vasvölgy',
];

export function emptyCargoRecord(): Record<Cargo, number> {
  return { coal: 0, ore: 0, wood: 0, steel: 0, goods: 0 };
}
