import type { UnitDef } from '../engine/types'

// attackInterval retained for UnitDef type compatibility; unused by turn-based combat.
function u(id: string, name: string, role: UnitDef['role'], maxHp: number, attack: number): UnitDef {
  return { id, name, role, faction: 'mushroom', maxHp, attack, attackInterval: 1 }
}

// Original names only, no third-party IP.
export const PLAYER_DECK: UnitDef[] = [
  u('moss-slime', '이끼슬라임', 'tank', 60, 8),
  u('moss-slime2', '이끼슬라임', 'tank', 60, 8),
  u('cap-shroom', '갓버섯', 'melee', 35, 16),
  u('cap-shroom2', '갓버섯', 'melee', 35, 16),
  u('spore-archer', '포자궁수', 'ranged', 24, 20),
  u('spore-archer2', '포자궁수', 'ranged', 24, 20),
  u('dew-fairy', '이슬요정', 'support', 30, 14),
  u('thorn-brute', '가시괴물', 'melee', 45, 22),
]

export const ENEMY_DECK: UnitDef[] = [
  u('stone-golem', '돌골렘', 'tank', 70, 9),
  u('stone-golem2', '돌골렘', 'tank', 70, 9),
  u('rock-brawler', '바위주먹', 'melee', 40, 15),
  u('rock-brawler2', '바위주먹', 'melee', 40, 15),
  u('pebble-pixie', '조약돌픽시', 'ranged', 26, 19),
  u('pebble-pixie2', '조약돌픽시', 'ranged', 26, 19),
  u('frost-imp', '서리도깨비', 'support', 28, 13),
  u('boulder-beast', '바위야수', 'melee', 55, 20),
]
