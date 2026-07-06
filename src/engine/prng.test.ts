import { describe, it, expect } from 'vitest'
import { makeRng, nextFloat, nextInt, shuffle } from './prng'

describe('prng', () => {
  it('same seed produces the same float sequence', () => {
    const a = makeRng(42), b = makeRng(42)
    const seqA = [nextFloat(a), nextFloat(a), nextFloat(a)]
    const seqB = [nextFloat(b), nextFloat(b), nextFloat(b)]
    expect(seqA).toEqual(seqB)
  })

  it('different seeds diverge', () => {
    const a = makeRng(1), b = makeRng(2)
    expect(nextFloat(a)).not.toEqual(nextFloat(b))
  })

  it('nextFloat stays in [0,1)', () => {
    const r = makeRng(7)
    for (let i = 0; i < 100; i++) {
      const f = nextFloat(r)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })

  it('nextInt stays in range', () => {
    const r = makeRng(9)
    for (let i = 0; i < 100; i++) {
      const n = nextInt(r, 5)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(5)
    }
  })

  it('shuffle is deterministic for a seed and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const s1 = shuffle(makeRng(3), input)
    const s2 = shuffle(makeRng(3), input)
    expect(s1).toEqual(s2)
    expect(input).toEqual([1, 2, 3, 4, 5, 6]) // unchanged
    expect([...s1].sort()).toEqual([1, 2, 3, 4, 5, 6]) // same multiset
  })
})
