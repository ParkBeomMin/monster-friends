import Phaser from 'phaser'

// Temporary boot scene to prove the pipeline renders. Replaced in Task 4.
class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }
  create() {
    this.add.rectangle(400, 300, 120, 120, 0x00aa66)
    this.add.text(320, 180, '몬스터 프렌즈', { fontSize: '24px', color: '#ffffff' })
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game',
  backgroundColor: '#1d1d1d',
  scene: [BootScene],
})
