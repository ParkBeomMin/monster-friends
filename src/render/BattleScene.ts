import Phaser from 'phaser'
import type { BattleState, BattleUnit } from '../engine/battle'
import { createBattle, playerDeploy, DEFAULT_CONFIG } from '../engine/battle'
import type { TeamId } from '../engine/types'
import { PLAYER_DECK, ENEMY_DECK } from '../data/decks'
import { cellXY, heroXY, LANES, COLS, LOGICAL_W, LOGICAL_H } from './layout'

const SEED = 20260706

export class BattleScene extends Phaser.Scene {
  private state!: BattleState
  private selectedHand: number | null = null
  private dynamic: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('Battle')
  }

  create() {
    this.state = createBattle(PLAYER_DECK, ENEMY_DECK, SEED, DEFAULT_CONFIG)
    this.selectedHand = null
    this.redraw()
  }

  // Destroy previous frame's objects and rebuild everything from state.
  private redraw() {
    this.dynamic.forEach((o) => o.destroy())
    this.dynamic = []

    this.drawHeroes()
    this.drawCells()
    this.drawUnits()
    this.drawHand()
    if (this.state.winner) this.drawResult()
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.dynamic.push(o)
    return o
  }

  private drawHeroes() {
    ;(['A', 'B'] as TeamId[]).forEach((team) => {
      const { x, y } = heroXY(team)
      const color = team === 'A' ? 0x3366cc : 0xcc3344
      this.track(this.add.rectangle(x, y, 84, 120, color))
      this.track(
        this.add.text(x - 40, y - 96, `HP ${this.state.heroHp[team]}`, {
          fontSize: '18px',
          color: '#fff',
        }),
      )
    })
  }

  private drawCells() {
    ;(['A', 'B'] as TeamId[]).forEach((team) => {
      for (let lane = 0; lane < LANES; lane++) {
        for (let col = 0; col < COLS; col++) {
          const { x, y } = cellXY(team, lane, col)
          const rect = this.track(this.add.rectangle(x, y, 88, 88, 0x14304a).setStrokeStyle(2, 0x2c5578))
          if (team === 'A') {
            rect.setInteractive()
            rect.on('pointerdown', () => this.onCellTap(lane, col))
          }
        }
      }
    })
  }

  private drawUnits() {
    this.state.units.forEach((unitState: BattleUnit) => {
      if (!unitState.alive) return
      const { x, y } = cellXY(unitState.team, unitState.lane, unitState.col)
      const color = unitState.team === 'A' ? 0x00aa66 : 0xaa4444
      this.track(this.add.rectangle(x, y, 80, 80, color))
      this.track(this.add.text(x - 38, y - 34, unitState.def.name, { fontSize: '12px', color: '#fff' }))
      this.track(
        this.add.text(x - 38, y + 20, `${unitState.hp}/${unitState.def.maxHp}`, {
          fontSize: '12px',
          color: '#ffd',
        }),
      )
    })
  }

  private drawHand() {
    const turnLabel = this.state.winner ? '' : `턴 ${this.state.turn} — 카드를 고르고 내 칸을 탭`
    this.track(this.add.text(20, LOGICAL_H - 118, turnLabel, { fontSize: '16px', color: '#fff' }))
    this.state.hands.A.forEach((def, i) => {
      const x = 24 + i * 150
      const y = LOGICAL_H - 88
      const selected = this.selectedHand === i
      const card = this.track(
        this.add.rectangle(x + 66, y + 32, 132, 64, selected ? 0x4a6a4a : 0x2a3a2a).setStrokeStyle(2, selected ? 0xaaffaa : 0x557755),
      )
      card.setInteractive()
      card.on('pointerdown', () => this.onHandTap(i))
      this.track(
        this.add.text(x + 10, y + 8, `${def.name}\nHP ${def.maxHp} / ATK ${def.attack}`, {
          fontSize: '12px',
          color: '#cfc',
        }),
      )
    })
  }

  private drawResult() {
    const msg = this.state.winner === 'A' ? '승리!' : this.state.winner === 'B' ? '패배...' : '무승부'
    this.track(
      this.add.text(LOGICAL_W / 2 - 70, 24, msg, { fontSize: '36px', color: '#ffff88' }),
    )
  }

  private onHandTap(i: number) {
    if (this.state.winner) return
    this.selectedHand = this.selectedHand === i ? null : i
    this.redraw()
  }

  private onCellTap(lane: number, col: number) {
    if (this.state.winner || this.selectedHand === null) return
    const before = this.state.units.length
    playerDeploy(this.state, this.selectedHand, lane, col)
    if (this.state.units.length === before) return // rejected (occupied/invalid); keep selection
    this.selectedHand = null
    this.redraw()
  }
}
