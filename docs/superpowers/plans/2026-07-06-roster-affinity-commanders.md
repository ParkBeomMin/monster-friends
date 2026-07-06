# 로스터 + 상성 + 지휘관 데이터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 진영+역할 상성(유리 ×1.3), 데이터 기반 몬스터 로스터, 데이터화된 지휘관 3명(서로 다른 스킬셋)을 추가한다. 결정론·기존 테스트 보존.

**Architecture:** 상성은 순수 함수 모듈(`affinity.ts`)로 `resolveCombat`이 배수를 곱함. 지휘관 스킬을 하드코딩에서 **효과 데이터 해석**으로 리팩터하되, 기본 지휘관을 기존 수치(18/6/45, 해금 2/4/6)로 두어 기존 테스트를 그대로 통과시킨다. 로스터/지휘관 콘텐츠는 `src/data/`.

**Tech Stack:** Vite + TS + Phaser 3, Vitest.

## Global Constraints
- 결정론(시드 PRNG만); `src/engine/` Phaser 미의존; 기존 battle/prng 테스트 무변경 통과(동진영·동역할 배수=1, 기본 지휘관=기존 수치).
- 상성: 진영 `mushroom→rock→toy→snow→fairy→mushroom`, 역할 `tank→ranged→melee→tank`(support 중립), 유리 시 ×1.3 누적, 최종 `Math.round`. **유닛 vs 유닛에만** 적용(히어로 직격·스킬 데미지 제외).
- 이름 오리지널; 도형/텍스트만; 상대경로 빌드.

## File Structure
- `src/engine/affinity.ts` (신규) — 상성 테이블 + `typeMultiplier`.
- `src/engine/affinity.test.ts` (신규).
- `src/engine/battle.ts` — `resolveCombat`에 상성 반영; 스킬 데이터화(SkillEffect/SkillDef/CommanderDef, DEFAULT_COMMANDER, state.commanders, createBattle 지휘관 인자, applySkill/nextSkillIndex/usePlayerSkill 리팩터, healHero).
- `src/engine/types.ts` — `Rarity` + `UnitDef.rarity?` 추가.
- `src/data/roster.ts` (신규) — 몬스터 로스터 + 덱.
- `src/data/commanders.ts` (신규) — 지휘관 3명.
- `src/render/BattleScene.ts` — 로스터 덱 + 지휘관 전달 + 스킬 이름 데이터에서.
- 삭제: `src/data/decks.ts` (로스터로 대체).

---

### Task 1: 상성 시스템 (TDD)

**Files:** Create `src/engine/affinity.ts`, `src/engine/affinity.test.ts`; Modify `src/engine/battle.ts` (resolveCombat), `src/engine/battle.test.ts` (append)

**Interfaces:**
- Produces: `typeMultiplier(atk: {faction,role}, def: {faction,role}): number`.
- `resolveCombat`의 유닛 피해가 `Math.round((attack+atkBonus) * typeMultiplier)`.

- [ ] **Step 1: affinity 테스트 작성** (`src/engine/affinity.test.ts`)

```ts
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
```

- [ ] **Step 2: 실패 확인** — `npm test` → FAIL (`./affinity` 미존재).

- [ ] **Step 3: affinity.ts 구현**

```ts
import type { Faction, Role } from './types'

// Each faction beats the next in the pentagon cycle.
const FACTION_BEATS: Record<Faction, Faction> = {
  mushroom: 'rock',
  rock: 'toy',
  toy: 'snow',
  snow: 'fairy',
  fairy: 'mushroom',
}

// Each role beats the next in the triangle; support is neutral (no entry).
const ROLE_BEATS: Partial<Record<Role, Role>> = {
  tank: 'ranged',
  ranged: 'melee',
  melee: 'tank',
}

const ADVANTAGE = 1.3

export function typeMultiplier(
  attacker: { faction: Faction; role: Role },
  defender: { faction: Faction; role: Role },
): number {
  let m = 1
  if (FACTION_BEATS[attacker.faction] === defender.faction) m *= ADVANTAGE
  if (ROLE_BEATS[attacker.role] === defender.role) m *= ADVANTAGE
  return m
}
```

