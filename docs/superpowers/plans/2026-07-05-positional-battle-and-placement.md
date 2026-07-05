# 배치 전투 + 스쿼드 편성 + 반응형 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 유닛을 앞줄/뒷줄 보드에 배치하면 위치가 전투에 영향을 주고(근접은 앞줄을 못 뚫음, 원거리는 뒷줄 저격), 그 배치를 탭-투-플레이스 UI로 하며, 화면이 모바일에서 안 잘리게 반응형으로 만든다.

**Architecture:** 기존 결정론 전투 엔진에 위치(row/col)와 역할별 타겟팅을 **하위호환으로 추가**(기존 테스트 무변경)하고, Phaser 렌더/배치 UI가 이를 소비한다. 레이아웃 좌표는 공용 헬퍼로 분리해 두 씬이 공유한다.

**Tech Stack:** Vite + TypeScript + Phaser 3, Vitest.

## Global Constraints

- 전투 로직은 결정론적(랜덤 없음)이어야 한다.
- `src/engine/`는 Phaser를 import 하지 않는다 (순수 로직).
- 기존 전투 엔진 테스트(11개)는 변경 없이 계속 통과해야 한다(하위호환). 새 동작은 추가 테스트로 검증.
- 아트는 도형만. 이름은 전부 오리지널.
- 빌드는 상대 경로(`base: './'`)로 포털/Pages 업로드 가능해야 한다.
- 배치 보드: 팀당 2행(front/back) × 3열(col 0..2). 위치 타입 `{ row: 'front'|'back', col: number }`.
- 타겟팅 규칙(잠금): 근접(`tank`/`melee`)은 적 front 우선(front 전멸 시 back). 원거리·지원(`ranged`/`support`)은 적 back 우선(back 전멸 시 front). 동순위 정렬은 col 오름차순 → slot 오름차순. 완전 결정론.
- 배치 UI는 탭-투-플레이스(모바일 친화). 상대(B)는 고정 데모 스쿼드.

---

## File Structure

- `src/engine/types.ts` — 위치 타입 추가 (`Row`, `Position`, `Placement`), `UnitState.pos`.
- `src/engine/combat.ts` — `createUnitState`에 pos 추가, 역할·위치 인지 `selectTarget`, `simulateBattle`가 `UnitDef[] | Placement[]` 수용.
- `src/engine/combat.test.ts` — 위치 타겟팅·배치영향 테스트 추가(기존 테스트 유지).
- `src/render/layout.ts` — (신규) 논리 해상도·슬롯 좌표 헬퍼. 씬들이 공유.
- `src/data/units.ts` — 플레이어 배치용 유닛 풀 + 고정 적 배치.
- `src/render/BattleScene.ts` — 배치(row/col) 기반 2행 렌더 + 재생.
- `src/render/PlacementScene.ts` — (신규) 탭-투-플레이스 편성 화면.
- `src/main.ts` — Phaser Scale.FIT 반응형 + 씬 등록/시작.

---

### Task 1: 엔진 — 위치 + 역할 인지 타겟팅 (TDD)

**Files:**
- Modify: `src/engine/types.ts`
- Modify: `src/engine/combat.ts:3-20`
- Modify: `src/engine/combat.test.ts` (append new tests only; do not edit existing tests)

**Interfaces:**
- Consumes: 기존 `UnitDef`, `UnitState`, `TeamId`.
- Produces:
  - `Row = 'front' | 'back'`, `Position { row: Row; col: number }`, `Placement { def: UnitDef; pos: Position }` (types.ts)
  - `UnitState.pos: Position`
  - `createUnitState(def, team, slot, pos?: Position): UnitState` — pos 생략 시 `{ row: 'front', col: slot }`.
  - `selectTarget(attacker, units): UnitState | null` — 역할·위치 규칙(Global Constraints) 적용.

- [ ] **Step 1: types.ts에 위치 타입 추가**

`src/engine/types.ts`에서 `TeamId` 줄 아래에 추가:

```ts
export type Row = 'front' | 'back'
export interface Position {
  row: Row
  col: number
}
export interface Placement {
  def: UnitDef
  pos: Position
}
```

