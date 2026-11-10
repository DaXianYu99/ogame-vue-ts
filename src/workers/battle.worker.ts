/**
 * 战斗模拟 Worker
 * 在独立线程中处理计算密集型的战斗模拟任务
 */
import type { Fleet, Resources } from '@/types/game'
import { ShipType, DefenseType } from '@/types/game'
import { SHIPS, DEFENSES } from '@/config/gameConfig'
import type { WorkerRequestMessage, WorkerResponseMessage, BattleSideData, BattleSimulationResult } from '@/types/worker'
import { WorkerMessageType } from '@/types/worker'

// 战斗单位接口
interface CombatUnit {
  type: ShipType | DefenseType
  count: number
  attack: number
  shield: number
  armor: number
  rapidFire?: Record<string, number>
}

/**
 * 计算科技加成后的数值
 */
const applyTechBonus = (baseValue: number, techLevel: number = 0, bonusPerLevel: number = 0.1): number => {
  return Math.floor(baseValue * (1 + techLevel * bonusPerLevel))
}

/** 军官战斗加成：攻击加成放大 attack，防御加成放大 shield / armor。
 *  BattleSimulatorView 不传该字段 => 默认 0，沙盘模拟行为保持原版。 */
const applyCombatBonus = (value: number, bonusPercent: number = 0): number => {
  return Math.floor(value * (1 + bonusPercent / 100))
}

/**
 * 将舰队和防御转换为战斗单位数组
 */
const prepareCombatUnits = (side: BattleSideData, isDefender: boolean = false): CombatUnit[] => {
  const units: CombatUnit[] = []

  // 处理舰船
  if (side.ships) {
    for (const [shipType, count] of Object.entries(side.ships)) {
      if (count > 0) {
        const config = SHIPS[shipType as ShipType]
        units.push({
          type: shipType as ShipType,
          count: count,
          attack: applyCombatBonus(applyTechBonus(config.attack, side.weaponTech), side.attackBonus),
          shield: applyCombatBonus(applyTechBonus(config.shield, side.shieldTech), side.defenseBonus),
          armor: applyCombatBonus(applyTechBonus(config.armor, side.armorTech), side.defenseBonus)
        })
      }
    }
  }

  // 处理防御设施（仅防守方）
  if (isDefender && side.defense) {
    for (const [defenseType, count] of Object.entries(side.defense)) {
      if (count > 0) {
        const config = DEFENSES[defenseType as DefenseType]
        units.push({
          type: defenseType as DefenseType,
          count: count,
          attack: applyCombatBonus(applyTechBonus(config.attack, side.weaponTech), side.attackBonus),
          shield: applyCombatBonus(applyTechBonus(config.shield, side.shieldTech), side.defenseBonus),
          armor: applyCombatBonus(applyTechBonus(config.armor, side.armorTech), side.defenseBonus)
        })
      }
    }
  }

  return units
}

/**
 * 计算一个单位对另一个单位造成的伤害
 */
const calculateDamage = (attacker: CombatUnit, defender: CombatUnit): { destroyed: number; damagedShield: number } => {
  const attackPower = attacker.attack
  const defenderShield = defender.shield
  const defenderArmor = defender.armor

  let destroyed = 0
  let damagedShield = 0

  // 如果攻击力小于护盾的1%，有很大概率无法击穿护盾
  if (attackPower < defenderShield * 0.01) {
    if (Math.random() > 0.01) {
      return { destroyed: 0, damagedShield: 0 }
    }
  }

  // 计算伤害
  let remainingDamage = attackPower

  // 先消耗护盾
  if (remainingDamage > defenderShield) {
    remainingDamage -= defenderShield
    damagedShield = defenderShield
  } else {
    damagedShield = remainingDamage
    return { destroyed: 0, damagedShield }
  }

  // 再消耗装甲
  if (remainingDamage > defenderArmor) {
    destroyed = 1
  } else {
    // 有概率摧毁
    const destroyChance = remainingDamage / defenderArmor
    if (Math.random() < destroyChance) {
      destroyed = 1
    }
  }

  return { destroyed, damagedShield }
}

