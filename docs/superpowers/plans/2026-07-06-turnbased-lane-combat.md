# 턴제 레인 전투 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 미티파티식 턴제 레인 전투를 만든다 — 매 턴 손패에서 유닛 1장을 내 쪽 빈 칸에 놓으면 내 유닛들이 같은 레인 최전방 적(없으면 상대 히어로)을 공격하고, 상대가 자동으로 응수하며, 상대 히어로 HP를 0으로 만들면 승리한다. 시드 기반 난수로 완전 결정론.

**Architecture:** 전투는 시드 PRNG 기반 순수 결정론 엔진(`src/engine/prng.ts` + `src/engine/battle.ts`)으로 구현하고(완전 TDD, Phaser 미의존), Phaser 씬은 **매 액션 후 상태에서 전체를 다시 그리는(render-from-state)** 단순 방식으로 소비한다. 기존 자동 전투 엔진(`combat.ts`)과 선배치 씬(`PlacementScene`)은 이 모델로 대체(삭제).

**Tech Stack:** Vite + TypeScript + Phaser 3, Vitest.

## Global Constraints

- 전투는 **시드 PRNG로 결정론**: 전역 `Math.random`/`Date` 금지, 자체 시드 PRNG만 사용. 같은 (덱, 시드, 액션열)이면 이벤트 로그 동일.
- `src/engine/`는 Phaser import 금지 (순수 로직).
- 아트는 도형/텍스트만. 이름은 전부 오리지널.
- 빌드는 상대 경로(`base: './'`) 유지.
- 보드: 팀당 **4레인(row 0..3) × 3칸(col 0..2)**, col 0 = 최전방(중앙 쪽). 히어로는 보드 밖.
- 히어로 HP 120, 손패 4, 덱 8.
- 승리: 상대 히어로 HP ≤ 0. 최대 턴 초과 시 히어로 HP 높은 쪽 승(동률 무승부).
- v1 제외: 칸 보너스, 히어로 스킬/마나, 자동버튼, 상태이상, 이벤트별 애니메이션.

---

## File Structure
- `src/engine/prng.ts` — (신규) 시드 PRNG (makeRng/nextFloat/nextInt/shuffle).
- `src/engine/prng.test.ts` — (신규) PRNG 결정론 테스트.
- `src/engine/battle.ts` — (신규) 턴제 전투 엔진(상태/타입/createBattle/헬퍼/deploy/combat/playerDeploy/aiTurn).
- `src/engine/battle.test.ts` — (신규) 전투 엔진 TDD.
- `src/render/layout.ts` — (교체) 4×3 셀 좌표 + 히어로 좌표.
- `src/data/decks.ts` — (신규) 플레이어/상대 덱.
- `src/render/BattleScene.ts` — (교체) 인터랙티브 턴제 전투 씬(render-from-state).
- `src/main.ts` — (교체) 씬 등록.
- 삭제: `src/engine/combat.ts`, `src/engine/combat.test.ts`, `src/render/PlacementScene.ts`, `src/data/units.ts`.

---

### Task 1: 시드 PRNG (TDD)

**Files:** Create `src/engine/prng.ts`, `src/engine/prng.test.ts`

**Interfaces:**
- Produces: `Rng`, `makeRng(seed:number):Rng`, `nextFloat(rng):number` (0..1), `nextInt(rng,maxExclusive):number`, `shuffle<T>(rng, arr:T[]):T[]` (새 배열 반환, 입력 불변).

- [ ] **Step 1: 실패 테스트 작성** (`src/engine/prng.test.ts`)

```ts
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
```

- [ ] **Step 2: 실패 확인** — Run `npm test`; Expected: FAIL (`./prng` 미존재).

- [ ] **Step 3: 구현** (`src/engine/prng.ts`)

```ts
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
```

- [ ] **Step 4: 통과 확인** — Run `npm test`; Expected: PASS (기존 엔진 테스트 + prng 5개).

- [ ] **Step 5: 커밋**

```bash
git add src/engine/prng.ts src/engine/prng.test.ts
git commit -m "feat: seeded deterministic PRNG (mulberry32 + shuffle)"
```

---

### Task 2: 전투 상태 + createBattle (TDD)

**Files:** Create `src/engine/battle.ts`, `src/engine/battle.test.ts`

**Interfaces:**
- Consumes: `UnitDef`, `TeamId` (types.ts); `makeRng`, `shuffle` (prng.ts).
- Produces: `BattleUnit`, `BattleConfig`, `DEFAULT_CONFIG`, `BattleEvent`, `BattleState`, `createBattle(deckA, deckB, seed, config?): BattleState`, 헬퍼 `emptyCells(state, team)`, `frontmostEnemy(state, team, lane)`.

