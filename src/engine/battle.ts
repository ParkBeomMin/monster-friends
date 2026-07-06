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
  | { type: 'skill'; team: TeamId; skillIndex: number; targetLane?: number }
  | { type: 'desperation'; team: TeamId; heroDamage: number; selfCost: number }

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
  atkBonus: { A: number; B: number }
  skillsUsed: { A: number; B: number }
  desperations: { A: number; B: number }
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
    atkBonus: { A: 0, B: 0 },
    skillsUsed: { A: 0, B: 0 },
    desperations: { A: 0, B: 0 },
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
}

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

function hasLegalMove(state: BattleState, team: TeamId): boolean {
  return state.hands[team].length > 0 && emptyCells(state, team).length > 0
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
  if (lane < 0 || lane >= state.config.lanes || col < 0 || col >= state.config.cols) return events
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
  if (state.turn > state.config.maxTurns) {
    finishByHero(state, events)
  } else if (!state.winner && !hasLegalMove(state, 'A')) {
    finishByHero(state, events)
  }
  return events
}

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
