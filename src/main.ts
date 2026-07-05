import Phaser from 'phaser'
import { BattleScene } from './render/BattleScene'

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  backgroundColor: '#1d1d1d',
  scene: [BattleScene],
})
