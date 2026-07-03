# 전투 코어 수직 슬라이스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 팀의 몬스터 스쿼드를 정의하면 결정론적 자동 전투가 시뮬레이션되고, 그 결과를 브라우저 화면에서 눈으로 지켜볼 수 있는 첫 플레이 가능 조각을 만든다.

**Architecture:** 전투를 두 층으로 분리한다. (1) **순수 로직 시뮬레이션 엔진** — Phaser 의존성 없는 결정론적 TypeScript 모듈로, 팀 정의를 받아 이벤트 로그와 승자를 반환한다(완전 단위 테스트 대상). (2) **렌더링 층** — Phaser가 그 이벤트 로그를 타임라인으로 재생만 한다. 이렇게 하면 게임의 핵심(전투 규칙)이 시각화와 무관하게 테스트·검증된다.

**Tech Stack:** Vite + TypeScript + Phaser 3 (렌더링), Vitest (테스트). Vue/Firebase는 이후 계획에서 도입.

## Global Constraints

- 1인 개발, 주 5시간 안팎 — 태스크는 잘게, 자주 커밋.
- 아트는 직접 제작 금지 — 이 계획에서는 도형(사각형)만 사용, 스프라이트는 이후 계획에서 에셋 팩으로 교체.
- 저작권: 몬스터/지역 이름은 전부 오리지널. 메이플 등 기존 IP 이름·에셋 사용 금지.
- 제작 방식은 웹 기술(HTML/TS)만. 신규 엔진 학습 없음.
- 빌드는 포털(Poki/CrazyGames) 업로드를 대비해 상대 경로(`base: './'`)로.
- 전투 로직은 결정론적(랜덤 없음)이어야 한다 — 비동기 아레나 재현·테스트를 위해 필수.

---

## File Structure

- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` — 프로젝트 스캐폴드
- `src/main.ts` — Phaser 게임 부트 엔트리
- `src/engine/types.ts` — 전투 도메인 타입 (UnitDef, UnitState, BattleEvent, BattleResult 등). 렌더링과 무관한 순수 타입.
- `src/engine/combat.ts` — 전투 로직 (createUnitState, selectTarget, resolveAttack, simulateBattle). Phaser import 금지.
- `src/engine/combat.test.ts` — 전투 엔진 단위 테스트.
- `src/data/units.ts` — 데모용 몬스터 정의 데이터 (하드코딩 로스터).
- `src/render/BattleScene.ts` — BattleResult를 재생하는 Phaser 씬.

책임 분리 원칙: `engine/`은 순수 로직(테스트 100%), `render/`는 재생만, `data/`는 데이터. 서로 역방향 의존 금지(engine은 render를 모른다).

---

### Task 1: 프로젝트 스캐폴드 (Vite + TS + Phaser + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/engine/smoke.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `npm run dev`(브라우저 실행), `npm test`(Vitest 실행), `npm run build`(포털용 정적 빌드) 스크립트.

- [ ] **Step 1: `.gitignore` 작성**

```
node_modules
dist
*.local
.DS_Store
```

- [ ] **Step 2: `package.json` 작성**

```json
{
  "name": "monster-friends",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "phaser": "^3.80.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `vite.config.ts` 작성** (Vitest 설정 포함, 포털용 상대 경로)

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './', // portal upload needs relative asset paths
  test: {
    environment: 'node', // engine tests are pure logic, no DOM needed
  },
})
```

- [ ] **Step 5: `index.html` 작성**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>몬스터 프렌즈</title>
    <style>
      body { margin: 0; background: #111; }
      #game { display: flex; justify-content: center; }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: `src/main.ts` 작성** (Phaser 부트 + 초록 사각형 하나)

```ts
import Phaser from 'phaser'

// Temporary boot scene to prove the pipeline renders. Replaced in Task 4.
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }
  create() {
    this.add.rectangle(400, 300, 120, 120, 0x00aa66)
    this.add.text(320, 180, '몬스터 프렌즈', { fontSize: '24px', color: '#ffffff' })
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  backgroundColor: '#1d1d1d',
  scene: [BootScene],
})
```

- [ ] **Step 7: `src/engine/smoke.test.ts` 작성** (파이프라인 확인용 통과 테스트)

```ts
import { describe, it, expect } from 'vitest'

