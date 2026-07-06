import { describe, it, expect } from 'vitest'
import { ROSTER, PLAYER_DECK, ENEMY_DECK } from './roster'

describe('roster', () => {
  it('has unique ids', () => {
    const ids = ROSTER.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('covers all five factions', () => {
    const factions = new Set(ROSTER.map((u) => u.faction))
    expect(factions).toEqual(new Set(['mushroom', 'rock', 'toy', 'snow', 'fairy']))
  })
  it('builds 8-card decks with positive stats', () => {
    expect(PLAYER_DECK).toHaveLength(8)
    expect(ENEMY_DECK).toHaveLength(8)
    for (const u of [...PLAYER_DECK, ...ENEMY_DECK]) {
      expect(u.maxHp).toBeGreaterThan(0)
      expect(u.attack).toBeGreaterThan(0)
    }
  })
})
