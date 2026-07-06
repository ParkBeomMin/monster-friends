import type { UnitDef } from '../engine/types'

function m(
  id: string, name: string, faction: UnitDef['faction'], role: UnitDef['role'],
  rarity: UnitDef['rarity'], maxHp: number, attack: number,
): UnitDef {
  return { id, name, faction, role, rarity, maxHp, attack, attackInterval: 1 }
}

export const ROSTER: UnitDef[] = [
  // 🍄 mushroom
  m('moss-slime', '이끼슬라임', 'mushroom', 'tank', 'common', 60, 8),
  m('cap-shroom', '갓버섯', 'mushroom', 'melee', 'common', 34, 16),
  m('spore-archer', '포자궁수', 'mushroom', 'ranged', 'rare', 24, 20),
  m('dew-fairy-m', '이슬요정', 'mushroom', 'support', 'rare', 30, 14),
  // 🪨 rock
  m('stone-golem', '돌골렘', 'rock', 'tank', 'common', 72, 9),
  m('rock-brawler', '바위주먹', 'rock', 'melee', 'common', 40, 15),
  m('sling-gnome', '투석노움', 'rock', 'ranged', 'rare', 26, 19),
  m('boulder-titan', '바위거신', 'rock', 'tank', 'epic', 95, 12),
  // ⚙️ toy
  m('tin-guard', '양철수문장', 'toy', 'tank', 'common', 64, 8),
  m('wind-up-bear', '태엽곰', 'toy', 'melee', 'rare', 42, 18),
  m('dart-doll', '다트인형', 'toy', 'ranged', 'common', 22, 17),
  m('gear-oracle', '톱니현자', 'toy', 'support', 'epic', 34, 16),
  // ❄️ snow
  m('snow-sentinel', '눈파수꾼', 'snow', 'tank', 'common', 66, 9),
  m('icicle-lancer', '고드름창병', 'snow', 'melee', 'rare', 38, 19),
  m('frost-imp', '서리도깨비', 'snow', 'ranged', 'common', 24, 18),
  m('blizzard-elder', '눈보라장로', 'snow', 'support', 'legendary', 40, 22),
  // 🧚 fairy
  m('pebble-pixie', '조약돌픽시', 'fairy', 'ranged', 'common', 26, 19),
  m('thorn-sprite', '가시정령', 'fairy', 'melee', 'common', 36, 17),
  m('bloom-guardian', '개화수호정', 'fairy', 'tank', 'rare', 62, 10),
  m('moon-priestess', '달빛무녀', 'fairy', 'support', 'epic', 34, 18),
]

const byId = (id: string): UnitDef => {
  const found = ROSTER.find((u) => u.id === id)
  if (!found) throw new Error(`unknown roster id: ${id}`)
  return found
}

// 8-card decks drawn from the roster.
export const PLAYER_DECK: UnitDef[] = [
  byId('moss-slime'), byId('cap-shroom'), byId('spore-archer'), byId('dew-fairy-m'),
  byId('thorn-sprite'), byId('bloom-guardian'), byId('icicle-lancer'), byId('gear-oracle'),
]
export const ENEMY_DECK: UnitDef[] = [
  byId('stone-golem'), byId('rock-brawler'), byId('sling-gnome'), byId('boulder-titan'),
  byId('tin-guard'), byId('wind-up-bear'), byId('dart-doll'), byId('frost-imp'),
]