describe('test pipeline', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 8: 의존성 설치**

Run: `cd /Users/bmpark/Workspace/monster-friends && npm install`
Expected: node_modules 생성, 에러 없음.

- [ ] **Step 9: 테스트 파이프라인 확인**

Run: `npm test`
Expected: PASS — `test pipeline > runs vitest` 1 passed.

- [ ] **Step 10: 브라우저 렌더 확인 (수동)**

Run: `npm run dev`
Expected: 브라우저에서 `http://localhost:5173` 열면 어두운 배경에 초록 사각형과 "몬스터 프렌즈" 텍스트가 보인다. 확인 후 Ctrl+C.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Phaser + Vitest project"
```

---

### Task 2: 전투 원자 연산 (타입 + 타겟 선택 + 공격 처리)

전투의 최소 단위 연산을 TDD로 만든다: 유닛 상태 생성, 타겟 선택, 단일 공격 처리(피해·사망).

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/combat.ts`
- Create: `src/engine/combat.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - 타입 `UnitDef`, `UnitState`, `TeamId`, `BattleEvent`, `BattleResult` (types.ts).
  - `createUnitState(def: UnitDef, team: TeamId, slot: number): UnitState`
  - `selectTarget(attacker: UnitState, units: UnitState[]): UnitState | null` — 살아있는 적 중 slot이 가장 작은 유닛.
  - `resolveAttack(attacker: UnitState, target: UnitState, tick: number): BattleEvent[]` — target.hp를 감소시키고(부수효과) attack 이벤트를, 죽으면 death 이벤트를 반환.

- [ ] **Step 1: `src/engine/types.ts` 작성** (순수 타입)

```ts
export type Role = 'tank' | 'melee' | 'ranged' | 'support'
export type Faction = 'mushroom' | 'fairy' | 'rock' | 'toy' | 'snow'
export type TeamId = 'A' | 'B'

export interface UnitDef {
  id: string
  name: string
  role: Role
  faction: Faction
  maxHp: number
  attack: number
  attackInterval: number // ticks between attacks, must be >= 1
}

export interface UnitState {
  instanceId: string // unique per battle, format: `${team}#${slot}`
  def: UnitDef
  team: TeamId
  slot: number
  hp: number
  cooldown: number // ticks remaining until next attack
  alive: boolean
}

export type BattleEvent =
  | {
      type: 'attack'
      tick: number
      attacker: string // instanceId
      target: string // instanceId
      damage: number
      targetHpAfter: number
    }
  | { type: 'death'; tick: number; unit: string }
  | { type: 'end'; tick: number; winner: TeamId | 'draw' }

export interface BattleResult {
  winner: TeamId | 'draw'
  ticks: number
  events: BattleEvent[]
}
```

- [ ] **Step 2: 실패하는 테스트 작성** (`src/engine/combat.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { createUnitState, selectTarget, resolveAttack } from './combat'
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `./combat` 모듈/함수 미존재로 import 에러.

- [ ] **Step 4: `src/engine/combat.ts` 최소 구현**

```ts
import type { UnitDef, UnitState, TeamId, BattleEvent } from './types'

export function createUnitState(def: UnitDef, team: TeamId, slot: number): UnitState {
  return {
    instanceId: `${team}#${slot}`,
    def,
    team,
    slot,
    hp: def.maxHp,
    cooldown: def.attackInterval,
    alive: true,
  }
}

export function selectTarget(attacker: UnitState, units: UnitState[]): UnitState | null {
  const enemies = units
    .filter((u) => u.team !== attacker.team && u.alive)
    .sort((a, b) => a.slot - b.slot)
  return enemies[0] ?? null
}

