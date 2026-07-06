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

  it('resolves by hero HP instead of freezing when the player runs out of hand and deck', () => {
    const s = createBattle(deck(8), deck(8), 1)
    const lowAttackUnit = unit('low-atk', 999, 1)
    // Player has exactly one card left and an empty deck — after playing it,
    // A has no cards in hand and no cards to draw, so A has no legal move.
    s.hands.A = [lowAttackUnit]
    s.decks.A = []
    // High hero HP + low attack so nobody dies from this single exchange.
    s.heroHp.A = 1000
    s.heroHp.B = 1000

    playerDeploy(s, 0, 0, 0) // deploy the last card into an empty lane

    // The active-player-has-no-legal-move rule must resolve the game by
    // comparing hero HP, not leave it frozen with winner === null forever.
    expect(s.winner).not.toBeNull()
  })
})

import { nextSkillIndex, usePlayerSkill, SKILL_UNLOCK_TURN } from './battle'
import type { BattleEvent as BE } from './battle'

describe('commander skills 1-3', () => {
  it('skill index 0 is available only at/after its unlock turn', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.turn = 1
    expect(nextSkillIndex(s, 'A')).toBeNull()
    s.turn = SKILL_UNLOCK_TURN[0]
    expect(nextSkillIndex(s, 'A')).toBe(0)
  })

  it('skill 1 (집중포화) damages every enemy unit in the targeted lane', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.turn = SKILL_UNLOCK_TURN[0]
    const ev: BE[] = []
    deployUnit(s, 'B', 0, 2, 0, ev) // enemy in lane 2 front
    deployUnit(s, 'B', 0, 2, 1, ev) // enemy in lane 2 back
    const foes = s.units.filter((u) => u.team === 'B' && u.lane === 2)
    const before = foes.map((f) => f.hp)
    usePlayerSkill(s, 2)
    foes.forEach((f, i) => expect(f.hp).toBe(Math.max(0, before[i] - 18)))
    expect(s.skillsUsed.A).toBe(1)
  })

  it('skill 2 (진군나팔) adds a persistent team attack bonus used in combat', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.turn = SKILL_UNLOCK_TURN[1]
    s.skillsUsed.A = 1 // skill 0 already used, so next is index 1
    usePlayerSkill(s)
    expect(s.atkBonus.A).toBe(6)
    // a unit with attack 5 now deals 11 to the enemy hero (empty lane)
    const ev: BE[] = []
    deployUnit(s, 'A', 0, 0, 0, ev)
    const atk = s.units.find((u) => u.team === 'A')!.def.attack
    resolveCombat(s, 'A', ev)
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - (atk + 6))
  })

  it('skill 3 (최후의일격) deals 45 to the enemy hero and can win', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.turn = SKILL_UNLOCK_TURN[2]
    s.skillsUsed.A = 2
    s.heroHp.B = 40
    usePlayerSkill(s)
    expect(s.heroHp.B).toBe(0)
    expect(s.winner).toBe('A')
  })

  it('rejects using a skill before it is unlocked (no-op)', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.turn = 1
    usePlayerSkill(s, 0)
    expect(s.skillsUsed.A).toBe(0)
  })
})

import { usePlayerDesperation, playerDeploy as pd2 } from './battle'

describe('desperation + AI skills', () => {
  it('desperation is unavailable until all 3 skills are used', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.skillsUsed.A = 2
    const before = { ...s.heroHp }
    usePlayerDesperation(s)
    expect(s.heroHp.B).toBe(before.B) // no-op
  })

  it('desperation damages enemy hero and costs own hero HP, escalating', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.skillsUsed.A = 3
    usePlayerDesperation(s) // d=0: 25 to B, 12 to A
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - 25)
    expect(s.heroHp.A).toBe(DEFAULT_CONFIG.heroHp - 12)
    usePlayerDesperation(s) // d=1: 40 to B, 20 to A
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - 25 - 40)
    expect(s.heroHp.A).toBe(DEFAULT_CONFIG.heroHp - 12 - 20)
    expect(s.desperations.A).toBe(2)
  })

  it('desperation that drops own hero to 0 loses the game', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.skillsUsed.A = 3
    s.heroHp.A = 10
    s.heroHp.B = 999
    usePlayerDesperation(s) // self cost 12 >= 10
    expect(s.heroHp.A).toBe(0)
    expect(s.winner).toBe('B')
  })

  it('the AI uses its unlocked skill during its turn', () => {
    const s = createBattle(deck(8), deck(8), 1)
    // Advance to a turn where B has a skill unlocked, then let a player action drive B's turn.
    s.turn = SKILL_UNLOCK_TURN[0]
    pd2(s, 0, 0, 0)
    expect(s.skillsUsed.B).toBeGreaterThanOrEqual(1)
  })

  it('stays deterministic with skills + desperation scripted', () => {
    const run = () => {
      const s = createBattle(deck(8), deck(8), 55)
      const log: unknown[] = []
      s.turn = SKILL_UNLOCK_TURN[0]
      log.push(...usePlayerSkill(s, 0))
      log.push(...pd2(s, 0, 1, 0))
      return { log, hero: { ...s.heroHp }, winner: s.winner }
    }
    expect(run()).toEqual(run())
  })
})