- [ ] **Step 1: 실패 테스트 작성** (`src/engine/battle.test.ts`)

```ts
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
```

- [ ] **Step 2: 실패 확인** — Run `npm test`; Expected: FAIL (`./battle` 미존재).

- [ ] **Step 3: 구현** (`src/engine/battle.ts`)

```ts
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
```

- [ ] **Step 4: 통과 확인** — Run `npm test`; Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/engine/battle.ts src/engine/battle.test.ts
git commit -m "feat: turn-based battle state + seeded createBattle + board helpers"
```

---

### Task 3: 배치 + 전투 해결 (TDD)

**Files:** Modify `src/engine/battle.ts` (add), `src/engine/battle.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 상태/헬퍼.
- Produces: `deployUnit(state, team, handIndex, lane, col, events): void` (손패에서 꺼내 배치, deploy 이벤트), `resolveCombat(state, team, events): void` (team 유닛 각자 1회 공격 — 같은 레인 최전방 적, 없으면 상대 히어로; death/heroDamage/end 이벤트, 승리 시 winner 설정).

- [ ] **Step 1: 실패 테스트 추가** (`src/engine/battle.test.ts` 맨 끝에 append)

```ts
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
```

- [ ] **Step 2: 실패 확인** — Run `npm test`; Expected: FAIL (`deployUnit`/`resolveCombat` 미존재).

- [ ] **Step 3: 구현** (`src/engine/battle.ts` 하단에 추가)

```ts
export function deployUnit(
  state: BattleState,
  team: TeamId,
  handIndex: number,
  lane: number,
  col: number,
  events: BattleEvent[],
): void {
  const def = state.hands[team][handIndex]
  if (!def) return
  state.hands[team].splice(handIndex, 1)
  const instanceId = `${team}#${state.nextInstance++}`
  state.units.push({ instanceId, def, team, lane, col, hp: def.maxHp, alive: true })
  events.push({ type: 'deploy', team, instanceId, lane, col })
}

export function resolveCombat(state: BattleState, team: TeamId, events: BattleEvent[]): void {
  // Deterministic order: lane asc, then col asc.
  const actors = state.units
    .filter((u) => u.alive && u.team === team)
    .sort((a, b) => (a.lane !== b.lane ? a.lane - b.lane : a.col - b.col))

  for (const actor of actors) {
    if (!actor.alive || state.winner) continue
    const foe = frontmostEnemy(state, team, actor.lane)
    if (foe) {
      foe.hp = Math.max(0, foe.hp - actor.def.attack)
      events.push({
        type: 'attack',
        attacker: actor.instanceId,
        target: foe.instanceId,
        damage: actor.def.attack,
        targetHpAfter: foe.hp,
      })
      if (foe.hp <= 0 && foe.alive) {
        foe.alive = false
        events.push({ type: 'death', instanceId: foe.instanceId })
      }
    } else {
      const heroTeam = enemyOf(team)
      state.heroHp[heroTeam] = Math.max(0, state.heroHp[heroTeam] - actor.def.attack)
      events.push({
        type: 'heroDamage',
        attacker: actor.instanceId,
        heroTeam,
        damage: actor.def.attack,
        heroHpAfter: state.heroHp[heroTeam],
      })
      if (state.heroHp[heroTeam] <= 0) {
        state.winner = team
        events.push({ type: 'end', winner: team })
      }
    }
  }
}
```

- [ ] **Step 4: 통과 확인** — Run `npm test`; Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/engine/battle.ts src/engine/battle.test.ts
git commit -m "feat: unit deployment and lane combat resolution with hero damage"
```

---

### Task 4: 턴 진행 (playerDeploy + AI) + 결정론 (TDD)

**Files:** Modify `src/engine/battle.ts` (add), `src/engine/battle.test.ts` (append)

**Interfaces:**
- Consumes: Task 2/3.
- Produces: `playerDeploy(state, handIndex, lane, col): BattleEvent[]` — A 턴에만 유효; A 배치 → A 전투 → (미승리 시) B 턴 자동(드로우+AI배치+B전투) → (미승리 시) turn+1, A로 전환+드로우, maxTurns 초과 시 히어로 비교로 종료. state를 제자리 변경, 이번 호출의 이벤트 배열 반환.

- [ ] **Step 1: 실패 테스트 추가** (`src/engine/battle.test.ts` 맨 끝에 append)

```ts
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
```

- [ ] **Step 2: 실패 확인** — Run `npm test`; Expected: FAIL (`playerDeploy` 미존재).