그리고 `UnitState`에 `pos` 필드 추가 (기존 인터페이스 내 `slot` 아래):

```ts
  slot: number
  pos: Position // board position; targeting depends on it
```

- [ ] **Step 2: 실패하는 위치 타겟팅 테스트 추가** (`src/engine/combat.test.ts` 맨 끝에 append)

```ts
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `createUnitState`가 4번째 인자를 모르고 `pos` 미존재, `selectTarget`이 위치 규칙 미적용으로 새 테스트 실패. 기존 11개는 통과.

- [ ] **Step 4: combat.ts 구현 수정**

`createUnitState`를 아래로 교체 (`src/engine/combat.ts:3-13`):

```ts
import type { UnitDef, UnitState, TeamId, BattleEvent, BattleResult, Position } from './types'

export function createUnitState(
  def: UnitDef,
  team: TeamId,
  slot: number,
  pos: Position = { row: 'front', col: slot },
): UnitState {
  return {
    instanceId: `${team}#${slot}`,
    def,
    team,
    slot,
    pos,
    hp: def.maxHp,
    cooldown: def.attackInterval,
    alive: true,
  }
}
```

`selectTarget`을 아래로 교체 (`src/engine/combat.ts:15-20`):

```ts
export function selectTarget(attacker: UnitState, units: UnitState[]): UnitState | null {
  const enemies = units.filter((u) => u.team !== attacker.team && u.alive)
  if (enemies.length === 0) return null
  const frontRow = enemies.filter((e) => e.pos.row === 'front')
  const backRow = enemies.filter((e) => e.pos.row === 'back')
  const isMelee = attacker.def.role === 'tank' || attacker.def.role === 'melee'
  // Melee is walled by the front row; ranged/support snipe the back row first.
  const pool = isMelee
    ? frontRow.length > 0 ? frontRow : backRow
    : backRow.length > 0 ? backRow : frontRow
  return [...pool].sort((a, b) => (a.pos.col !== b.pos.col ? a.pos.col - b.pos.col : a.slot - b.slot))[0]
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 기존 11개 + 새 4개 모두 통과. (기존 `selectTarget` 테스트는 slime=melee, 기본 front row라 규칙과 일치해 계속 통과.)

- [ ] **Step 6: 커밋**

```bash
git add src/engine/types.ts src/engine/combat.ts src/engine/combat.test.ts
git commit -m "feat: position-aware targeting (front-wall melee, back-snipe ranged)"
```

---

### Task 2: 엔진 — simulateBattle 배치 입력 + 배치가 결과를 바꾼다 (TDD)

**Files:**
- Modify: `src/engine/combat.ts:46-55`
- Modify: `src/engine/combat.test.ts` (append)

**Interfaces:**
- Consumes: Task 1의 `createUnitState(pos)`, `selectTarget`, `Placement`.
- Produces: `simulateBattle(teamA: TeamInput[], teamB: TeamInput[], opts?): BattleResult` where `TeamInput = UnitDef | Placement`. UnitDef가 오면 `{ row:'front', col: index }`로 승격.

- [ ] **Step 1: 실패하는 테스트 추가** (`src/engine/combat.test.ts` 맨 끝에 append)

```ts
import type { Placement } from './types'

describe('simulateBattle with placement', () => {
  // Same three units; only the player's positions differ.
  const glassCannon: UnitDef = { id: 'gc', name: '유리대포', role: 'ranged', faction: 'fairy', maxHp: 30, attack: 40, attackInterval: 1 }
  const wall: UnitDef = { id: 'w', name: '방벽', role: 'tank', faction: 'rock', maxHp: 300, attack: 5, attackInterval: 1 }
  const enemyBruiser: Placement[] = [
    { def: { id: 'br', name: '싸움꾼', role: 'melee', faction: 'rock', maxHp: 120, attack: 30, attackInterval: 1 }, pos: { row: 'front', col: 0 } },
  ]

  it('protecting the glass cannon behind a wall changes the outcome vs exposing it', () => {
    const protectedTeam: Placement[] = [
      { def: wall, pos: { row: 'front', col: 0 } },
      { def: glassCannon, pos: { row: 'back', col: 0 } },
    ]
    const exposedTeam: Placement[] = [
      { def: wall, pos: { row: 'back', col: 0 } },
      { def: glassCannon, pos: { row: 'front', col: 0 } },
    ]
    const protectedResult = simulateBattle(protectedTeam, enemyBruiser)
    const exposedResult = simulateBattle(exposedTeam, enemyBruiser)
    // Different positioning must produce a different battle.
    expect(protectedResult.events).not.toEqual(exposedResult.events)
  })

  it('still accepts plain UnitDef[] (back-compat) and stays deterministic', () => {
    const a = simulateBattle([wall], [glassCannon])
    const b = simulateBattle([wall], [glassCannon])
    expect(a.events).toEqual(b.events)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `simulateBattle`이 `Placement[]`(객체 `{def,pos}`)를 `UnitDef`로 잘못 다뤄 타입/런타임 오류 또는 위치 미반영으로 `protected`와 `exposed` 결과가 동일해 첫 테스트 실패.

- [ ] **Step 3: simulateBattle 수정** (`src/engine/combat.ts`)

`simulateBattle`을 아래로 교체 (`src/engine/combat.ts:46-55`의 시그니처와 units 구성 부분):

```ts
type TeamInput = UnitDef | Placement

function toPlacement(item: TeamInput, index: number): Placement {
  return 'def' in item ? item : { def: item, pos: { row: 'front', col: index } }
}

export function simulateBattle(
  teamA: TeamInput[],
  teamB: TeamInput[],
  opts: { maxTicks?: number } = {},
): BattleResult {
  const maxTicks = opts.maxTicks ?? 1000
  const units: UnitState[] = [
    ...teamA.map((it, i) => {
      const p = toPlacement(it, i)
      return createUnitState(p.def, 'A', i, p.pos)
    }),
    ...teamB.map((it, i) => {
      const p = toPlacement(it, i)
      return createUnitState(p.def, 'B', i, p.pos)
    }),
  ]
```

(이후 `const events` 이하 루프/승패 로직은 그대로 유지.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 기존 15개 + 새 2개 통과 (총 17 + smoke 1 = 18).

- [ ] **Step 5: 커밋**

```bash
git add src/engine/combat.ts src/engine/combat.test.ts
git commit -m "feat: simulateBattle accepts placements; positioning changes outcome"
```

---

### Task 3: 레이아웃 헬퍼 + 데이터 + 배치 기반 반응형 전투 렌더

**Files:**
- Create: `src/render/layout.ts`
- Modify: `src/data/units.ts`
- Modify: `src/render/BattleScene.ts` (전체 교체)
- Modify: `src/main.ts` (전체 교체 — Scale.FIT + BattleScene)

**Interfaces:**
- Consumes: `simulateBattle`, `Placement`, 타입들.
- Produces: `LOGICAL_W`, `LOGICAL_H`, `slotXY(team, row, col)` (layout.ts); `PLAYER_POOL: UnitDef[]`, `ENEMY_PLACEMENTS: Placement[]` (units.ts); `BattleScene`가 `init({ placements })`로 배치를 받음(없으면 데모).

- [ ] **Step 1: `src/render/layout.ts` 작성**

```ts
import type { TeamId, Row } from '../engine/types'

export const LOGICAL_W = 960
export const LOGICAL_H = 540
export const COLS = 3
export const ROWS: Row[] = ['front', 'back']

// Screen position for a board slot. Front rows sit closer to the center.
export function slotXY(team: TeamId, row: Row, col: number): { x: number; y: number } {
  const y = 120 + col * 140
  if (team === 'A') return { x: row === 'front' ? 300 : 140, y }
  return { x: row === 'front' ? LOGICAL_W - 300 : LOGICAL_W - 140, y }
}
```

- [ ] **Step 2: `src/data/units.ts` 교체**

```ts
import type { UnitDef, Placement } from '../engine/types'

// Units the player can place (palette). Original names only, no third-party IP.
export const PLAYER_POOL: UnitDef[] = [
  { id: 'moss-slime', name: '이끼슬라임', role: 'tank', faction: 'mushroom', maxHp: 220, attack: 10, attackInterval: 2 },
  { id: 'cap-shroom', name: '갓버섯', role: 'melee', faction: 'mushroom', maxHp: 120, attack: 26, attackInterval: 2 },
  { id: 'spore-archer', name: '포자궁수', role: 'ranged', faction: 'mushroom', maxHp: 70, attack: 24, attackInterval: 1 },
  { id: 'dew-fairy', name: '이슬요정', role: 'support', faction: 'fairy', maxHp: 80, attack: 18, attackInterval: 2 },
]

// Fixed enemy squad the player faces this build.
export const ENEMY_PLACEMENTS: Placement[] = [
  { def: { id: 'stone-golem', name: '돌골렘', role: 'tank', faction: 'rock', maxHp: 240, attack: 12, attackInterval: 3 }, pos: { row: 'front', col: 1 } },
  { def: { id: 'rock-brawler', name: '바위주먹', role: 'melee', faction: 'rock', maxHp: 130, attack: 24, attackInterval: 2 }, pos: { row: 'front', col: 0 } },
  { def: { id: 'pebble-pixie', name: '조약돌픽시', role: 'ranged', faction: 'fairy', maxHp: 65, attack: 22, attackInterval: 1 }, pos: { row: 'back', col: 1 } },
]
```

- [ ] **Step 3: `src/render/BattleScene.ts` 전체 교체**

```ts
import Phaser from 'phaser'
import type { BattleEvent, BattleResult, Placement, TeamId, UnitDef } from '../engine/types'
import { simulateBattle } from '../engine/combat'
import { ENEMY_PLACEMENTS, PLAYER_POOL } from '../data/units'
import { slotXY, LOGICAL_W } from './layout'

const TICK_MS = 350

interface UnitView {
  maxHp: number
  hp: number
  box: Phaser.GameObjects.Rectangle
  hpText: Phaser.GameObjects.Text
  label: Phaser.GameObjects.Text
}

// Default player squad if the scene is started without placement data.
const DEMO_PLAYER: Placement[] = [
  { def: PLAYER_POOL[0], pos: { row: 'front', col: 1 } },
  { def: PLAYER_POOL[1], pos: { row: 'front', col: 0 } },
  { def: PLAYER_POOL[2], pos: { row: 'back', col: 1 } },
]

export class BattleScene extends Phaser.Scene {
  private views = new Map<string, UnitView>()
  private player: Placement[] = DEMO_PLAYER

  constructor() {
    super('Battle')
  }

  init(data: { placements?: Placement[] }) {
    this.player = data.placements && data.placements.length > 0 ? data.placements : DEMO_PLAYER
    this.views = new Map()
  }

  create() {
    const result: BattleResult = simulateBattle(this.player, ENEMY_PLACEMENTS)
    this.drawTeam(this.player, 'A', 0x00aa66)
    this.drawTeam(ENEMY_PLACEMENTS, 'B', 0xaa4444)
    this.playEvents(result)
  }

  private drawTeam(placements: Placement[], team: TeamId, color: number) {
    placements.forEach((p, i) => {
      const def: UnitDef = p.def
      const { x, y } = slotXY(team, p.pos.row, p.pos.col)
      const box = this.add.rectangle(x, y, 84, 64, color)
      const label = this.add.text(x - 40, y - 52, def.name, { fontSize: '15px', color: '#fff' })
      const hpText = this.add.text(x - 40, y + 38, `${def.maxHp}/${def.maxHp}`, { fontSize: '13px', color: '#ffd' })
      this.views.set(`${team}#${i}`, { maxHp: def.maxHp, hp: def.maxHp, box, hpText, label })
    })
  }

  private playEvents(result: BattleResult) {
    let i = 0
    const timer = this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => {
        if (i >= result.events.length) {
          timer.remove()
          return
        }
        this.applyEvent(result.events[i++])
      },
    })
  }

  private applyEvent(ev: BattleEvent) {
    if (ev.type === 'attack') {
      const view = this.views.get(ev.target)
      if (view) {
        view.hp = ev.targetHpAfter
        view.hpText.setText(`${view.hp}/${view.maxHp}`)
        this.tweens.add({ targets: view.box, alpha: 0.4, yoyo: true, duration: 90 })
      }
    } else if (ev.type === 'death') {
      const view = this.views.get(ev.unit)
      if (view) {
        view.box.setFillStyle(0x333333)
        view.label.setColor('#777')
      }
    } else if (ev.type === 'end') {
      const text = ev.winner === 'draw' ? '무승부' : ev.winner === 'A' ? '승리!' : '패배...'
      this.add.text(LOGICAL_W / 2 - 60, 24, text, { fontSize: '32px', color: '#ffff88' })
    }
  }
}
```

- [ ] **Step 4: `src/main.ts` 전체 교체** (반응형 Scale.FIT)

```ts
import Phaser from 'phaser'
import { BattleScene } from './render/BattleScene'
import { LOGICAL_W, LOGICAL_H } from './render/layout'

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1d1d1d',
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

