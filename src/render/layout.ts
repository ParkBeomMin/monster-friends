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