- [ ] **Step 3: 구현** (`src/engine/battle.ts` 하단에 추가)

```ts
function drawToHand(state: BattleState, team: TeamId): void {
  while (state.hands[team].length < state.config.handSize && state.decks[team].length > 0) {
    state.hands[team].push(state.decks[team].shift()!)
  }
}

function chooseAiCell(
  state: BattleState,
): { lane: number; col: number } | null {
  const cells = emptyCells(state, 'B')
  if (cells.length === 0) return null
  // Prefer the lane with the most enemy (A) units; break ties by lowest lane,
  // then frontmost (lowest col). Fully deterministic.
  const enemyCountInLane = (lane: number) =>
    state.units.filter((u) => u.alive && u.team === 'A' && u.lane === lane).length
  return [...cells].sort((a, b) => {
    const da = enemyCountInLane(b.lane) - enemyCountInLane(a.lane)
    if (da !== 0) return da
    if (a.lane !== b.lane) return a.lane - b.lane
    return a.col - b.col
  })[0]
}

function aiTurn(state: BattleState, events: BattleEvent[]): void {
  drawToHand(state, 'B')
  if (state.hands.B.length > 0) {
    const cell = chooseAiCell(state)
    if (cell) deployUnit(state, 'B', 0, cell.lane, cell.col, events)
  }
  resolveCombat(state, 'B', events)
}

function finishByHero(state: BattleState, events: BattleEvent[]): void {
  const winner: TeamId | 'draw' =
    state.heroHp.A > state.heroHp.B ? 'A' : state.heroHp.B > state.heroHp.A ? 'B' : 'draw'
  state.winner = winner
  events.push({ type: 'end', winner })
}

export function playerDeploy(
  state: BattleState,
  handIndex: number,
  lane: number,
  col: number,
): BattleEvent[] {
  const events: BattleEvent[] = []
  if (state.winner || state.active !== 'A') return events
  if (handIndex < 0 || handIndex >= state.hands.A.length) return events
  const occupied = state.units.some(
    (u) => u.alive && u.team === 'A' && u.lane === lane && u.col === col,
  )
  if (occupied) return events

  deployUnit(state, 'A', handIndex, lane, col, events)
  resolveCombat(state, 'A', events)
  if (state.winner) return events

  state.active = 'B'
  aiTurn(state, events)
  if (state.winner) return events

  state.turn += 1
  state.active = 'A'
  drawToHand(state, 'A')
  if (state.turn > state.config.maxTurns) finishByHero(state, events)
  return events
}
```

- [ ] **Step 4: 통과 확인** — Run `npm test`; Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/engine/battle.ts src/engine/battle.test.ts
git commit -m "feat: player/AI turn flow with deterministic full-round advance"
```

---

### Task 5: UI 전면 교체 (레이아웃 + 덱 + 인터랙티브 씬) + 구 파일 제거

**Files:**
- Modify: `src/render/layout.ts` (전체 교체)
- Create: `src/data/decks.ts`
- Modify: `src/render/BattleScene.ts` (전체 교체)
- Modify: `src/main.ts` (전체 교체)
- Delete: `src/engine/combat.ts`, `src/engine/combat.test.ts`, `src/render/PlacementScene.ts`, `src/data/units.ts`

**Interfaces:**
- Consumes: `createBattle`, `playerDeploy`, `DEFAULT_CONFIG`, `BattleState`, `BattleUnit` (battle.ts); `cellXY`, `heroXY`, `LOGICAL_W`, `LOGICAL_H` (layout.ts); `PLAYER_DECK`, `ENEMY_DECK` (decks.ts).
- Produces: 인터랙티브 `BattleScene` (탭 카드 → 탭 빈 칸 → `playerDeploy` → 상태에서 다시 그림).

- [ ] **Step 1: 구 파일 삭제**

```bash
git rm src/engine/combat.ts src/engine/combat.test.ts src/render/PlacementScene.ts src/data/units.ts
```
Expected: 4개 파일 삭제 스테이징. (이후 이들을 import 하던 `main.ts`/`BattleScene.ts`는 이 태스크에서 새로 교체하므로 참조가 사라짐.)

- [ ] **Step 2: `src/render/layout.ts` 전체 교체**

```ts
import type { TeamId } from '../engine/types'

export const LOGICAL_W = 1280
export const LOGICAL_H = 640
export const LANES = 4
export const COLS = 3

const CELL = 92
const GAP = 8