/**
 * 执行一轮战斗
 */
const executeRound = (
  attackerUnits: CombatUnit[],
  defenderUnits: CombatUnit[]
): {
  attackerLosses: Partial<Fleet>
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  attackerRemainingPower: number
  defenderRemainingPower: number
} => {
  const attackerLosses: Partial<Fleet> = {}
  const defenderShipLosses: Partial<Fleet> = {}
  const defenderDefenseLosses: Partial<Record<DefenseType, number>> = {}

  // 攻击方向防守方射击
  for (const attacker of attackerUnits) {
    for (let i = 0; i < attacker.count; i++) {
      if (defenderUnits.length === 0) break

      const targetIndex = Math.floor(Math.random() * defenderUnits.length)
      const target = defenderUnits[targetIndex]

      if (!target) continue

      const { destroyed } = calculateDamage(attacker, target)

      if (destroyed > 0) {
        target.count -= destroyed

        // 记录损失
        if (Object.values(ShipType).includes(target.type as ShipType)) {
          const shipType = target.type as ShipType
          defenderShipLosses[shipType] = (defenderShipLosses[shipType] || 0) + destroyed
        } else {
          const defenseType = target.type as DefenseType
          defenderDefenseLosses[defenseType] = (defenderDefenseLosses[defenseType] || 0) + destroyed
        }

        if (target.count <= 0) {
          defenderUnits.splice(targetIndex, 1)
        }
      }
    }
  }

  // 防守方向攻击方射击
  for (const defender of defenderUnits) {
    for (let i = 0; i < defender.count; i++) {
      if (attackerUnits.length === 0) break

      const targetIndex = Math.floor(Math.random() * attackerUnits.length)
      const target = attackerUnits[targetIndex]

      if (!target) continue

      const { destroyed } = calculateDamage(defender, target)

      if (destroyed > 0) {
        target.count -= destroyed

        const shipType = target.type as ShipType
        attackerLosses[shipType] = (attackerLosses[shipType] || 0) + destroyed

        if (target.count <= 0) {
          attackerUnits.splice(targetIndex, 1)
        }
      }
    }
  }

  // 计算剩余战斗力
  const attackerPower = attackerUnits.reduce((sum, unit) => sum + unit.count * unit.attack, 0)
  const defenderPower = defenderUnits.reduce((sum, unit) => sum + unit.count * unit.attack, 0)

  return {
    attackerLosses,
    defenderLosses: {
      fleet: defenderShipLosses,
      defense: defenderDefenseLosses
    },
    attackerRemainingPower: attackerPower,
    defenderRemainingPower: defenderPower
  }
}

/**
 * 模拟完整战斗
 */