- [ ] **Step 4: battle.ts `resolveCombat`에 상성 반영**

`resolveCombat`의 유닛 피해 분기만 수정한다. import에 `typeMultiplier` 추가:

```ts
import { typeMultiplier } from './affinity'
```

루프 본문을 아래로 (유닛 피해에 배수, 히어로 피해는 그대로):

```ts
  for (const actor of actors) {
    if (!actor.alive || state.winner) continue
    const base = actor.def.attack + state.atkBonus[team]
    const foe = frontmostEnemy(state, team, actor.lane)
    if (foe) {
      const damage = Math.round(base * typeMultiplier(actor.def, foe.def))
      foe.hp = Math.max(0, foe.hp - damage)
      events.push({
        type: 'attack',
        attacker: actor.instanceId,
        target: foe.instanceId,
        damage,
        targetHpAfter: foe.hp,
      })
      if (foe.hp <= 0 && foe.alive) {
        foe.alive = false
        events.push({ type: 'death', instanceId: foe.instanceId })
      }
    } else {
      const heroTeam = enemyOf(team)
      state.heroHp[heroTeam] = Math.max(0, state.heroHp[heroTeam] - base)
      events.push({
        type: 'heroDamage',
        attacker: actor.instanceId,
        heroTeam,
        damage: base,
        heroHpAfter: state.heroHp[heroTeam],
      })
      if (state.heroHp[heroTeam] <= 0) {
        state.winner = team
        events.push({ type: 'end', winner: team })
      }
    }
  }
```

- [ ] **Step 5: battle.test.ts에 상성 전투 테스트 추가** (append)

```ts
import { typeMultiplier as _tm } from './affinity'
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
```

(`BE`는 이미 이전 테스트 블록에서 `import type { BattleEvent as BE }`로 들여왔다. 중복 import 금지 — 이미 있으면 재선언하지 말 것.)

- [ ] **Step 6: 통과 확인** — `npm test` → PASS (기존 + affinity 6 + 전투 1). 동진영·동역할 기존 테스트는 배수 1로 무변경.

- [ ] **Step 7: 커밋**

```bash
git add src/engine/affinity.ts src/engine/affinity.test.ts src/engine/battle.ts src/engine/battle.test.ts
git commit -m "feat: faction+role affinity (x1.3) applied to unit combat"
```

---

### Task 2: 지휘관 스킬 데이터화 (TDD)

**Files:** Modify `src/engine/battle.ts`, `src/engine/battle.test.ts` (append)

**Interfaces:**
- Produces: `SkillEffect`, `SkillDef`, `CommanderDef`, `DEFAULT_COMMANDER`; `state.commanders`; `createBattle(...,commanders?)`; `applySkill`가 효과 해석; `nextSkillIndex`가 지휘관별 해금턴; `healHero` 효과.

- [ ] **Step 1: 실패 테스트 추가** (append)

```ts
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
```

- [ ] **Step 2: 실패 확인** — `npm test` → FAIL (`CommanderDef`/commanders 인자/healHero 미존재).

- [ ] **Step 3: battle.ts 리팩터**

3a. 스킬 타입 추가 (`BattleEvent` union 근처, export):

```ts
export type SkillEffect =
  | { kind: 'laneDamage'; amount: number }
  | { kind: 'teamAtkBonus'; amount: number }
  | { kind: 'heroDamage'; amount: number }
  | { kind: 'healHero'; amount: number }

export interface SkillDef {
  name: string
  unlockTurn: number
  effect: SkillEffect
  needsTarget: boolean
}

export interface CommanderDef {
  id: string
  name: string
  skills: SkillDef[]
}
```

3b. 기존 상수 교체 — `SKILL_UNLOCK_TURN`/`SKILL_NAMES`/`SKILL1_LANE_DAMAGE`/`SKILL2_ATK_BONUS`/`SKILL3_HERO_DAMAGE`를 지우고 `DEFAULT_COMMANDER`로 대체:

```ts
export const SKILL_UNLOCK_TURN = [2, 4, 6]

export const DEFAULT_COMMANDER: CommanderDef = {
  id: 'default',
  name: '기본 지휘관',
  skills: [
    { name: '집중포화', unlockTurn: SKILL_UNLOCK_TURN[0], effect: { kind: 'laneDamage', amount: 18 }, needsTarget: true },
    { name: '진군나팔', unlockTurn: SKILL_UNLOCK_TURN[1], effect: { kind: 'teamAtkBonus', amount: 6 }, needsTarget: false },
    { name: '최후의일격', unlockTurn: SKILL_UNLOCK_TURN[2], effect: { kind: 'heroDamage', amount: 45 }, needsTarget: false },
  ],
}
```

3c. `BattleState`에 `commanders` 추가:

```ts
  desperations: { A: number; B: number }
  commanders: { A: CommanderDef; B: CommanderDef }
```

3d. `createBattle`에 지휘관 인자 추가 (config 뒤 5번째, 기본 DEFAULT_COMMANDER):

```ts
export function createBattle(
  deckA: UnitDef[],
  deckB: UnitDef[],
  seed: number,
  config: BattleConfig = DEFAULT_CONFIG,
  commanders: { A: CommanderDef; B: CommanderDef } = { A: DEFAULT_COMMANDER, B: DEFAULT_COMMANDER },
): BattleState {
```

그리고 return 객체에 `commanders,` 추가 (desperations 아래).

3e. `nextSkillIndex`를 지휘관 기반으로 교체:

```ts
export function nextSkillIndex(state: BattleState, team: TeamId): number | null {
  const used = state.skillsUsed[team]
  const skills = state.commanders[team].skills
  if (used >= skills.length) return null
  if (state.turn < skills[used].unlockTurn) return null
  return used
}
```

3f. `applySkill`을 효과 해석으로 교체:

```ts
function applySkill(
  state: BattleState,
  team: TeamId,
  skillIndex: number,
  targetLane: number,
  events: BattleEvent[],
): void {
  const skill = state.commanders[team].skills[skillIndex]
  const e = skill.effect
  events.push({ type: 'skill', team, skillIndex, targetLane: skill.needsTarget ? targetLane : undefined })
  if (e.kind === 'laneDamage') {
    const foes = state.units.filter(
      (u) => u.alive && u.team === enemyOf(team) && u.lane === targetLane,
    )
    for (const foe of foes) {
      foe.hp = Math.max(0, foe.hp - e.amount)
      if (foe.hp <= 0 && foe.alive) {
        foe.alive = false
        events.push({ type: 'death', instanceId: foe.instanceId })
      }
    }
  } else if (e.kind === 'teamAtkBonus') {
    state.atkBonus[team] += e.amount
  } else if (e.kind === 'heroDamage') {
    const heroTeam = enemyOf(team)
    state.heroHp[heroTeam] = Math.max(0, state.heroHp[heroTeam] - e.amount)
    events.push({
      type: 'heroDamage',
      attacker: `${team}:commander`,
      heroTeam,
      damage: e.amount,
      heroHpAfter: state.heroHp[heroTeam],
    })
    if (state.heroHp[heroTeam] <= 0) {
      state.winner = team
      events.push({ type: 'end', winner: team })
    }
  } else if (e.kind === 'healHero') {
    state.heroHp[team] = Math.min(state.config.heroHp, state.heroHp[team] + e.amount)
  }
  state.skillsUsed[team] += 1
}
```

3g. `usePlayerSkill`의 타게팅 판정을 `needsTarget` 기반으로:

```ts
export function usePlayerSkill(state: BattleState, targetLane?: number): BattleEvent[] {
  const events: BattleEvent[] = []
  if (state.winner || state.active !== 'A') return events
  if (state.skillUsedThisTurn) return events
  const idx = nextSkillIndex(state, 'A')
  if (idx === null) return events
  const skill = state.commanders.A.skills[idx]
  if (skill.needsTarget) {
    if (targetLane === undefined || targetLane < 0 || targetLane >= state.config.lanes) return events
  }
  applySkill(state, 'A', idx, targetLane ?? 0, events)
  state.skillUsedThisTurn = true
  return events
}
```

(참고: `SKILL_NAMES`를 쓰던 UI(BattleScene)는 Task 4에서 교체한다. 이 태스크에서 `SKILL_NAMES` export를 제거하면 UI 빌드가 깨지므로, 하위호환용으로 유지한다: `export const SKILL_NAMES = DEFAULT_COMMANDER.skills.map((s) => s.name)`)

- [ ] **Step 4: 통과 확인** — `npm test` → PASS (기존 전부 + 새 3개). 기본 지휘관이 기존 수치라 기존 스킬 테스트 무변경 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/engine/battle.ts src/engine/battle.test.ts
git commit -m "refactor: data-driven commander skills (effect interpreter) + healHero"
```

---

### Task 3: 몬스터 로스터 + 지휘관 데이터 + rarity

**Files:** Modify `src/engine/types.ts`; Create `src/data/roster.ts`, `src/data/commanders.ts`; (Task 4에서 `src/data/decks.ts` 삭제)

**Interfaces:**
- Produces: `Rarity`, `UnitDef.rarity?`; `ROSTER: UnitDef[]`, `PLAYER_DECK`/`ENEMY_DECK` (roster.ts); `AGNI`/`GAIA`/`PRIMA: CommanderDef` (commanders.ts).

- [ ] **Step 1: types.ts에 rarity 추가**

`Role`/`Faction` 근처에 추가하고 `UnitDef`에 선택 필드:

```ts
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
```

`UnitDef` 인터페이스에 추가:

```ts
  attackInterval: number
  rarity?: Rarity
```

- [ ] **Step 2: `src/data/roster.ts` 작성** (진영당 3~4종, 오리지널 이름)

```ts
import type { UnitDef } from '../engine/types'

function m(
  id: string, name: string, faction: UnitDef['faction'], role: UnitDef['role'],
  rarity: UnitDef['rarity'], maxHp: number, attack: number,
): UnitDef {
  return { id, name, faction, role, rarity, maxHp, attack, attackInterval: 1 }
}

export const ROSTER: UnitDef[] = [
  // 🍄 mushroom
  m('moss-slime', '이끼슬라임', 'mushroom', 'tank', 'common', 60, 8),
  m('cap-shroom', '갓버섯', 'mushroom', 'melee', 'common', 34, 16),
  m('spore-archer', '포자궁수', 'mushroom', 'ranged', 'rare', 24, 20),
  m('dew-fairy-m', '이슬요정', 'mushroom', 'support', 'rare', 30, 14),
  // 🪨 rock
  m('stone-golem', '돌골렘', 'rock', 'tank', 'common', 72, 9),
  m('rock-brawler', '바위주먹', 'rock', 'melee', 'common', 40, 15),
  m('sling-gnome', '투석노움', 'rock', 'ranged', 'rare', 26, 19),
  m('boulder-titan', '바위거신', 'rock', 'tank', 'epic', 95, 12),
  // ⚙️ toy
  m('tin-guard', '양철수문장', 'toy', 'tank', 'common', 64, 8),
  m('wind-up-bear', '태엽곰', 'toy', 'melee', 'rare', 42, 18),
  m('dart-doll', '다트인형', 'toy', 'ranged', 'common', 22, 17),
  m('gear-oracle', '톱니현자', 'toy', 'support', 'epic', 34, 16),
  // ❄️ snow
  m('snow-sentinel', '눈파수꾼', 'snow', 'tank', 'common', 66, 9),
  m('icicle-lancer', '고드름창병', 'snow', 'melee', 'rare', 38, 19),
  m('frost-imp', '서리도깨비', 'snow', 'ranged', 'common', 24, 18),
  m('blizzard-elder', '눈보라장로', 'snow', 'support', 'legendary', 40, 22),
  // 🧚 fairy
  m('pebble-pixie', '조약돌픽시', 'fairy', 'ranged', 'common', 26, 19),
  m('thorn-sprite', '가시정령', 'fairy', 'melee', 'common', 36, 17),
  m('bloom-guardian', '개화수호정', 'fairy', 'tank', 'rare', 62, 10),
  m('moon-priestess', '달빛무녀', 'fairy', 'support', 'epic', 34, 18),
]

