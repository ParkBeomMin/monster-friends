# 지휘관 스킬 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** 지휘관(=히어로)에 순차 해금 스킬 3개(집중포화/진군나팔/최후의일격)와 소진 후 HP 소모 "결단"을 추가하고, 상대 AI도 스킬을 쓰며, UI에 스킬 버튼·레인 타게팅을 붙인다. 결정론 유지.

**Architecture:** `src/engine/battle.ts`에 스킬 상태(`skillsUsed`/`atkBonus`/`desperations`)와 순수 함수(`usePlayerSkill`/`usePlayerDesperation`/AI 스킬)를 추가(TDD). 씬은 상태에서 다시 그리기 유지 + 스킬 버튼/타게팅.

**Tech Stack:** Vite + TS + Phaser 3, Vitest.

## Global Constraints
- 결정론(시드 PRNG만); `src/engine/` Phaser 미의존; 기존 battle/prng 테스트 무변경 통과.
- 스킬 사용은 턴을 넘기지 않음(배치가 넘김). 한 턴에 스킬 1회 + 배치 1회.
- 스킬 순차: i는 `turn >= [2,4,6][i]` 그리고 `skillsUsed===i`일 때만.
- 스킬 효과(숫자 튜닝 가능): ①지정 레인 적 전체 18딜 ②내 팀 공격력 +6(누적) ③상대 히어로 45딜. 결단: 상대히어로 `25+15*d`딜 / 내HP `12+8*d` 소모.
- 결단은 플레이어 전용. AI는 스킬만(결단 미사용). AI 스킬1 대상 = A 유닛 최다 레인(동률 최소 인덱스).
- 도형/텍스트만; 오리지널 이름; 상대경로 빌드.

## File Structure
- `src/engine/battle.ts` — 스킬 상태/효과/결단/AI 스킬 추가; `resolveCombat`에 `atkBonus` 반영.
- `src/engine/battle.test.ts` — 스킬/결단/결정론 테스트 추가.
- `src/render/BattleScene.ts` — 스킬 버튼 + 레인 타게팅 + 결단 버튼.

---

### Task 1: 엔진 — 스킬 상태 + 스킬 1~3 효과 + 공격력 보너스 (TDD)

**Files:** Modify `src/engine/battle.ts`, `src/engine/battle.test.ts` (append)

**Interfaces:**
- Produces: state 필드 `atkBonus/skillsUsed/desperations`; `SKILL_UNLOCK_TURN`, `SKILL_NAMES`; `nextSkillIndex(state,team):number|null`; `usePlayerSkill(state, targetLane?):BattleEvent[]`; `resolveCombat`이 `def.attack + atkBonus[team]`로 계산.

- [ ] **Step 1: 실패 테스트 추가** (`battle.test.ts` 맨 끝 append)

```ts
import { nextSkillIndex, usePlayerSkill, resolveCombat, deployUnit, SKILL_UNLOCK_TURN } from './battle'
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
})
```

- [ ] **Step 2: 실패 확인** — Run `npm test`; Expected: FAIL (`nextSkillIndex`/`usePlayerSkill`/`SKILL_UNLOCK_TURN` 미존재, `atkBonus` 미존재).

- [ ] **Step 3: battle.ts 수정**

3a. `BattleEvent` union에 스킬/결단 이벤트 추가 (`battle.ts:30-35` union 끝에 추가):

```ts
  | { type: 'skill'; team: TeamId; skillIndex: number; targetLane?: number }
  | { type: 'desperation'; team: TeamId; heroDamage: number; selfCost: number }
```

3b. `BattleState`에 필드 추가 (`battle.ts:47` `nextInstance` 아래):

```ts
  nextInstance: number
  atkBonus: { A: number; B: number }
  skillsUsed: { A: number; B: number }
  desperations: { A: number; B: number }
```

3c. `createBattle` return 객체에 초기값 추가 (`battle.ts:73` `nextInstance: 0,` 아래):