export function resolveAttack(
  attacker: UnitState,
  target: UnitState,
  tick: number,
): BattleEvent[] {
  const damage = attacker.def.attack
  target.hp = Math.max(0, target.hp - damage)
  const events: BattleEvent[] = [
    {
      type: 'attack',
      tick,
      attacker: attacker.instanceId,
      target: target.instanceId,
      damage,
      targetHpAfter: target.hp,
    },
  ]
  if (target.hp <= 0 && target.alive) {
    target.alive = false
    events.push({ type: 'death', tick, unit: target.instanceId })
  }
  return events
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — createUnitState / selectTarget / resolveAttack 모든 테스트 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/engine/types.ts src/engine/combat.ts src/engine/combat.test.ts
git commit -m "feat: combat atoms — unit state, target selection, attack resolution"
```

---

### Task 3: 전투 루프 (simulateBattle — 승패·결정론·타임아웃)

원자 연산을 조합해 전체 전투를 tick 단위로 굴리고 승자를 판정한다.

**Files:**
- Modify: `src/engine/combat.ts` (add `simulateBattle`)
- Modify: `src/engine/combat.test.ts` (add battle-loop tests)

**Interfaces:**
- Consumes: `createUnitState`, `selectTarget`, `resolveAttack` (Task 2).
- Produces: `simulateBattle(teamA: UnitDef[], teamB: UnitDef[], opts?: { maxTicks?: number }): BattleResult`
  - tick마다: 살아있는 유닛을 (team, slot) 순으로 정렬해 행동. cooldown 감소 후 0이하면 타겟 공격하고 cooldown을 attackInterval로 리셋.
  - 한 팀이 전멸하면 종료. maxTicks(기본 1000) 도달 시 종료.
  - 마지막에 `end` 이벤트 push. 승자: 한쪽만 생존이면 그 팀, 아니면 `'draw'`.

- [ ] **Step 1: 실패하는 테스트 추가** (`src/engine/combat.test.ts` 하단에 추가)

```ts
import { simulateBattle } from './combat'

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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `simulateBattle` 미존재로 import 에러.

- [ ] **Step 3: `simulateBattle` 구현** (`src/engine/combat.ts` 하단에 추가)

```ts
export function simulateBattle(
  teamA: UnitDef[],
  teamB: UnitDef[],
  opts: { maxTicks?: number } = {},
): BattleResult {
  const maxTicks = opts.maxTicks ?? 1000
  const units: UnitState[] = [
    ...teamA.map((def, i) => createUnitState(def, 'A', i)),
    ...teamB.map((def, i) => createUnitState(def, 'B', i)),
  ]
  const events: BattleEvent[] = []
  const teamAlive = (t: TeamId) => units.some((u) => u.team === t && u.alive)

  let tick = 0
  while (tick < maxTicks && teamAlive('A') && teamAlive('B')) {
    tick++
    // Deterministic action order: team A before B, then by slot ascending.
    const actors = units
      .filter((u) => u.alive)
      .sort((a, b) => (a.team === b.team ? a.slot - b.slot : a.team < b.team ? -1 : 1))

    for (const actor of actors) {
      if (!actor.alive) continue // may have died earlier this tick
      actor.cooldown -= 1
      if (actor.cooldown > 0) continue
      const target = selectTarget(actor, units)
      if (!target) continue
      events.push(...resolveAttack(actor, target, tick))
      actor.cooldown = actor.def.attackInterval
    }

    if (!teamAlive('A') || !teamAlive('B')) break
  }

  const winner: TeamId | 'draw' =
    teamAlive('A') && !teamAlive('B') ? 'A' : teamAlive('B') && !teamAlive('A') ? 'B' : 'draw'
  events.push({ type: 'end', tick, winner })
  return { winner, ticks: tick, events }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — simulateBattle 4개 테스트 + Task 2 테스트 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/engine/combat.ts src/engine/combat.test.ts
git commit -m "feat: deterministic battle simulation loop with win/draw resolution"
```

---

### Task 4: 전투 재생 렌더링 (Phaser로 지켜보기)

시뮬레이션 결과(BattleResult)를 화면에서 타임라인으로 재생한다. 데모 로스터로 두 팀을 붙여 "지켜보는" 첫 플레이 조각 완성.

**Files:**
- Create: `src/data/units.ts`
- Create: `src/render/BattleScene.ts`
- Modify: `src/main.ts` (BootScene → BattleScene 교체)

**Interfaces:**
- Consumes: `simulateBattle` (Task 3), 타입 `BattleResult`, `UnitDef`, `UnitState`, `BattleEvent`.
- Produces: 데모 데이터 `DEMO_TEAM_A`, `DEMO_TEAM_B` (`UnitDef[]`); Phaser 씬 `BattleScene`(외부 API 없음, main에서 등록만).

- [ ] **Step 1: 데모 로스터 작성** (`src/data/units.ts`)

```ts
import type { UnitDef } from '../engine/types'

// Original names only — no third-party IP. Placeholder stats for the demo.
export const DEMO_TEAM_A: UnitDef[] = [
  { id: 'moss-slime', name: '이끼슬라임', role: 'tank', faction: 'mushroom', maxHp: 140, attack: 12, attackInterval: 2 },
  { id: 'cap-shroom', name: '갓버섯', role: 'melee', faction: 'mushroom', maxHp: 90, attack: 26, attackInterval: 2 },
  { id: 'spore-shooter', name: '포자궁수', role: 'ranged', faction: 'mushroom', maxHp: 60, attack: 20, attackInterval: 1 },
]

export const DEMO_TEAM_B: UnitDef[] = [
  { id: 'stone-golem', name: '돌골렘', role: 'tank', faction: 'rock', maxHp: 160, attack: 14, attackInterval: 3 },
  { id: 'rock-brawler', name: '바위주먹', role: 'melee', faction: 'rock', maxHp: 100, attack: 24, attackInterval: 2 },
  { id: 'pebble-pixie', name: '조약돌픽시', role: 'ranged', faction: 'fairy', maxHp: 55, attack: 22, attackInterval: 1 },
]
```

- [ ] **Step 2: `BattleScene` 작성** (`src/render/BattleScene.ts`)

```ts
import Phaser from 'phaser'
import type { BattleEvent, BattleResult, UnitDef } from '../engine/types'
import { simulateBattle } from '../engine/combat'
import { DEMO_TEAM_A, DEMO_TEAM_B } from '../data/units'

const TICK_MS = 400 // playback speed: one battle tick every 400ms

interface UnitView {
  def: UnitDef
  maxHp: number
  hp: number
  box: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  hpText: Phaser.GameObjects.Text
}

export class BattleScene extends Phaser.Scene {
  private views = new Map<string, UnitView>()
  private result!: BattleResult

  constructor() {
    super('Battle')
  }

  create() {
    this.result = simulateBattle(DEMO_TEAM_A, DEMO_TEAM_B)
    this.drawTeam(DEMO_TEAM_A, 'A', 200, 0x00aa66)
    this.drawTeam(DEMO_TEAM_B, 'B', 600, 0xaa4444)
    this.playEvents()
  }

  private drawTeam(team: UnitDef[], teamId: 'A' | 'B', x: number, color: number) {
    team.forEach((def, slot) => {
      const y = 150 + slot * 120
      const box = this.add.rectangle(x, y, 90, 70, color)
      const label = this.add.text(x - 40, y - 55, def.name, { fontSize: '14px', color: '#fff' })
      const hpText = this.add.text(x - 40, y + 40, `${def.maxHp}/${def.maxHp}`, {
        fontSize: '12px',
        color: '#ffd',
      })
      this.views.set(`${teamId}#${slot}`, { def, maxHp: def.maxHp, hp: def.maxHp, box, label, hpText })
    })
  }

  private playEvents() {
    let i = 0
    this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => {
        if (i >= this.result.events.length) return
        // Apply all events belonging to the current tick step, one per timer fire.
        const ev = this.result.events[i++]
        this.applyEvent(ev)
      },
    })
  }

  private applyEvent(ev: BattleEvent) {
    if (ev.type === 'attack') {
      const view = this.views.get(ev.target)
      if (view) {
        view.hp = ev.targetHpAfter
        view.hpText.setText(`${view.hp}/${view.maxHp}`)
        this.tweens.add({ targets: view.box, alpha: 0.4, yoyo: true, duration: 100 })
      }
    } else if (ev.type === 'death') {
      const view = this.views.get(ev.unit)
      if (view) {
        view.box.setFillStyle(0x333333)
        view.label.setColor('#777')
      }
    } else if (ev.type === 'end') {
      const text = ev.winner === 'draw' ? '무승부' : `승자: ${ev.winner}팀`
      this.add.text(300, 20, text, { fontSize: '28px', color: '#ffff88' })
    }
  }
}
```

- [ ] **Step 3: `src/main.ts` 수정** (BootScene 제거, BattleScene 등록)

`src/main.ts` 전체를 아래로 교체:

```ts
import Phaser from 'phaser'
import { BattleScene } from './render/BattleScene'

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  backgroundColor: '#1d1d1d',
  scene: [BattleScene],
})
```

- [ ] **Step 4: 엔진 테스트 회귀 확인** (렌더 추가가 로직을 안 깼는지)

Run: `npm test`
Expected: PASS — 기존 전투 엔진 테스트 전부 통과(변경 없음).

- [ ] **Step 5: 브라우저에서 전투 재생 확인 (수동)**

Run: `npm run dev`
Expected: `http://localhost:5173`에서 좌(초록 A팀)·우(빨강 B팀) 각 3유닛이 보이고, 시간이 지나며 HP 숫자가 줄고, 죽은 유닛은 회색으로 변하며, 마지막에 "승자: X팀"이 뜬다. 확인 후 Ctrl+C.

