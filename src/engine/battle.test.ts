import { describe, it, expect } from 'vitest'
import { createBattle, emptyCells, DEFAULT_CONFIG } from './battle'
import type { UnitDef } from './types'

function unit(id: string, maxHp: number, attack: number): UnitDef {
  return { id, name: id, role: 'melee', faction: 'mushroom', maxHp, attack, attackInterval: 1 }
}
const deck = (n: number): UnitDef[] => Array.from({ length: n }, (_, i) => unit(`u${i}`, 10 + i, 5))

describe('createBattle', () => {
  it('draws handSize cards into each hand and keeps the rest in deck', () => {
    const s = createBattle(deck(8), deck(8), 1)
    expect(s.hands.A).toHaveLength(DEFAULT_CONFIG.handSize)
    expect(s.hands.B).toHaveLength(DEFAULT_CONFIG.handSize)
    expect(s.decks.A).toHaveLength(8 - DEFAULT_CONFIG.handSize)
  })

  it('sets both hero HP to config and A active on turn 1', () => {
    const s = createBattle(deck(8), deck(8), 1)
    expect(s.heroHp.A).toBe(DEFAULT_CONFIG.heroHp)
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp)
    expect(s.active).toBe('A')
    expect(s.turn).toBe(1)
    expect(s.winner).toBeNull()
  })

  it('is deterministic — same seed gives identical hands', () => {
    const a = createBattle(deck(8), deck(8), 123)
    const b = createBattle(deck(8), deck(8), 123)
    expect(a.hands.A.map((u) => u.id)).toEqual(b.hands.A.map((u) => u.id))
    expect(a.hands.B.map((u) => u.id)).toEqual(b.hands.B.map((u) => u.id))
  })

  it('emptyCells lists every cell when the board is empty', () => {
    const s = createBattle(deck(8), deck(8), 1)
    expect(emptyCells(s, 'A')).toHaveLength(DEFAULT_CONFIG.lanes * DEFAULT_CONFIG.cols)
  })
})

import { deployUnit, resolveCombat } from './battle'
import type { BattleEvent } from './battle'

describe('deployUnit + resolveCombat', () => {
  it('a unit with no enemy in its lane damages the enemy hero', () => {
    const s = createBattle(deck(8), deck(8), 1)
    const ev: BattleEvent[] = []
    deployUnit(s, 'A', 0, 2, 0, ev) // some lane, front
    const atkUnit = s.units[0]
    resolveCombat(s, 'A', ev)
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - atkUnit.def.attack)
    expect(ev.some((e) => e.type === 'heroDamage' && e.heroTeam === 'B')).toBe(true)
  })

  it('a unit attacks the frontmost enemy in its own lane, not the hero', () => {
    const s = createBattle(deck(8), deck(8), 1)
    const ev: BattleEvent[] = []
    deployUnit(s, 'B', 0, 1, 0, ev) // enemy in lane 1
    deployUnit(s, 'A', 0, 1, 0, ev) // ally in lane 1
    const foe = s.units.find((u) => u.team === 'B')!
    const foeHpBefore = foe.hp
    const ally = s.units.find((u) => u.team === 'A')!
    resolveCombat(s, 'A', ev)
    expect(foe.hp).toBe(foeHpBefore - ally.def.attack)
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp) // hero untouched
  })

  it('reducing the enemy hero to 0 sets the winner and emits end', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.heroHp.B = 3
    const ev: BattleEvent[] = []
    deployUnit(s, 'A', 0, 0, 0, ev) // attack >= 5 per fixture
    resolveCombat(s, 'A', ev)
    expect(s.heroHp.B).toBe(0)
    expect(s.winner).toBe('A')
    expect(ev).toContainEqual({ type: 'end', winner: 'A' })
  })
})

import { playerDeploy } from './battle'

describe('playerDeploy turn flow', () => {
  it('rejects a deploy onto an occupied cell (no-op)', () => {
    const s = createBattle(deck(8), deck(8), 1)
    playerDeploy(s, 0, 0, 0)
    const unitsAfterFirst = s.units.filter((u) => u.team === 'A').length
    // Try to place onto the same A cell again — should be rejected.
    playerDeploy(s, 0, 0, 0)
    // A only ever deploys 1 unit per its turn; occupied-cell reject must not add another at (0,0).
    expect(s.units.filter((u) => u.team === 'A' && u.lane === 0 && u.col === 0).length).toBe(1)
  })

  it('runs the enemy turn automatically after the player deploys', () => {
    const s = createBattle(deck(8), deck(8), 1)
    playerDeploy(s, 0, 0, 0)
    expect(s.units.some((u) => u.team === 'B')).toBe(true) // AI deployed
    expect(s.active).toBe('A') // back to player
    expect(s.turn).toBe(2)
  })

  it('rejects an out-of-bounds cell (no-op)', () => {
    const s = createBattle(deck(8), deck(8), 1)
    const before = s.units.length
    playerDeploy(s, 0, -1, 0) // lane out of range
    playerDeploy(s, 0, 0, 99) // col out of range
    playerDeploy(s, 0, DEFAULT_CONFIG.lanes, 0) // lane == lanes (off by one)
    expect(s.units.length).toBe(before) // nothing deployed, turn not advanced
    expect(s.turn).toBe(1)
    expect(s.active).toBe('A')
  })

  it('is fully deterministic — same seed + same actions gives identical event logs', () => {
    const run = () => {
      const s = createBattle(deck(8), deck(8), 77)
      const log: unknown[] = []
      log.push(...playerDeploy(s, 0, 0, 0))
      log.push(...playerDeploy(s, 0, 1, 0))
      log.push(...playerDeploy(s, 0, 2, 0))
      return { log, winner: s.winner, heroB: s.heroHp.B }
    }
    expect(run()).toEqual(run())
  })
})