```ts
    nextInstance: 0,
    atkBonus: { A: 0, B: 0 },
    skillsUsed: { A: 0, B: 0 },
    desperations: { A: 0, B: 0 },
```

3d. `resolveCombat`의 데미지 계산을 보너스 반영으로 교체. `battle.ts:119-150` 루프 본문에서 `actor.def.attack`을 쓰는 두 곳을 `damage` 변수로 대체 — 루프 상단에 `const damage = actor.def.attack + state.atkBonus[team]` 추가하고, `foe.hp - actor.def.attack` → `foe.hp - damage`, `attack` 이벤트의 `damage: actor.def.attack` → `damage`, 히어로쪽 `- actor.def.attack` → `- damage`, `damage: actor.def.attack` → `damage`. 최종 형태:

```ts
  for (const actor of actors) {
    if (!actor.alive || state.winner) continue
    const damage = actor.def.attack + state.atkBonus[team]
    const foe = frontmostEnemy(state, team, actor.lane)
    if (foe) {
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
      state.heroHp[heroTeam] = Math.max(0, state.heroHp[heroTeam] - damage)
      events.push({
        type: 'heroDamage',
        attacker: actor.instanceId,
        heroTeam,
        damage,
        heroHpAfter: state.heroHp[heroTeam],
      })
      if (state.heroHp[heroTeam] <= 0) {
        state.winner = team
        events.push({ type: 'end', winner: team })
      }
    }
  }
```

3e. 스킬 상수 + 함수 추가 (`battle.ts` 파일 끝, `playerDeploy` 아래에 추가):

```ts
export const SKILL_UNLOCK_TURN = [2, 4, 6]
export const SKILL_NAMES = ['집중포화', '진군나팔', '최후의일격']
const SKILL1_LANE_DAMAGE = 18
const SKILL2_ATK_BONUS = 6
const SKILL3_HERO_DAMAGE = 45

// The next usable skill index for a team, or null if none is unlocked yet.
export function nextSkillIndex(state: BattleState, team: TeamId): number | null {
  const used = state.skillsUsed[team]
  if (used >= 3) return null
  if (state.turn < SKILL_UNLOCK_TURN[used]) return null
  return used
}

function applySkill(
  state: BattleState,
  team: TeamId,
  skillIndex: number,
  targetLane: number,
  events: BattleEvent[],
): void {
  events.push({ type: 'skill', team, skillIndex, targetLane })
  if (skillIndex === 0) {
    const foes = state.units.filter(
      (u) => u.alive && u.team === enemyOf(team) && u.lane === targetLane,
    )
    for (const foe of foes) {
      foe.hp = Math.max(0, foe.hp - SKILL1_LANE_DAMAGE)
      if (foe.hp <= 0 && foe.alive) {
        foe.alive = false
        events.push({ type: 'death', instanceId: foe.instanceId })
      }
    }
  } else if (skillIndex === 1) {
    state.atkBonus[team] += SKILL2_ATK_BONUS
  } else if (skillIndex === 2) {
    const heroTeam = enemyOf(team)
    state.heroHp[heroTeam] = Math.max(0, state.heroHp[heroTeam] - SKILL3_HERO_DAMAGE)
    events.push({
      type: 'heroDamage',
      attacker: `${team}:commander`,
      heroTeam,
      damage: SKILL3_HERO_DAMAGE,
      heroHpAfter: state.heroHp[heroTeam],
    })
    if (state.heroHp[heroTeam] <= 0) {
      state.winner = team
      events.push({ type: 'end', winner: team })
    }
  }
  state.skillsUsed[team] += 1
}

// Player (team A) uses their next unlocked skill. Skill 0 needs a targetLane.
export function usePlayerSkill(state: BattleState, targetLane?: number): BattleEvent[] {
  const events: BattleEvent[] = []
  if (state.winner || state.active !== 'A') return events
  const idx = nextSkillIndex(state, 'A')
  if (idx === null) return events
  if (idx === 0) {
    if (targetLane === undefined || targetLane < 0 || targetLane >= state.config.lanes) return events
  }
  applySkill(state, 'A', idx, targetLane ?? 0, events)
  return events
}
```