- [ ] **Step 6: 포털용 빌드 확인 (수동)**

Run: `npm run build`
Expected: `dist/` 생성, 에러 없음. (상대 경로 빌드라 포털 업로드 가능한 상태.)

- [ ] **Step 7: 커밋**

```bash
git add src/data/units.ts src/render/BattleScene.ts src/main.ts
git commit -m "feat: render deterministic battle playback in Phaser with demo rosters"
```

---

## 이 계획 이후의 로드맵 (별도 계획으로 작성 예정)

이 계획이 끝나면 "자동 전투를 지켜보는" 조각이 완성된다. 이후 각 서브시스템은 **독립 계획**으로 이어서 작성한다(각자 돌아가는 결과물):

1. **스쿼드 편성 UI** — 보유 몬스터에서 팀을 드래그로 구성해 전투에 투입 (Vue 도입 지점).
2. **스테이지 진행(PvE)** — 지역별 스테이지·난이도 곡선·클리어 보상.
3. **진영 시너지** — 같은 진영 수에 따른 버프를 전투 엔진에 통합.
4. **방치 파밍 루프** — 오프라인 경과 시간 기반 자원 계산·수령.
5. **지휘관** — 팀 패시브 버프 + 액티브 스킬 1개를 전투 엔진에 통합.
6. **비동기 아레나** — Firebase 저장/조회 + 봇 스쿼드 시딩.
7. **펫(최소)** — 방치 보너스 1슬롯.
8. **광고 + 포털 배포** — 리워드 광고 연동, Poki/CrazyGames 업로드.

---

## Self-Review 결과

- **스펙 커버리지:** 이 계획은 기획서 §3.1(핵심 루프의 전투)·§3.3(오토배틀)·§4(웹기술·Phaser)를 다룬다. 방치·지휘관·아레나·펫·시너지·수익화는 위 로드맵의 별도 계획으로 명시 이관(스펙 §3.4~3.7, §5). 누락 없음.
- **플레이스홀더 스캔:** "TBD/적절히 처리" 등 없음. 모든 스텝에 실제 코드·명령·기대 출력 포함.
- **타입 일관성:** `instanceId` 포맷 `${team}#${slot}`가 createUnitState·selectTarget 테스트·resolveAttack·BattleScene 전반에서 일치. `BattleEvent` 3종(attack/death/end) 필드가 엔진 생성부와 렌더 소비부(applyEvent)에서 일치. `simulateBattle` 시그니처가 Task 3 정의와 Task 4 호출부에서 일치.