const byId = (id: string): UnitDef => {
  const found = ROSTER.find((u) => u.id === id)
  if (!found) throw new Error(`unknown roster id: ${id}`)
  return found
}

// 8-card decks drawn from the roster.
export const PLAYER_DECK: UnitDef[] = [
  byId('moss-slime'), byId('cap-shroom'), byId('spore-archer'), byId('dew-fairy-m'),
  byId('thorn-sprite'), byId('bloom-guardian'), byId('icicle-lancer'), byId('gear-oracle'),
]
export const ENEMY_DECK: UnitDef[] = [
  byId('stone-golem'), byId('rock-brawler'), byId('sling-gnome'), byId('boulder-titan'),
  byId('tin-guard'), byId('wind-up-bear'), byId('dart-doll'), byId('frost-imp'),
]
```

- [ ] **Step 3: `src/data/commanders.ts` 작성**

```ts
import type { CommanderDef } from '../engine/battle'

export const AGNI: CommanderDef = {
  id: 'agni',
  name: '아그니',
  skills: [
    { name: '집중포화', unlockTurn: 2, effect: { kind: 'laneDamage', amount: 20 }, needsTarget: true },
    { name: '진군나팔', unlockTurn: 4, effect: { kind: 'teamAtkBonus', amount: 6 }, needsTarget: false },
    { name: '최후의일격', unlockTurn: 6, effect: { kind: 'heroDamage', amount: 45 }, needsTarget: false },
  ],
}

export const GAIA: CommanderDef = {
  id: 'gaia',
  name: '가이아',
  skills: [
    { name: '재생', unlockTurn: 2, effect: { kind: 'healHero', amount: 40 }, needsTarget: false },
    { name: '전열강화', unlockTurn: 5, effect: { kind: 'teamAtkBonus', amount: 8 }, needsTarget: false },
    { name: '대지분쇄', unlockTurn: 7, effect: { kind: 'laneDamage', amount: 26 }, needsTarget: true },
  ],
}

export const PRIMA: CommanderDef = {
  id: 'prima',
  name: '프리마',
  skills: [
    { name: '서리파편', unlockTurn: 2, effect: { kind: 'laneDamage', amount: 15 }, needsTarget: true },
    { name: '서리폭풍', unlockTurn: 4, effect: { kind: 'laneDamage', amount: 15 }, needsTarget: true },
    { name: '절대영도', unlockTurn: 7, effect: { kind: 'heroDamage', amount: 55 }, needsTarget: false },
  ],
}

export const COMMANDERS: CommanderDef[] = [AGNI, GAIA, PRIMA]
```

- [ ] **Step 4: 로스터 검증 테스트** (`src/data/roster.test.ts`)

```ts
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
```

- [ ] **Step 5: 통과 확인** — `npm test` → PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/engine/types.ts src/data/roster.ts src/data/commanders.ts src/data/roster.test.ts
git commit -m "feat: monster roster (5 factions) + 3 data-driven commanders + rarity"
```

---

### Task 4: UI 연결 (로스터 덱 + 지휘관 전달 + 스킬 이름 데이터화)

**Files:** Modify `src/render/BattleScene.ts`; Delete `src/data/decks.ts`

**Interfaces:**
- Consumes: `PLAYER_DECK`/`ENEMY_DECK` (roster.ts), `AGNI`/`GAIA` (commanders.ts), `state.commanders`.

