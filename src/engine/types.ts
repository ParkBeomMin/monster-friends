export type Role = 'tank' | 'melee' | 'ranged' | 'support'
export type Faction = 'mushroom' | 'fairy' | 'rock' | 'toy' | 'snow'
export type TeamId = 'A' | 'B'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface UnitDef {
  id: string
  name: string
  role: Role
  faction: Faction
  maxHp: number
  attack: number
  attackInterval: number // ticks between attacks, must be >= 1
  rarity?: Rarity
}
