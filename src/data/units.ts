import type { UnitDef } from '../engine/types'

// Original names only — no third-party IP. Placeholder stats for the demo.
export const DEMO_TEAM_A: UnitDef[] = [
  { id: 'moss-slime', name: '이끼슬라임', role: 'tank', faction: 'mushroom', maxHp: 140, attack: 12, attackInterval: 2 },
  { id: 'cap-shroom', name: '갓버섯', role: 'melee', faction: 'mushroom', maxHp: 90, attack: 26, attackInterval: 2 },
  { id: 'spore-shooter', name: '포자궁수', role: 'ranged', faction: 'mushroom', maxHp: 60, attack: 20, attackInterval: 1 },
]

export const DEMO_TEAM_B: UnitDef[] = [
  { id: 'stone-golem', name: '돌골렘', role: 'tank', faction: 'rock', maxHp: 160, attack: 14, attackInterval: 3 },
  { id: 'rock-brawler', name: '바위주먹', role: 'melee', faction: 'rock', maxHp: 100, attack: 24, attackInterval: 2 },
  { id: 'pebble-pixie', name: '조약돌픽시', role: 'ranged', faction: 'fairy', maxHp: 55, attack: 22, attackInterval: 1 },
]
