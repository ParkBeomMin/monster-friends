import Phaser from 'phaser'
import { PlacementScene } from './render/PlacementScene'
import { BattleScene } from './render/BattleScene'
import { LOGICAL_W, LOGICAL_H } from './render/layout'

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1d1d1d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: LOGICAL_W,
    height: LOGICAL_H,
  },
  scene: [PlacementScene, BattleScene],
})