- [ ] **Step 4: 통과 확인** — Run `npm test`; Expected: PASS (기존 battle/prng 테스트 + 새 5개).

- [ ] **Step 5: 커밋**

```bash
git add src/engine/battle.ts src/engine/battle.test.ts
git commit -m "feat: commander skills 1-3 (lane AoE, team atk buff, hero strike) + atk bonus in combat"
```

---

### Task 2: 엔진 — 결단(HP 소모) + AI 스킬 사용 + 결정론 (TDD)

**Files:** Modify `src/engine/battle.ts`, `src/engine/battle.test.ts` (append)

**Interfaces:**
- Produces: `usePlayerDesperation(state):BattleEvent[]`; `aiTurn`이 B의 스킬을 배치 전 사용.

- [ ] **Step 1: 실패 테스트 추가** (`battle.test.ts` append)

```ts
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
    usePlayerDesperation(s) // d=0: 25 to B, 12 to A
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - 25)
    expect(s.heroHp.A).toBe(DEFAULT_CONFIG.heroHp - 12)
    usePlayerDesperation(s) // d=1: 40 to B, 20 to A
    expect(s.heroHp.B).toBe(DEFAULT_CONFIG.heroHp - 25 - 40)
    expect(s.heroHp.A).toBe(DEFAULT_CONFIG.heroHp - 12 - 20)
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
```

- [ ] **Step 2: 실패 확인** — Run `npm test`; Expected: FAIL (`usePlayerDesperation` 미존재; AI 스킬 미사용으로 `skillsUsed.B` 0).

- [ ] **Step 3: battle.ts 수정**

3a. 결단 상수 + 함수 추가 (파일 끝에 추가):

```ts
const DESP_HERO_BASE = 25
const DESP_HERO_STEP = 15
const DESP_SELF_BASE = 12
const DESP_SELF_STEP = 8

// Player-only "결단": strike the enemy hero at the cost of own hero HP; both escalate.
export function usePlayerDesperation(state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = []
  if (state.winner || state.active !== 'A') return events
  if (state.skillsUsed.A < 3) return events
  const d = state.desperations.A
  const heroDamage = DESP_HERO_BASE + DESP_HERO_STEP * d
  const selfCost = DESP_SELF_BASE + DESP_SELF_STEP * d
  state.heroHp.B = Math.max(0, state.heroHp.B - heroDamage)
  state.heroHp.A = Math.max(0, state.heroHp.A - selfCost)
  state.desperations.A += 1
  events.push({ type: 'desperation', team: 'A', heroDamage, selfCost })
  if (state.heroHp.B <= 0) {
    state.winner = 'A'
    events.push({ type: 'end', winner: 'A' })
  } else if (state.heroHp.A <= 0) {
    state.winner = 'B'
    events.push({ type: 'end', winner: 'B' })
  }
  return events
}
```

3b. AI가 스킬을 쓰도록 `aiTurn` 교체 (`battle.ts:176-183`):

```ts
function aiSkillLane(state: BattleState): number {
  // Lane with the most player (A) units; ties → lowest lane index.
  let best = 0
  let bestCount = -1
  for (let lane = 0; lane < state.config.lanes; lane++) {
    const count = state.units.filter((u) => u.alive && u.team === 'A' && u.lane === lane).length
    if (count > bestCount) {
      bestCount = count
      best = lane
    }
  }
  return best
}

function aiTurn(state: BattleState, events: BattleEvent[]): void {
  const skillIdx = nextSkillIndex(state, 'B')
  if (skillIdx !== null) {
    const lane = skillIdx === 0 ? aiSkillLane(state) : 0
    applySkill(state, 'B', skillIdx, lane, events)
  }
  if (state.winner) return
  drawToHand(state, 'B')
  if (state.hands.B.length > 0) {
    const cell = chooseAiCell(state)
    if (cell) deployUnit(state, 'B', 0, cell.lane, cell.col, events)
  }
  resolveCombat(state, 'B', events)
}
```