- [ ] **Step 5: 엔진 회귀 + 빌드 확인**

Run: `npm test`
Expected: PASS — 엔진 테스트 18개 그대로 통과(렌더는 엔진 미변경).

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음. (⚠️ `npm run dev`는 서버가 안 꺼지니 실행 금지 — 육안 확인은 배포 후 사람이 함.)

- [ ] **Step 6: 커밋**

```bash
git add src/render/layout.ts src/data/units.ts src/render/BattleScene.ts src/main.ts
git commit -m "feat: responsive 2-row positional battle rendering"
```

---

### Task 4: 배치 화면 (탭-투-플레이스) + 씬 흐름

**Files:**
- Create: `src/render/PlacementScene.ts`
- Modify: `src/main.ts` (씬 목록에 PlacementScene 추가하고 시작 씬으로)

**Interfaces:**
- Consumes: `slotXY`, `ROWS`, `COLS`, `LOGICAL_W`, `LOGICAL_H` (layout), `PLAYER_POOL`, `ENEMY_PLACEMENTS` (data), `Placement`, `UnitDef`, `Row`.
- Produces: `PlacementScene` — `this.scene.start('Battle', { placements })`로 전투 시작.

- [ ] **Step 1: `src/render/PlacementScene.ts` 작성**

```ts
import Phaser from 'phaser'
import type { Placement, Row, UnitDef } from '../engine/types'
import { PLAYER_POOL, ENEMY_PLACEMENTS } from '../data/units'
import { slotXY, ROWS, COLS, LOGICAL_W, LOGICAL_H } from './layout'

interface SlotBox {
  row: Row
  col: number
  rect: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

export class PlacementScene extends Phaser.Scene {
  private selected: UnitDef | null = null
  private placed = new Map<string, UnitDef>() // key: `${row}:${col}`
  private slots: SlotBox[] = []
  private poolTexts: Phaser.GameObjects.Text[] = []

  constructor() {
    super('Placement')
  }

  create() {
    this.selected = null
    this.placed = new Map()
    this.slots = []

    this.add.text(LOGICAL_W / 2 - 130, 16, '스쿼드 배치', { fontSize: '26px', color: '#fff' })

    // Player empty slots (team A).
    for (const row of ROWS) {
      for (let col = 0; col < COLS; col++) {
        const { x, y } = slotXY('A', row, col)
        const rect = this.add.rectangle(x, y, 84, 64, 0x223322).setStrokeStyle(2, 0x557755).setInteractive()
        const label = this.add.text(x - 38, y - 10, '빈 칸', { fontSize: '13px', color: '#7a7' })
        const slot: SlotBox = { row, col, rect, label }
        rect.on('pointerdown', () => this.onSlotTap(slot))
        this.slots.push(slot)
      }
    }

    // Enemy preview (team B), static.
    ENEMY_PLACEMENTS.forEach((p) => {
      const { x, y } = slotXY('B', p.pos.row, p.pos.col)
      this.add.rectangle(x, y, 84, 64, 0x553333)
      this.add.text(x - 40, y - 10, p.def.name, { fontSize: '13px', color: '#d99' })
    })

    // Unit palette at the bottom.
    this.add.text(40, LOGICAL_H - 96, '유닛 선택:', { fontSize: '16px', color: '#fff' })
    PLAYER_POOL.forEach((def, i) => {
      const t = this.add
        .text(40 + i * 190, LOGICAL_H - 64, `${def.name}\n(${roleLabel(def.role)})`, {
          fontSize: '15px',
          color: '#cfc',
          backgroundColor: '#2a3a2a',
          padding: { x: 8, y: 6 },
        })
        .setInteractive()
      t.on('pointerdown', () => this.onPoolTap(def, i))
      this.poolTexts.push(t)
    })

    // Start button.
    const startBtn = this.add
      .text(LOGICAL_W - 200, LOGICAL_H - 64, '⚔ 전투 시작', {
        fontSize: '20px',
        color: '#ffd',
        backgroundColor: '#445',
        padding: { x: 14, y: 10 },
      })
      .setInteractive()
    startBtn.on('pointerdown', () => this.startBattle())
  }

  private onPoolTap(def: UnitDef, index: number) {
    this.selected = def
    this.poolTexts.forEach((t, i) => t.setBackgroundColor(i === index ? '#4a6a4a' : '#2a3a2a'))
  }

  private onSlotTap(slot: SlotBox) {
    const key = `${slot.row}:${slot.col}`
    if (this.placed.has(key)) {
      // Tap a filled slot to clear it.
      this.placed.delete(key)
      slot.rect.setFillStyle(0x223322)
      slot.label.setText('빈 칸').setColor('#7a7')
      return
    }
    if (!this.selected) return
    this.placed.set(key, this.selected)
    slot.rect.setFillStyle(0x2f5f3f)
    slot.label.setText(this.selected.name).setColor('#eff')
  }

  private startBattle() {
    if (this.placed.size === 0) return
    const placements: Placement[] = []
    this.placed.forEach((def, key) => {
      const [row, colStr] = key.split(':')
      placements.push({ def, pos: { row: row as Row, col: Number(colStr) } })
    })
    this.scene.start('Battle', { placements })
  }
}

function roleLabel(role: UnitDef['role']): string {
  return role === 'tank' ? '탱커' : role === 'melee' ? '근접' : role === 'ranged' ? '원거리' : '지원'
}
```

