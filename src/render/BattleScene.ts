import Phaser from 'phaser'
import type { BattleEvent, BattleResult, Placement, TeamId, UnitDef } from '../engine/types'
import { simulateBattle } from '../engine/combat'
import { ENEMY_PLACEMENTS, PLAYER_POOL } from '../data/units'
import { slotXY, LOGICAL_W } from './layout'

const TICK_MS = 350

interface UnitView {
  maxHp: number
  hp: number
  box: Phaser.GameObjects.Rectangle
  hpText: Phaser.GameObjects.Text
  label: Phaser.GameObjects.Text
}

// Default player squad if the scene is started without placement data.
const DEMO_PLAYER: Placement[] = [
  { def: PLAYER_POOL[0], pos: { row: 'front', col: 1 } },
  { def: PLAYER_POOL[1], pos: { row: 'front', col: 0 } },
  { def: PLAYER_POOL[2], pos: { row: 'back', col: 1 } },
]

export class BattleScene extends Phaser.Scene {
  private views = new Map<string, UnitView>()
  private player: Placement[] = DEMO_PLAYER

  constructor() {
    super('Battle')
  }

  init(data: { placements?: Placement[] }) {
    this.player = data.placements && data.placements.length > 0 ? data.placements : DEMO_PLAYER
    this.views = new Map()
  }

  create() {
    const result: BattleResult = simulateBattle(this.player, ENEMY_PLACEMENTS)
    this.drawTeam(this.player, 'A', 0x00aa66)
    this.drawTeam(ENEMY_PLACEMENTS, 'B', 0xaa4444)
    this.playEvents(result)
  }

  private drawTeam(placements: Placement[], team: TeamId, color: number) {
    placements.forEach((p, i) => {
      const def: UnitDef = p.def
      const { x, y } = slotXY(team, p.pos.row, p.pos.col)
      const box = this.add.rectangle(x, y, 84, 64, color)
      const label = this.add.text(x - 40, y - 52, def.name, { fontSize: '15px', color: '#fff' })
      const hpText = this.add.text(x - 40, y + 38, `${def.maxHp}/${def.maxHp}`, { fontSize: '13px', color: '#ffd' })
      this.views.set(`${team}#${i}`, { maxHp: def.maxHp, hp: def.maxHp, box, hpText, label })
    })
  }

  private playEvents(result: BattleResult) {
    let i = 0
    const timer = this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => {
        if (i >= result.events.length) {
          timer.remove()
          return
        }
        this.applyEvent(result.events[i++])
      },
    })
  }

  private applyEvent(ev: BattleEvent) {
    if (ev.type === 'attack') {
      const view = this.views.get(ev.target)
      if (view) {
        view.hp = ev.targetHpAfter
        view.hpText.setText(`${view.hp}/${view.maxHp}`)
        this.tweens.add({ targets: view.box, alpha: 0.4, yoyo: true, duration: 90 })
      }
    } else if (ev.type === 'death') {
      const view = this.views.get(ev.unit)
      if (view) {
        view.box.setFillStyle(0x333333)
        view.label.setColor('#777')
      }
    } else if (ev.type === 'end') {
      const text = ev.winner === 'draw' ? '무승부' : ev.winner === 'A' ? '승리!' : '패배...'
      this.add.text(LOGICAL_W / 2 - 60, 24, text, { fontSize: '32px', color: '#ffff88' })
    }
  }
}