(`applySkill`/`nextSkillIndex`는 Task 1에서 이미 정의됨. `aiTurn`은 `applySkill` 정의보다 위에 있지만 함수 선언 호이스팅으로 문제없음 — 둘 다 `function` 선언.)

- [ ] **Step 4: 통과 확인** — Run `npm test`; Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/engine/battle.ts src/engine/battle.test.ts
git commit -m "feat: HP-cost desperation + deterministic AI skill usage"
```

---

### Task 3: UI — 스킬 버튼 + 레인 타게팅 + 결단 버튼 (빌드 검증)

**Files:** Modify `src/render/BattleScene.ts`

**Interfaces:**
- Consumes: `usePlayerSkill`, `usePlayerDesperation`, `nextSkillIndex`, `SKILL_NAMES` (battle.ts).
- Produces: 플레이어 턴에 스킬 3버튼(잠금/사용가능/사용됨) + 결단 버튼; 스킬1은 탭 후 레인 타게팅 모드.

- [ ] **Step 1: BattleScene에 스킬 UI 통합**

`src/render/BattleScene.ts` 상단 import에 추가:

```ts
import { createBattle, playerDeploy, usePlayerSkill, usePlayerDesperation, nextSkillIndex, SKILL_NAMES, DEFAULT_CONFIG } from '../engine/battle'
```

클래스 필드에 추가 (`selectedHand` 근처):

```ts
  private targetingSkill = false
```

`redraw()` 안에서 `if (this.state.winner) this.drawResult()` 바로 앞에 `this.drawSkills()` 호출 추가:

```ts
    this.drawHand()
    this.drawSkills()
    if (this.state.winner) this.drawResult()
```

`drawResult` 아래에 메서드 추가:

```ts
  private drawSkills() {
    const baseX = 8
    let y = 360
    SKILL_NAMES.forEach((name, i) => {
      const used = i < this.state.skillsUsed.A
      const available = !this.state.winner && nextSkillIndex(this.state, 'A') === i
      const label = used ? `✔ ${name}` : available ? `▶ ${name}` : `🔒 ${name}`
      const color = used ? 0x333333 : available ? 0x4a6a2a : 0x2a2a2a
      const btn = this.track(this.add.rectangle(baseX + 70, y, 140, 34, color).setStrokeStyle(1, 0x557755))
      this.track(this.add.text(baseX + 8, y - 9, label, { fontSize: '13px', color: '#dfd' }))
      if (available) {
        btn.setInteractive()
        btn.on('pointerdown', () => this.onSkillTap(i))
      }
      y += 42
    })
    // Desperation once all 3 skills are spent.
    if (!this.state.winner && this.state.skillsUsed.A >= 3) {
      const btn = this.track(this.add.rectangle(baseX + 70, y, 140, 34, 0x6a2a2a).setStrokeStyle(1, 0xaa5555))
      this.track(this.add.text(baseX + 8, y - 9, '💥 결단', { fontSize: '13px', color: '#fdd' }))
      btn.setInteractive()
      btn.on('pointerdown', () => this.onDesperationTap())
    }
    if (this.targetingSkill) {
      this.track(this.add.text(baseX, y + 20, '레인을 탭하세요', { fontSize: '14px', color: '#ff8' }))
    }
  }

  private onSkillTap(i: number) {
    if (this.state.winner) return
    if (i === 0) {
      // Skill 0 needs a target lane — enter targeting mode.
      this.targetingSkill = true
      this.redraw()
      return
    }
    usePlayerSkill(this.state)
    this.redraw()
  }

  private onDesperationTap() {
    if (this.state.winner) return
    usePlayerDesperation(this.state)
    this.redraw()
  }
```

`onCellTap`을 타게팅 분기 포함으로 교체:

```ts
  private onCellTap(lane: number, col: number) {
    if (this.state.winner) return
    if (this.targetingSkill) {
      usePlayerSkill(this.state, lane)
      this.targetingSkill = false
      this.redraw()
      return
    }
    if (this.selectedHand === null) return
    const before = this.state.units.length
    playerDeploy(this.state, this.selectedHand, lane, col)
    if (this.state.units.length === before) return
    this.selectedHand = null
    this.redraw()
  }