// Center of a board cell. col 0 is the front, nearest the middle divider.
export function cellXY(team: TeamId, lane: number, col: number): { x: number; y: number } {
  const y = 96 + lane * (CELL + GAP) + CELL / 2
  if (team === 'A') {
    const frontX = LOGICAL_W / 2 - 24 - CELL / 2
    return { x: frontX - col * (CELL + GAP), y }
  }
  const frontX = LOGICAL_W / 2 + 24 + CELL / 2
  return { x: frontX + col * (CELL + GAP), y }
}

export function heroXY(team: TeamId): { x: number; y: number } {
  const y = LOGICAL_H / 2
  return team === 'A' ? { x: 64, y } : { x: LOGICAL_W - 64, y }
}
```

- [ ] **Step 3: `src/data/decks.ts` 작성**

```ts
import type { UnitDef } from '../engine/types'

// attackInterval retained for UnitDef type compatibility; unused by turn-based combat.
function u(id: string, name: string, role: UnitDef['role'], maxHp: number, attack: number): UnitDef {
  return { id, name, role, faction: 'mushroom', maxHp, attack, attackInterval: 1 }
}

// Original names only, no third-party IP.
export const PLAYER_DECK: UnitDef[] = [
  u('moss-slime', '이끼슬라임', 'tank', 60, 8),
  u('moss-slime2', '이끼슬라임', 'tank', 60, 8),
  u('cap-shroom', '갓버섯', 'melee', 35, 16),
  u('cap-shroom2', '갓버섯', 'melee', 35, 16),
  u('spore-archer', '포자궁수', 'ranged', 24, 20),
  u('spore-archer2', '포자궁수', 'ranged', 24, 20),
  u('dew-fairy', '이슬요정', 'support', 30, 14),
  u('thorn-brute', '가시괴물', 'melee', 45, 22),
]

export const ENEMY_DECK: UnitDef[] = [
  u('stone-golem', '돌골렘', 'tank', 70, 9),
  u('stone-golem2', '돌골렘', 'tank', 70, 9),
  u('rock-brawler', '바위주먹', 'melee', 40, 15),
  u('rock-brawler2', '바위주먹', 'melee', 40, 15),
  u('pebble-pixie', '조약돌픽시', 'ranged', 26, 19),
  u('pebble-pixie2', '조약돌픽시', 'ranged', 26, 19),
  u('frost-imp', '서리도깨비', 'support', 28, 13),
  u('boulder-beast', '바위야수', 'melee', 55, 20),
]
```

- [ ] **Step 4: `src/render/BattleScene.ts` 전체 교체**

```ts
import Phaser from 'phaser'
import type { BattleState, BattleUnit } from '../engine/battle'
import { createBattle, playerDeploy, DEFAULT_CONFIG } from '../engine/battle'
import type { TeamId } from '../engine/types'
import { PLAYER_DECK, ENEMY_DECK } from '../data/decks'
import { cellXY, heroXY, LANES, COLS, LOGICAL_W, LOGICAL_H } from './layout'

const SEED = 20260706

