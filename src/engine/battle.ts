import type { UnitDef, TeamId } from './types'
import { makeRng, shuffle, type Rng } from './prng'

export interface BattleUnit {
  instanceId: string
  def: UnitDef
  team: TeamId
  lane: number // 0..lanes-1
  col: number // 0..cols-1, 0 = front (toward center)
  hp: number
  alive: boolean
}

export interface BattleConfig {
  lanes: number
  cols: number
  heroHp: number
  handSize: number
  maxTurns: number
}

export const DEFAULT_CONFIG: BattleConfig = {
  lanes: 4,
  cols: 3,
  heroHp: 120,
  handSize: 4,
  maxTurns: 60,
}

export type BattleEvent =
  | { type: 'deploy'; team: TeamId; instanceId: string; lane: number; col: number }
  | { type: 'attack'; attacker: string; target: string; damage: number; targetHpAfter: number }
  | { type: 'heroDamage'; attacker: string; heroTeam: TeamId; damage: number; heroHpAfter: number }
  | { type: 'death'; instanceId: string }
  | { type: 'end'; winner: TeamId | 'draw' }

export interface BattleState {
  config: BattleConfig
  units: BattleUnit[]
  heroHp: { A: number; B: number }
  hands: { A: UnitDef[]; B: UnitDef[] }
  decks: { A: UnitDef[]; B: UnitDef[] }
  turn: number
  active: TeamId
  winner: TeamId | 'draw' | null
  rng: Rng
  nextInstance: number
}

export function enemyOf(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A'
}

export function createBattle(
  deckA: UnitDef[],
  deckB: UnitDef[],
  seed: number,
  config: BattleConfig = DEFAULT_CONFIG,
): BattleState {
  const rng = makeRng(seed)
  const dA = shuffle(rng, deckA)
  const dB = shuffle(rng, deckB)
  return {
    config,
    units: [],
    heroHp: { A: config.heroHp, B: config.heroHp },
    hands: { A: dA.slice(0, config.handSize), B: dB.slice(0, config.handSize) },
    decks: { A: dA.slice(config.handSize), B: dB.slice(config.handSize) },
    turn: 1,
    active: 'A',
    winner: null,
    rng,
    nextInstance: 0,
  }
}

export function emptyCells(state: BattleState, team: TeamId): { lane: number; col: number }[] {
  const cells: { lane: number; col: number }[] = []
  for (let lane = 0; lane < state.config.lanes; lane++) {
    for (let col = 0; col < state.config.cols; col++) {
      const taken = state.units.some(
        (u) => u.alive && u.team === team && u.lane === lane && u.col === col,
      )
      if (!taken) cells.push({ lane, col })
    }
  }
  return cells
}

export function frontmostEnemy(state: BattleState, team: TeamId, lane: number): BattleUnit | null {
  const foes = state.units
    .filter((u) => u.alive && u.team === enemyOf(team) && u.lane === lane)
    .sort((a, b) => a.col - b.col)
  return foes[0] ?? null
}