```

(주의: 타게팅 모드에서 스킬1은 적 레인을 노리므로, 플레이어 셀뿐 아니라 **적(B) 셀도 탭 가능**해야 함. `drawCells`에서 현재 A 셀에만 `setInteractive`가 걸려 있다면, 타게팅을 위해 B 셀도 인터랙티브로 만들되 `onCellTap`으로 라우팅한다. `drawCells`의 `if (team === 'A')` 조건을 제거하고 항상 `setInteractive()` + `pointerdown → onCellTap(lane, col)`을 걸어라. 배치는 `onCellTap` 내부에서 A 셀 점유 검사/`playerDeploy`가 처리하므로 B 셀 탭은 배치엔 무효(占유 아님이나 `playerDeploy`가 A팀 기준으로 배치 → B셀 좌표라도 A팀 유닛이 그 lane/col에 놓임). 이를 막기 위해, 비타게팅 상태에서는 B 셀 탭을 무시해야 한다. `drawCells`에서 팀을 클로저로 넘겨 `onCellTap(lane, col, team)`으로 받고, 비타게팅+`team==='B'`면 배치 무시.)

명확화를 위해 `drawCells`와 `onCellTap`을 아래로 확정한다:

```ts
  private drawCells() {
    ;(['A', 'B'] as TeamId[]).forEach((team) => {
      for (let lane = 0; lane < LANES; lane++) {
        for (let col = 0; col < COLS; col++) {
          const { x, y } = cellXY(team, lane, col)
          const rect = this.track(this.add.rectangle(x, y, 88, 88, 0x14304a).setStrokeStyle(2, 0x2c5578))
          rect.setInteractive()
          rect.on('pointerdown', () => this.onCellTap(lane, col, team))
        }
      }
    })
  }

  private onCellTap(lane: number, col: number, team: TeamId) {
    if (this.state.winner) return
    if (this.targetingSkill) {
      // Skill 0 targets an enemy lane; any cell tap selects that lane.
      usePlayerSkill(this.state, lane)
      this.targetingSkill = false
      this.redraw()
      return
    }
    if (team !== 'A') return // deployment is only onto the player's own cells
    if (this.selectedHand === null) return
    const before = this.state.units.length
    playerDeploy(this.state, this.selectedHand, lane, col)
    if (this.state.units.length === before) return
    this.selectedHand = null
    this.redraw()
  }
```

- [ ] **Step 2: 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS — 엔진 테스트 전부 통과(씬 변경은 엔진 무영향).

Run: `npm run build`
Expected: 빌드 성공, 타입 에러 없음. (`npm run dev` 금지; 육안은 배포 후 사람.)

- [ ] **Step 3: 커밋**

```bash
git add src/render/BattleScene.ts
git commit -m "feat: commander skill buttons, lane targeting, and desperation UI"
```

---

## Self-Review 결과
- **스펙 커버리지:** 스킬 상태·효과(§2.2)+공격보너스 → Task1; 결단(§2.3)+AI 스킬(§2.4) → Task2; UI 버튼·타게팅(§3.1) → Task3. 제외 항목 미포함.
- **플레이스홀더 스캔:** 실제 코드/명령/기대결과 포함. 없음.
- **타입 일관성:** `usePlayerSkill(state,targetLane?)`/`usePlayerDesperation(state)`/`nextSkillIndex(state,team)`/`SKILL_NAMES`가 battle.ts 정의와 씬 사용 일치. `atkBonus/skillsUsed/desperations`가 createBattle 초기화 ↔ 함수 사용 일치. 새 BattleEvent(skill/desperation)는 union에 추가. `onCellTap(lane,col,team)` 시그니처가 drawCells 호출과 일치. 기존 테스트는 atkBonus=0이라 무변경 통과.
