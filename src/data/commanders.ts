import type { CommanderDef } from '../engine/battle'

export const AGNI: CommanderDef = {
  id: 'agni',
  name: '아그니',
  skills: [
    { name: '집중포화', unlockTurn: 2, effect: { kind: 'laneDamage', amount: 20 }, needsTarget: true },
    { name: '진군나팔', unlockTurn: 4, effect: { kind: 'teamAtkBonus', amount: 6 }, needsTarget: false },
    { name: '최후의일격', unlockTurn: 6, effect: { kind: 'heroDamage', amount: 45 }, needsTarget: false },
  ],
}

export const GAIA: CommanderDef = {
  id: 'gaia',
  name: '가이아',
  skills: [
    { name: '재생', unlockTurn: 2, effect: { kind: 'healHero', amount: 40 }, needsTarget: false },
    { name: '전열강화', unlockTurn: 5, effect: { kind: 'teamAtkBonus', amount: 8 }, needsTarget: false },
    { name: '대지분쇄', unlockTurn: 7, effect: { kind: 'laneDamage', amount: 26 }, needsTarget: true },
  ],
}

export const PRIMA: CommanderDef = {
  id: 'prima',
  name: '프리마',
  skills: [
    { name: '서리파편', unlockTurn: 2, effect: { kind: 'laneDamage', amount: 15 }, needsTarget: true },
    { name: '서리폭풍', unlockTurn: 4, effect: { kind: 'laneDamage', amount: 15 }, needsTarget: true },
    { name: '절대영도', unlockTurn: 7, effect: { kind: 'heroDamage', amount: 55 }, needsTarget: false },
  ],
}

export const COMMANDERS: CommanderDef[] = [AGNI, GAIA, PRIMA]