- [ ] **Step 2: `src/main.ts` 씬 등록 수정** (PlacementScene을 먼저=시작 씬으로)

`src/main.ts`의 import와 `scene:` 배열만 수정:

```ts
import Phaser from 'phaser'
import { PlacementScene } from './render/PlacementScene'
import { BattleScene } from './render/BattleScene'
import { LOGICAL_W, LOGICAL_H } from './render/layout'

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1d1d1d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: LOGICAL_W,
    height: LOGICAL_H,
  },
  scene: [PlacementScene, BattleScene],
})
```

- [ ] **Step 3: 엔진 회귀 + 빌드 확인**

Run: `npm test`
Expected: PASS — 엔진 18개 통과.

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음. (`npm run dev` 실행 금지 — 육안 확인은 배포 후 사람이.)

- [ ] **Step 4: 커밋**

```bash
git add src/render/PlacementScene.ts src/main.ts
git commit -m "feat: tap-to-place squad placement screen with battle flow"
```

---

## Self-Review 결과
- **스펙 커버리지:** 위치 전투(§2.2) → Task 1; 배치가 결과에 영향(§5) → Task 2; 반응형(§2.4)·2행 렌더(§3.1) → Task 3; 탭-투-플레이스(§2.3) → Task 4. 누락 없음. 제외 항목(시너지·스테이지·방치 등)은 미포함(정상).
- **플레이스홀더 스캔:** 모든 스텝에 실제 코드/명령/기대결과 포함. "적절히 처리" 없음.
- **타입 일관성:** `Position`/`Row`/`Placement`가 types.ts 정의 → combat.ts·layout.ts·씬 전반 일치. `createUnitState(def,team,slot,pos?)` 시그니처가 Task 1 정의와 Task 2/3 호출부 일치. `instanceId=${team}#${i}`가 엔진 생성과 BattleScene 뷰 키 일치. `slotXY(team,row,col)`가 layout 정의와 두 씬 사용부 일치. `scene.start('Battle', { placements })` ↔ `BattleScene.init({ placements })` 키 일치.
