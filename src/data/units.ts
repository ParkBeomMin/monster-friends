import type { UnitDef, Placement } from '../engine/types'

// Units the player can place (palette). Original names only, no third-party IP.
export const PLAYER_POOL: UnitDef[] = [
  { id: 'moss-slime', name: '이끼슬라임', role: 'tank', faction: 'mushroom', maxHp: 220, attack: 10, attackInterval: 2 },
  { id: 'cap-shroom', name: '갓버섯', role: 'melee', faction: 'mushroom', maxHp: 120, attack: 26, attackInterval: 2 },
  { id: 'spore-archer', name: '포자궁수', role: 'ranged', faction: 'mushroom', maxHp: 70, attack: 24, attackInterval: 1 },
  { id: 'dew-fairy', name: '이슬요정', role: 'support', faction: 'fairy', maxHp: 80, attack: 18, attackInterval: 2 },
]

// Fixed enemy squad the player faces this build.
export const ENEMY_PLACEMENTS: Placement[] = [
  { def: { id: 'stone-golem', name: '돌골렘', role: 'tank', faction: 'rock', maxHp: 240, attack: 12, attackInterval: 3 }, pos: { row: 'front', col: 1 } },
  { def: { id: 'rock-brawler', name: '바위주먹', role: 'melee', faction: 'rock', maxHp: 130, attack: 24, attackInterval: 2 }, pos: { row: 'front', col: 0 } },
  { def: { id: 'pebble-pixie', name: '조약돌픽시', role: 'ranged', faction: 'fairy', maxHp: 65, attack: 22, attackInterval: 1 }, pos: { row: 'back', col: 1 } },
]