const simulateBattle = (attacker: BattleSideData, defender: BattleSideData, maxRounds: number = 6): BattleSimulationResult => {
  // 准备战斗单位
  let attackerUnits = prepareCombatUnits(attacker, false)
  let defenderUnits = prepareCombatUnits(defender, true)

  const totalAttackerLosses: Partial<Fleet> = {}
  const totalDefenderShipLosses: Partial<Fleet> = {}
  const totalDefenderDefenseLosses: Partial<Record<DefenseType, number>> = {}
  const roundDetails: Array<{
    round: number
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
    attackerRemainingPower: number
    defenderRemainingPower: number
  }> = []

  let rounds = 0

  // 执行最多maxRounds轮战斗
  for (let round = 0; round < maxRounds; round++) {
    if (attackerUnits.length === 0 || defenderUnits.length === 0) {
      break
    }

    rounds++

    const roundResult = executeRound(attackerUnits, defenderUnits)

    // 保存当前回合详情
    roundDetails.push({
      round: rounds,
      attackerLosses: { ...roundResult.attackerLosses },
      defenderLosses: {
        fleet: { ...roundResult.defenderLosses.fleet },
        defense: { ...roundResult.defenderLosses.defense }
      },
      attackerRemainingPower: roundResult.attackerRemainingPower,
      defenderRemainingPower: roundResult.defenderRemainingPower
    })

    // 累计损失
    for (const [shipType, count] of Object.entries(roundResult.attackerLosses)) {
      totalAttackerLosses[shipType as ShipType] = (totalAttackerLosses[shipType as ShipType] || 0) + count
    }

    for (const [shipType, count] of Object.entries(roundResult.defenderLosses.fleet)) {
      totalDefenderShipLosses[shipType as ShipType] = (totalDefenderShipLosses[shipType as ShipType] || 0) + count
    }

    for (const [defenseType, count] of Object.entries(roundResult.defenderLosses.defense)) {
      totalDefenderDefenseLosses[defenseType as DefenseType] = (totalDefenderDefenseLosses[defenseType as DefenseType] || 0) + count
    }
  }

  // 防御设施有概率修复（70%概率）
  const repairedDefense: Partial<Record<DefenseType, number>> = {}
  for (const [defenseType, count] of Object.entries(totalDefenderDefenseLosses)) {
    const repaired = Math.floor(count * 0.7)
    if (repaired > 0) {
      repairedDefense[defenseType as DefenseType] = repaired
      totalDefenderDefenseLosses[defenseType as DefenseType] = count - repaired
    }
  }

  // 计算剩余单位
  const attackerRemaining: Partial<Fleet> = {}
  for (const unit of attackerUnits) {
    if (unit.count > 0) {
      attackerRemaining[unit.type as ShipType] = unit.count
    }
  }

  const defenderShipRemaining: Partial<Fleet> = {}
  const defenderDefenseRemaining: Partial<Record<DefenseType, number>> = {}
  for (const unit of defenderUnits) {
    if (unit.count > 0) {
      if (Object.values(ShipType).includes(unit.type as ShipType)) {
        defenderShipRemaining[unit.type as ShipType] = unit.count
      } else {
        defenderDefenseRemaining[unit.type as DefenseType] = unit.count
      }
    }
  }

  // 添加修复的防御设施
  for (const [defenseType, count] of Object.entries(repairedDefense)) {
    defenderDefenseRemaining[defenseType as DefenseType] = (defenderDefenseRemaining[defenseType as DefenseType] || 0) + count
  }

  // 判断胜负
  let winner: 'attacker' | 'defender' | 'draw'
  if (attackerUnits.length === 0 && defenderUnits.length === 0) {
    winner = 'draw'
  } else if (attackerUnits.length === 0) {
    winner = 'defender'
  } else if (defenderUnits.length === 0) {
    winner = 'attacker'
  } else {
    // 达到最大回合数后双方都有剩余单位
    // 如果是战斗到底模式(maxRounds > 6)，根据剩余战力判定胜负
    if (maxRounds > 6) {
      // 计算剩余战力
      const attackerPower = attackerUnits.reduce((sum, u) => sum + u.count * u.armor, 0)
      const defenderPower = defenderUnits.reduce((sum, u) => sum + u.count * u.armor, 0)
      // 战力差距超过20%判定胜负，否则平局
      if (attackerPower > defenderPower * 1.2) {
        winner = 'attacker'
      } else if (defenderPower > attackerPower * 1.2) {
        winner = 'defender'
      } else {
        winner = 'draw'
      }
    } else {
      // OGame原版规则：6回合后双方都有剩余单位时判定为平局
      winner = 'draw'
    }
  }

  return {
    winner,
    rounds,
    attackerLosses: totalAttackerLosses,
    defenderLosses: {
      fleet: totalDefenderShipLosses,
      defense: totalDefenderDefenseLosses
    },
    attackerRemaining,
    defenderRemaining: {
      fleet: defenderShipRemaining,
      defense: defenderDefenseRemaining
    },
    roundDetails
  }
}

