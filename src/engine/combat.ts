import type { UnitDef, UnitState, TeamId, BattleEvent, BattleResult, Position, Placement } from './types'

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
