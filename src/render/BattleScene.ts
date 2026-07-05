import Phaser from 'phaser'
import type { BattleEvent, BattleResult, UnitDef } from '../engine/types'
import { simulateBattle } from '../engine/combat'
import { DEMO_TEAM_A, DEMO_TEAM_B } from '../data/units'

const TICK_MS = 400 // playback speed: one battle tick every 400ms

interface UnitView {
  def: UnitDef
  maxHp: number
  hp: number
  box: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  hpText: Phaser.GameObjects.Text
}

export class BattleScene extends Phaser.Scene {
  private views = new Map<string, UnitView>()
  private result!: BattleResult

  constructor() {
    super('Battle')
  }

  create() {
    this.result = simulateBattle(DEMO_TEAM_A, DEMO_TEAM_B)
    this.drawTeam(DEMO_TEAM_A, 'A', 200, 0x00aa66)
    this.drawTeam(DEMO_TEAM_B, 'B', 600, 0xaa4444)
    this.playEvents()
  }

  private drawTeam(team: UnitDef[], teamId: 'A' | 'B', x: number, color: number) {
    team.forEach((def, slot) => {
      const y = 150 + slot * 120
      const box = this.add.rectangle(x, y, 90, 70, color)
      const label = this.add.text(x - 40, y - 55, def.name, { fontSize: '14px', color: '#fff' })
      const hpText = this.add.text(x - 40, y + 40, `${def.maxHp}/${def.maxHp}`, {
        fontSize: '12px',
        color: '#ffd',
      })
      this.views.set(`${teamId}#${slot}`, { def, maxHp: def.maxHp, hp: def.maxHp, box, label, hpText })
    })
  }

  private playEvents() {
    let i = 0
    this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => {
        if (i >= this.result.events.length) return
        // Apply all events belonging to the current tick step, one per timer fire.
        const ev = this.result.events[i++]
        this.applyEvent(ev)
      },
    })
  }

  private applyEvent(ev: BattleEvent) {
    if (ev.type === 'attack') {
      const view = this.views.get(ev.target)
      if (view) {
        view.hp = ev.targetHpAfter
        view.hpText.setText(`${view.hp}/${view.maxHp}`)
        this.tweens.add({ targets: view.box, alpha: 0.4, yoyo: true, duration: 100 })
      }
    } else if (ev.type === 'death') {
      const view = this.views.get(ev.unit)
      if (view) {
        view.box.setFillStyle(0x333333)
        view.label.setColor('#777')
      }
    } else if (ev.type === 'end') {
      const text = ev.winner === 'draw' ? '무승부' : `승자: ${ev.winner}팀`
      this.add.text(300, 20, text, { fontSize: '28px', color: '#ffff88' })
    }
  }
}
