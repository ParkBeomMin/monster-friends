import { describe, it, expect } from 'vitest'
import { createUnitState, selectTarget, resolveAttack, simulateBattle } from './combat'
import type { UnitDef } from './types'

const slime: UnitDef = {
  id: 'slime',
  name: '슬라임',
  role: 'melee',
  faction: 'mushroom',
  maxHp: 100,
  attack: 30,
  attackInterval: 1,
}

describe('createUnitState', () => {
  it('starts at full hp, alive, cooldown = attackInterval', () => {
    const u = createUnitState(slime, 'A', 0)
    expect(u.hp).toBe(100)
    expect(u.alive).toBe(true)
    expect(u.cooldown).toBe(1)
    expect(u.instanceId).toBe('A#0')
  })
})

describe('selectTarget', () => {
  it('picks the lowest-slot living enemy', () => {
    const attacker = createUnitState(slime, 'A', 0)
    const enemy1 = createUnitState(slime, 'B', 1)
    const enemy0 = createUnitState(slime, 'B', 0)
    const target = selectTarget(attacker, [attacker, enemy1, enemy0])
    expect(target?.instanceId).toBe('B#0')
  })

  it('skips dead enemies', () => {
    const attacker = createUnitState(slime, 'A', 0)
    const deadEnemy = createUnitState(slime, 'B', 0)
    deadEnemy.alive = false
    const liveEnemy = createUnitState(slime, 'B', 1)
    const target = selectTarget(attacker, [attacker, deadEnemy, liveEnemy])
    expect(target?.instanceId).toBe('B#1')
  })

  it('returns null when no enemies remain', () => {
    const attacker = createUnitState(slime, 'A', 0)
    expect(selectTarget(attacker, [attacker])).toBeNull()
  })
})

describe('resolveAttack', () => {
  it('reduces target hp and emits an attack event', () => {
    const attacker = createUnitState(slime, 'A', 0)
    const target = createUnitState(slime, 'B', 0)
    const events = resolveAttack(attacker, target, 5)
    expect(target.hp).toBe(70)
    expect(events).toEqual([
      { type: 'attack', tick: 5, attacker: 'A#0', target: 'B#0', damage: 30, targetHpAfter: 70 },
    ])
  })

  it('marks target dead and emits a death event when hp hits 0', () => {
    const attacker = createUnitState(slime, 'A', 0)
    const target = createUnitState(slime, 'B', 0)
    target.hp = 20
    const events = resolveAttack(attacker, target, 5)
    expect(target.hp).toBe(0)
    expect(target.alive).toBe(false)
    expect(events).toContainEqual({ type: 'death', tick: 5, unit: 'B#0' })
  })
})

const strong: UnitDef = { id: 'ogre', name: '오크', role: 'tank', faction: 'rock', maxHp: 100, attack: 50, attackInterval: 1 }
const weak: UnitDef = { id: 'pixie', name: '픽시', role: 'ranged', faction: 'fairy', maxHp: 40, attack: 10, attackInterval: 1 }
const pacifist: UnitDef = { id: 'rock', name: '돌', role: 'tank', faction: 'rock', maxHp: 100, attack: 0, attackInterval: 1 }

describe('simulateBattle', () => {
  it('the stronger single unit wins a 1v1', () => {
    const result = simulateBattle([strong], [weak])
    expect(result.winner).toBe('A')
  })

  it('emits a final end event matching the winner', () => {
    const result = simulateBattle([strong], [weak])
    const last = result.events[result.events.length - 1]
    expect(last).toEqual({ type: 'end', tick: result.ticks, winner: 'A' })
  })

  it('is deterministic — identical inputs produce identical event logs', () => {
    const a = simulateBattle([strong, weak], [weak, strong])
    const b = simulateBattle([strong, weak], [weak, strong])
    expect(a.events).toEqual(b.events)
    expect(a.winner).toBe(b.winner)
  })

  it('declares a draw when nobody can kill before maxTicks', () => {
    const result = simulateBattle([pacifist], [pacifist], { maxTicks: 20 })
    expect(result.winner).toBe('draw')
    expect(result.ticks).toBe(20)
  })
})

import type { Position } from './types'

const tankDef: UnitDef = { id: 't', name: '탱', role: 'tank', faction: 'rock', maxHp: 100, attack: 10, attackInterval: 1 }
const archerDef: UnitDef = { id: 'a', name: '궁', role: 'ranged', faction: 'fairy', maxHp: 50, attack: 10, attackInterval: 1 }
const front = (col: number): Position => ({ row: 'front', col })
const back = (col: number): Position => ({ row: 'back', col })

describe('selectTarget with positions', () => {
  it('melee/tank targets the front row even if a back-row enemy has a lower col', () => {
    const attacker = createUnitState(tankDef, 'A', 0, front(0))
    const enemyBack = createUnitState(archerDef, 'B', 0, back(0)) // lower col
    const enemyFront = createUnitState(tankDef, 'B', 1, front(2)) // higher col but front
    const target = selectTarget(attacker, [attacker, enemyBack, enemyFront])
    expect(target?.instanceId).toBe('B#1') // the front one
  })

  it('ranged targets the back row first (snipes past the front)', () => {
    const attacker = createUnitState(archerDef, 'A', 0, front(0))
    const enemyFront = createUnitState(tankDef, 'B', 0, front(0))
    const enemyBack = createUnitState(archerDef, 'B', 1, back(0))
    const target = selectTarget(attacker, [attacker, enemyFront, enemyBack])
    expect(target?.instanceId).toBe('B#1') // the back one
  })

  it('melee falls back to the back row when the front row is empty', () => {
    const attacker = createUnitState(tankDef, 'A', 0, front(0))
    const enemyBack = createUnitState(archerDef, 'B', 0, back(1))
    const target = selectTarget(attacker, [attacker, enemyBack])
    expect(target?.instanceId).toBe('B#0')
  })

  it('createUnitState defaults to front row at col = slot when pos omitted', () => {
    const u = createUnitState(tankDef, 'A', 2)
    expect(u.pos).toEqual({ row: 'front', col: 2 })
  })
})