- [ ] **Step 1: 구 덱 파일 삭제 + import 교체**

```bash
git rm src/data/decks.ts
```

`BattleScene.ts` 상단 import에서 `../data/decks` → `../data/roster`로, 그리고 지휘관 import 추가:

```ts
import { PLAYER_DECK, ENEMY_DECK } from '../data/roster'
import { AGNI, GAIA } from '../data/commanders'
```

`SKILL_NAMES` import는 제거하고, battle import에 필요한 것만 유지(`createBattle, playerDeploy, usePlayerSkill, usePlayerDesperation, nextSkillIndex, DEFAULT_CONFIG`).

- [ ] **Step 2: createBattle 호출에 지휘관 전달** (`create()` 내부)

```ts
    this.state = createBattle(PLAYER_DECK, ENEMY_DECK, SEED, DEFAULT_CONFIG, { A: AGNI, B: GAIA })
```

- [ ] **Step 3: drawSkills가 지휘관 데이터의 이름·개수 사용**

`drawSkills`에서 `SKILL_NAMES.forEach(...)`를 아래로 교체:

```ts
    const skills = this.state.commanders.A.skills
    skills.forEach((skill, i) => {
      const used = i < this.state.skillsUsed.A
      const available =
        !this.state.winner && nextSkillIndex(this.state, 'A') === i && !this.state.skillUsedThisTurn
      const label = used ? `✔ ${skill.name}` : available ? `▶ ${skill.name}` : `🔒 ${skill.name}`
      const color = used ? 0x333333 : available ? 0x4a6a2a : 0x2a2a2a
      const btn = this.track(this.add.rectangle(baseX + 70, y, 140, 30, color).setStrokeStyle(1, 0x557755))
      this.track(this.add.text(baseX + 8, y - 9, label, { fontSize: '13px', color: '#dfd' }))
      if (available) {
        btn.setInteractive()
        btn.on('pointerdown', () => this.onSkillTap(i))
      }
      y += 34
    })
```

(나머지 결단 버튼/타게팅 로직은 그대로. `onSkillTap`의 `i === 0` 분기(타게팅)는 기본 지휘관·아그니 기준 스킬0이 laneDamage(needsTarget)라 유효하나, **일반화**를 위해 `this.state.commanders.A.skills[i].needsTarget` 여부로 타게팅 진입을 판단하도록 `onSkillTap`을 교체:)

```ts
  private onSkillTap(i: number) {
    if (this.state.winner) return
    if (this.state.commanders.A.skills[i].needsTarget) {
      this.targetingSkill = true
      this.redraw()
      return
    }
    usePlayerSkill(this.state)
    this.redraw()
  }
```

- [ ] **Step 4: 테스트 + 빌드 확인**

Run: `npm test` → PASS (엔진/데이터 테스트).
Run: `npm run build` → 성공, 타입 에러 없음, `../data/decks` 참조 잔존 없음. (`npm run dev` 금지.)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: wire roster decks + Agni/Gaia commanders + data-driven skill UI"
```

---

## Self-Review 결과
- **스펙 커버리지:** 상성(§2.1) → Task1; 지휘관 데이터화(§2.3) → Task2; 로스터(§2.2)+지휘관 콘텐츠 → Task3; UI 연결(§3.1) → Task4.
- **플레이스홀더 스캔:** 실제 코드/명령/기대결과 포함.
- **타입 일관성:** `typeMultiplier` 시그니처(affinity↔battle↔test) 일치. `CommanderDef`/`SkillEffect`가 battle.ts 정의 ↔ commanders.ts/씬 사용 일치. `createBattle(...,commanders?)` 5인자가 Task2 정의 ↔ Task4 호출 일치. `state.commanders.A.skills[i].name/needsTarget`가 UI에서 일치. 기본 지휘관=기존 수치(18/6/45)라 기존 스킬 테스트, 동타입 배수=1이라 기존 전투 테스트 보존. `SKILL_NAMES`는 하위호환 유지 후 Task4에서 UI가 데이터로 전환.
