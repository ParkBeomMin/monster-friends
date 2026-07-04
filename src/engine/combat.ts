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
