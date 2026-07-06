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

  it('a second usePlayerSkill in the same turn is a no-op even when the next skill is already unlocked', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.turn = SKILL_UNLOCK_TURN[1] // skills 0 and 1 are both unlocked at this turn
    usePlayerSkill(s, 0) // uses skill 0 (집중포화)
    expect(s.skillsUsed.A).toBe(1)
    usePlayerSkill(s) // skill 1 is already unlocked, but same turn — must be a no-op
    expect(s.skillsUsed.A).toBe(1)
    expect(s.atkBonus.A).toBe(0)
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
    // Desperation now ends the player's turn and runs an AI turn in between.
    // Neutralize B so its turn is a no-op, keeping the HP math clean.
    s.hands.B = []
    s.decks.B = []
    s.skillsUsed.B = 3
    s.heroHp.A = 1000 // high enough to survive both self-costs (12 + 20)
    usePlayerDesperation(s) // d=0: 25 to B, 12 to A
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - 25)
    expect(s.heroHp.A).toBe(1000 - 12)
    usePlayerDesperation(s) // d=1: 40 to B, 20 to A
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - 25 - 40)
    expect(s.heroHp.A).toBe(1000 - 12 - 20)
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

  it('usePlayerDesperation advances the turn, giving the AI a response round', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.skillsUsed.A = 3
    const turnBefore = s.turn
    usePlayerDesperation(s)
    expect(s.turn).toBe(turnBefore + 1)
    expect(s.active).toBe('A')
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

describe('resolveCombat applies affinity', () => {
  it('an advantaged unit deals 1.3x rounded to an enemy unit', () => {
    const s = createBattle(deck(8), deck(8), 1)
    const ev: BE[] = []
    // attacker mushroom/tank vs defender rock/ranged -> both advantages ~1.69
    s.units.push({ instanceId: 'A#9', def: { id: 'x', name: 'x', role: 'tank', faction: 'mushroom', maxHp: 50, attack: 10, attackInterval: 1 }, team: 'A', lane: 0, col: 0, hp: 50, alive: true })
    s.units.push({ instanceId: 'B#9', def: { id: 'y', name: 'y', role: 'ranged', faction: 'rock', maxHp: 50, attack: 5, attackInterval: 1 }, team: 'B', lane: 0, col: 0, hp: 50, alive: true })
    resolveCombat(s, 'A', ev)
    const foe = s.units.find((u) => u.instanceId === 'B#9')!
    expect(foe.hp).toBe(50 - Math.round(10 * 1.69)) // 50 - 17 = 33
  })
})

import type { CommanderDef } from './battle'

describe('data-driven commanders', () => {
  const healer: CommanderDef = {
    id: 'healer',
    name: '치유사',
    skills: [
      { name: '재생', unlockTurn: 2, effect: { kind: 'healHero', amount: 40 }, needsTarget: false },
      { name: '강화', unlockTurn: 4, effect: { kind: 'teamAtkBonus', amount: 8 }, needsTarget: false },
      { name: '분쇄', unlockTurn: 6, effect: { kind: 'heroDamage', amount: 30 }, needsTarget: false },
    ],
  }

  it('healHero restores own hero HP up to the max', () => {
    const s = createBattle(deck(8), deck(8), 1, DEFAULT_CONFIG, { A: healer, B: healer })
    s.turn = 2
    s.heroHp.A = 50
    usePlayerSkill(s)
    expect(s.heroHp.A).toBe(90) // 50 + 40
    expect(s.skillsUsed.A).toBe(1)
  })

  it('heal does not exceed the config max hero HP', () => {
    const s = createBattle(deck(8), deck(8), 1, DEFAULT_CONFIG, { A: healer, B: healer })
    s.turn = 2
    s.heroHp.A = 100
    usePlayerSkill(s)
    expect(s.heroHp.A).toBe(DEFAULT_CONFIG.heroHp) // capped at 120
  })

  it('default commander (no arg) still deals 18 lane / +6 / 45 hero (back-compat)', () => {
    const s = createBattle(deck(8), deck(8), 1)
    s.turn = 6
    s.skillsUsed.A = 2
    s.heroHp.B = 50
    usePlayerSkill(s)
    expect(s.heroHp.B).toBe(5) // 50 - 45
  })
})

import { DEFAULT_COMMANDER } from './battle'

describe('aiTurn targets by skill.needsTarget, not skill index', () => {
  it('uses aiSkillLane (not lane 0) when the AI targeted skill sits at a non-zero index', () => {
    // B's skill 0 is a non-targeted dummy; the real (targeted) laneDamage skill is index 1.
    const gaiaLike: CommanderDef = {
      id: 'gaia-test',
      name: '테스트 지휘관',
      skills: [
        { name: '더미', unlockTurn: 1, effect: { kind: 'teamAtkBonus', amount: 0 }, needsTarget: false },
        { name: '대지분쇄', unlockTurn: 1, effect: { kind: 'laneDamage', amount: 15 }, needsTarget: true },
      ],
    }
    const s = createBattle(deck(8), deck(8), 1, DEFAULT_CONFIG, { A: DEFAULT_COMMANDER, B: gaiaLike })
    // Simulate B having already used skill 0; skill index 1 (targeted) is next up.
    s.skillsUsed.B = 1
    // Keep the AI from deploying/attacking this turn so resolveCombat('B', ...) can't
    // muddy the HP numbers we're asserting on.
    s.hands.B = []
    s.decks.B = []

    // Lane 2 has the most A units, so aiSkillLane(state) must resolve to lane 2.
    s.units.push({ instanceId: 'A#lane2a', def: unit('u', 100, 5), team: 'A', lane: 2, col: 0, hp: 100, alive: true })
    s.units.push({ instanceId: 'A#lane2b', def: unit('u', 100, 5), team: 'A', lane: 2, col: 1, hp: 100, alive: true })

    // Player deploys into lane 0 (fewer units there), then ends the turn — triggering aiTurn.
    playerDeploy(s, 0, 0, 0)

    const lane2Unit = s.units.find((u) => u.instanceId === 'A#lane2a')!
    const lane0Unit = s.units.find((u) => u.team === 'A' && u.lane === 0)!

    // Old buggy logic (`skillIdx === 0 ? aiSkillLane(state) : 0`) would target lane 0 here,
    // since the targeted skill is at index 1. The fix must target lane 2 instead.
    expect(lane2Unit.hp).toBe(85) // 100 - 15 laneDamage: proves aiSkillLane (lane 2) was targeted
    expect(lane0Unit.hp).toBe(lane0Unit.def.maxHp) // lane 0 untouched by the skill
  })
})
