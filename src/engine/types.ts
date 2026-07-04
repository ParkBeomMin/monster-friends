export type Role = 'tank' | 'melee' | 'ranged' | 'support'
export type Faction = 'mushroom' | 'fairy' | 'rock' | 'toy' | 'snow'
export type TeamId = 'A' | 'B'

export interface UnitDef {
  id: string
  name: string
  role: Role
  faction: Faction
  maxHp: number
  attack: number
  attackInterval: number // ticks between attacks, must be >= 1
}

export interface UnitState {
  instanceId: string // unique per battle, format: `${team}#${slot}`
  def: UnitDef
  team: TeamId
  slot: number
  hp: number
  cooldown: number // ticks remaining until next attack
  alive: boolean
}

export type BattleEvent =
  | {
      type: 'attack'
      tick: number
      attacker: string // instanceId
      target: string // instanceId
      damage: number
      targetHpAfter: number
    }
  | { type: 'death'; tick: number; unit: string }
  | { type: 'end'; tick: number; winner: TeamId | 'draw' }

export interface BattleResult {
  winner: TeamId | 'draw'
  ticks: number
  events: BattleEvent[]
}
