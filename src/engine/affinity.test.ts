import { describe, it, expect } from 'vitest'
import { typeMultiplier } from './affinity'
import type { Faction, Role } from './types'

const u = (faction: Faction, role: Role) => ({ faction, role })

describe('typeMultiplier', () => {
  it('faction advantage gives 1.3 (mushroom beats rock)', () => {
    expect(typeMultiplier(u('mushroom', 'support'), u('rock', 'support'))).toBeCloseTo(1.3)
  })
  it('role advantage gives 1.3 (tank beats ranged)', () => {
    expect(typeMultiplier(u('mushroom', 'tank'), u('mushroom', 'ranged'))).toBeCloseTo(1.3)
  })
  it('both advantages stack (~1.69)', () => {
    expect(typeMultiplier(u('mushroom', 'tank'), u('rock', 'ranged'))).toBeCloseTo(1.69)
  })
  it('no advantage is 1', () => {
    expect(typeMultiplier(u('mushroom', 'melee'), u('mushroom', 'melee'))).toBe(1)
  })
  it('support has no role advantage or disadvantage', () => {
    expect(typeMultiplier(u('mushroom', 'support'), u('mushroom', 'tank'))).toBe(1)
  })
  it('the faction cycle is closed (fairy beats mushroom)', () => {
    expect(typeMultiplier(u('fairy', 'support'), u('mushroom', 'support'))).toBeCloseTo(1.3)
  })
})
