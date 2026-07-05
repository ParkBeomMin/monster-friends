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
