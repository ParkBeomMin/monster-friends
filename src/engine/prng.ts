// Deterministic PRNG (mulberry32). State is a single uint32 carried in Rng.
export interface Rng {
  s: number
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 }
}

export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0
  let t = rng.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function nextInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(nextFloat(rng) * maxExclusive)
}

// Fisher-Yates using the seeded rng. Returns a new array; input is untouched.
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