/**
 * 计算掠夺的资源
 */
const calculatePlunder = (defenderResources: Resources, attackerFleet: Partial<Fleet>): Resources => {
  let totalCapacity = 0
  for (const [shipType, count] of Object.entries(attackerFleet)) {
    const config = SHIPS[shipType as ShipType]
    totalCapacity += config.cargoCapacity * count
  }

  const availableResources = {
    metal: Math.floor(defenderResources.metal * 0.5),
    crystal: Math.floor(defenderResources.crystal * 0.5),
    deuterium: Math.floor(defenderResources.deuterium * 0.5),
    darkMatter: Math.floor(defenderResources.darkMatter * 0.5),
    energy: 0
  }

  const totalAvailable =
    availableResources.metal + availableResources.crystal + availableResources.deuterium + availableResources.darkMatter

  if (totalCapacity >= totalAvailable) {
    return availableResources
  }

  const ratio = totalCapacity / totalAvailable
  return {
    metal: Math.floor(availableResources.metal * ratio),
    crystal: Math.floor(availableResources.crystal * ratio),
    deuterium: Math.floor(availableResources.deuterium * ratio),
    darkMatter: Math.floor(availableResources.darkMatter * ratio),
    energy: 0
  }
}

/**
 * 计算残骸场
 */
const calculateDebrisField = (
  attackerLosses: Partial<Fleet>,
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
): Resources => {
  let totalMetal = 0
  let totalCrystal = 0

  for (const [shipType, count] of Object.entries(attackerLosses)) {
    const config = SHIPS[shipType as ShipType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  for (const [shipType, count] of Object.entries(defenderLosses.fleet)) {
    const config = SHIPS[shipType as ShipType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  for (const [defenseType, count] of Object.entries(defenderLosses.defense)) {
    const config = DEFENSES[defenseType as DefenseType]
    totalMetal += config.cost.metal * count * 0.3
    totalCrystal += config.cost.crystal * count * 0.3
  }

  return {
    metal: Math.floor(totalMetal),
    crystal: Math.floor(totalCrystal),
    deuterium: 0,
    darkMatter: 0,
    energy: 0
  }
}

// ============================================================================
// Worker 消息处理
// ============================================================================

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const { id, type, payload } = event.data

  try {
    let result: unknown

    switch (type) {
      case WorkerMessageType.SIMULATE_BATTLE: {
        const {
          attacker,
          defender,
          maxRounds = 6
        } = payload as {
          attacker: BattleSideData
          defender: BattleSideData
          maxRounds?: number
        }
        result = simulateBattle(attacker, defender, maxRounds)
        break
      }

      case WorkerMessageType.CALCULATE_PLUNDER: {
        const { defenderResources, attackerFleet } = payload as {
          defenderResources: Resources
          attackerFleet: Partial<Fleet>
        }
        result = calculatePlunder(defenderResources, attackerFleet)
        break
      }

      case WorkerMessageType.CALCULATE_DEBRIS: {
        const { attackerLosses, defenderLosses } = payload as {
          attackerLosses: Partial<Fleet>
          defenderLosses: {
            fleet: Partial<Fleet>
            defense: Partial<Record<DefenseType, number>>
          }
        }
        result = calculateDebrisField(attackerLosses, defenderLosses)
        break
      }

      default:
        throw new Error(`Unknown message type: ${type}`)
    }

    // 发送成功响应
    const response: WorkerResponseMessage = {
      id,
      type: WorkerMessageType.SUCCESS,
      success: true,
      data: result
    }
    self.postMessage(response)
  } catch (error) {
    // 发送错误响应
    const response: WorkerResponseMessage = {
      id,
      type: WorkerMessageType.ERROR,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
    self.postMessage(response)
  }
}
