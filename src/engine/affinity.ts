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