export class BattleScene extends Phaser.Scene {
  private state!: BattleState
  private selectedHand: number | null = null
  private dynamic: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('Battle')
  }

  create() {
    this.state = createBattle(PLAYER_DECK, ENEMY_DECK, SEED, DEFAULT_CONFIG)
    this.selectedHand = null
    this.redraw()
  }

  // Destroy previous frame's objects and rebuild everything from state.
  private redraw() {
    this.dynamic.forEach((o) => o.destroy())
    this.dynamic = []

    this.drawHeroes()
    this.drawCells()
    this.drawUnits()
    this.drawHand()
    if (this.state.winner) this.drawResult()
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dynamic.push(o)
    return o
  }

  private drawHeroes() {
    ;(['A', 'B'] as TeamId[]).forEach((team) => {
      const { x, y } = heroXY(team)
      const color = team === 'A' ? 0x3366cc : 0xcc3344
      this.track(this.add.rectangle(x, y, 84, 120, color))
      this.track(
        this.add.text(x - 40, y - 96, `HP ${this.state.heroHp[team]}`, {
          fontSize: '18px',
          color: '#fff',
        }),
      )
    })
  }

  private drawCells() {
    ;(['A', 'B'] as TeamId[]).forEach((team) => {
      for (let lane = 0; lane < LANES; lane++) {
        for (let col = 0; col < COLS; col++) {
          const { x, y } = cellXY(team, lane, col)
          const rect = this.track(this.add.rectangle(x, y, 88, 88, 0x14304a).setStrokeStyle(2, 0x2c5578))
          if (team === 'A') {
            rect.setInteractive()
            rect.on('pointerdown', () => this.onCellTap(lane, col))
          }
        }
      }
    })
  }

  private drawUnits() {
    this.state.units.forEach((unitState: BattleUnit) => {
      if (!unitState.alive) return
      const { x, y } = cellXY(unitState.team, unitState.lane, unitState.col)
      const color = unitState.team === 'A' ? 0x00aa66 : 0xaa4444
      this.track(this.add.rectangle(x, y, 80, 80, color))
      this.track(this.add.text(x - 38, y - 34, unitState.def.name, { fontSize: '12px', color: '#fff' }))
      this.track(
        this.add.text(x - 38, y + 20, `${unitState.hp}/${unitState.def.maxHp}`, {
          fontSize: '12px',
          color: '#ffd',
        }),
      )
    })
  }

  private drawHand() {
    const turnLabel = this.state.winner ? '' : `턴 ${this.state.turn} — 카드를 고르고 내 칸을 탭`
    this.track(this.add.text(20, LOGICAL_H - 118, turnLabel, { fontSize: '16px', color: '#fff' }))
    this.state.hands.A.forEach((def, i) => {
      const x = 24 + i * 150
      const y = LOGICAL_H - 88
      const selected = this.selectedHand === i
      const card = this.track(
        this.add.rectangle(x + 66, y + 32, 132, 64, selected ? 0x4a6a4a : 0x2a3a2a).setStrokeStyle(2, selected ? 0xaaffaa : 0x557755),
      )
      card.setInteractive()
      card.on('pointerdown', () => this.onHandTap(i))
      this.track(
        this.add.text(x + 10, y + 8, `${def.name}\nHP ${def.maxHp} / ATK ${def.attack}`, {
          fontSize: '12px',
          color: '#cfc',
        }),
      )
    })
  }

  private drawResult() {
    const msg = this.state.winner === 'A' ? '승리!' : this.state.winner === 'B' ? '패배...' : '무승부'
    this.track(
      this.add.text(LOGICAL_W / 2 - 70, 24, msg, { fontSize: '36px', color: '#ffff88' }),
    )
  }

  private onHandTap(i: number) {
    if (this.state.winner) return
    this.selectedHand = this.selectedHand === i ? null : i
    this.redraw()
  }

  private onCellTap(lane: number, col: number) {
    if (this.state.winner || this.selectedHand === null) return
    const before = this.state.units.length
    playerDeploy(this.state, this.selectedHand, lane, col)
    if (this.state.units.length === before) return // rejected (occupied/invalid); keep selection
    this.selectedHand = null
    this.redraw()
  }
}
```

- [ ] **Step 5: `src/main.ts` 전체 교체**

```ts
import Phaser from 'phaser'
import { BattleScene } from './render/BattleScene'
import { LOGICAL_W, LOGICAL_H } from './render/layout'

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#0f1a24',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: LOGICAL_W,
    height: LOGICAL_H,
  },
  scene: [BattleScene],
})
```

- [ ] **Step 6: 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS — prng + battle 엔진 테스트 전부 통과. (구 `combat.test.ts` 삭제됨. smoke 테스트는 유지.)

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음. (구 파일 참조 없음 확인.) `npm run dev` 실행 금지 — 육안 확인은 배포 후 사람이.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat: interactive turn-based lane battle scene; retire auto-battle model"
```

---

## Self-Review 결과
- **스펙 커버리지:** 시드 결정론(§2.3) → Task1+2+4; 보드 4×3(§2.1)/셀 헬퍼 → Task2+5; 배치·레인 공격·히어로(§2.2/2.4/2.6) → Task3; 턴 흐름+AI(§2.4/2.5) → Task4; 인터랙티브 UI(§3.1)+구모델 교체(§4) → Task5. 제외 항목은 미포함(정상).
- **플레이스홀더 스캔:** 모든 스텝에 실제 코드/명령/기대결과. 없음.
- **타입 일관성:** `BattleState`/`BattleEvent`/`BattleUnit`가 battle.ts 정의 → 씬 소비 일치. `createBattle(deckA,deckB,seed,config?)`·`playerDeploy(state,handIndex,lane,col)` 시그니처가 Task2/4 정의와 Task5 호출부 일치. `cellXY(team,lane,col)`/`heroXY(team)`가 layout 정의와 씬 사용 일치. instanceId `${team}#${n}`는 엔진 내부용(씬은 상태에서 직접 그림). `Rng`가 prng.ts↔battle.ts 일치.
- **삭제 안전성:** 삭제되는 `combat.ts`/`units.ts`/`PlacementScene.ts`를 참조하던 파일(`main.ts`, 구 `BattleScene.ts`)은 Task5에서 전량 교체되어 참조가 사라짐 → 빌드 깨짐 없음.
