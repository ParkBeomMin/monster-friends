import Phaser from 'phaser'
import type { BattleState, BattleUnit } from '../engine/battle'
import { createBattle, playerDeploy, usePlayerSkill, usePlayerDesperation, nextSkillIndex, SKILL_NAMES, DEFAULT_CONFIG } from '../engine/battle'
import type { TeamId } from '../engine/types'
import { PLAYER_DECK, ENEMY_DECK } from '../data/decks'
import { cellXY, heroXY, LANES, COLS, LOGICAL_W, LOGICAL_H } from './layout'

const SEED = 20260706

export class BattleScene extends Phaser.Scene {
  private state!: BattleState
  private selectedHand: number | null = null
  private targetingSkill = false
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
    this.drawSkills()
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
          rect.setInteractive()
          rect.on('pointerdown', () => this.onCellTap(lane, col, team))
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

  private drawSkills() {
    const baseX = 8
    let y = 360
    SKILL_NAMES.forEach((name, i) => {
      const used = i < this.state.skillsUsed.A
      const available = !this.state.winner && nextSkillIndex(this.state, 'A') === i
      const label = used ? `✔ ${name}` : available ? `▶ ${name}` : `🔒 ${name}`
      const color = used ? 0x333333 : available ? 0x4a6a2a : 0x2a2a2a
      const btn = this.track(this.add.rectangle(baseX + 70, y, 140, 34, color).setStrokeStyle(1, 0x557755))
      this.track(this.add.text(baseX + 8, y - 9, label, { fontSize: '13px', color: '#dfd' }))
      if (available) {
        btn.setInteractive()
        btn.on('pointerdown', () => this.onSkillTap(i))
      }
      y += 42
    })
    // Desperation once all 3 skills are spent.
    if (!this.state.winner && this.state.skillsUsed.A >= 3) {
      const btn = this.track(this.add.rectangle(baseX + 70, y, 140, 34, 0x6a2a2a).setStrokeStyle(1, 0xaa5555))
      this.track(this.add.text(baseX + 8, y - 9, '💥 결단', { fontSize: '13px', color: '#fdd' }))
      btn.setInteractive()
      btn.on('pointerdown', () => this.onDesperationTap())
    }
    if (this.targetingSkill) {
      this.track(this.add.text(baseX, y + 20, '레인을 탭하세요', { fontSize: '14px', color: '#ff8' }))
    }
  }

  private onSkillTap(i: number) {
    if (this.state.winner) return
    if (i === 0) {
      // Skill 0 needs a target lane — enter targeting mode.
      this.targetingSkill = true
      this.redraw()
      return
    }
    usePlayerSkill(this.state)
    this.redraw()
  }

  private onDesperationTap() {
    if (this.state.winner) return
    usePlayerDesperation(this.state)
    this.redraw()
  }

  private onHandTap(i: number) {
    if (this.state.winner) return
    this.selectedHand = this.selectedHand === i ? null : i
    this.redraw()
  }

  private onCellTap(lane: number, col: number, team: TeamId) {
    if (this.state.winner) return
    if (this.targetingSkill) {
      // Skill 0 targets an enemy lane; any cell tap selects that lane.
      usePlayerSkill(this.state, lane)
      this.targetingSkill = false
      this.redraw()
      return
    }
    if (team !== 'A') return // deployment is only onto the player's own cells
    if (this.selectedHand === null) return
    const before = this.state.units.length
    playerDeploy(this.state, this.selectedHand, lane, col)
    if (this.state.units.length === before) return // rejected (occupied/invalid); keep selection
    this.selectedHand = null
    this.redraw()
  }
}
