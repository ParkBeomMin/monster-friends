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
