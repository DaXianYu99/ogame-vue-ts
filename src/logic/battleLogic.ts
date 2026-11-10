import type { Fleet, Resources, BattleResult, Officer, TechnologyType } from '@/types/game'
import { DefenseType, OfficerType } from '@/types/game'
import { workerManager } from '@/workers/workerManager'
import { MOON_CONFIG, OFFICERS } from '@/config/gameConfig'
import { generateId } from '@/utils/id'

/**
 * 执行战斗模拟
 * 使用 Web Worker 在后台线程中执行计算密集型的战斗模拟
 */
/**
 * 读取特殊军官的战斗加成。
 * 只查帝王槽位：NPC 侧在 fleetLogic 中传入 {}，恒返回 0，加成只在玩家侧生效。
 * 原版 6 个军官的 defenseBonus 仍保持上游「账面存在、逻辑未消费」的行为，
 * 以免改动原版平衡；若想让所有军官生效，改为 officerLogic.calculateActiveBonuses 全量读取即可。
 */
const getOfficerCombatBonuses = (officers: Record<OfficerType, Officer> | undefined) => {
  const now = Date.now()
  const special = officers?.[OfficerType.Sovereign]
  if (!special || !special.active || (special.expiresAt && special.expiresAt <= now)) {
    return { attack: 0, defense: 0 }
  }
  const benefits = OFFICERS[OfficerType.Sovereign]?.benefits
  return {
    attack: benefits?.fleetAttackBonus || 0,
    // 防御 +50% 与舰队防御 +30% 合并后走 Worker 现有的 defenseBonus 通道
    defense: (benefits?.defenseBonus || 0) + (benefits?.fleetDefenseBonus || 0)
  }
}

export const simulateBattle = async (
  attackerFleet: Partial<Fleet>,
  defenderFleet: Partial<Fleet>,
  defenderDefense: Partial<Record<DefenseType, number>>,
  defenderResources: Resources,
  attackerOfficers: Record<OfficerType, Officer>,
  defenderOfficers: Record<OfficerType, Officer>,
  attackerTechnologies: Record<TechnologyType, number>,
  defenderTechnologies: Record<TechnologyType, number>,
  battleToFinish: boolean = false // 战斗到底模式
): Promise<BattleResult> => {
  // 军官战斗加成（NPC 侧为 {}，恒为 0）
  const attackerCombat = getOfficerCombatBonuses(attackerOfficers)
  const defenderCombat = getOfficerCombatBonuses(defenderOfficers)

  // 从科技系统读取实际科技等级
  const attackerWeaponTech = attackerTechnologies['weaponsTechnology'] || 0
  const attackerShieldTech = attackerTechnologies['shieldingTechnology'] || 0
  const attackerArmorTech = attackerTechnologies['armourTechnology'] || 0

  const defenderWeaponTech = defenderTechnologies['weaponsTechnology'] || 0
  const defenderShieldTech = defenderTechnologies['shieldingTechnology'] || 0
  const defenderArmorTech = defenderTechnologies['armourTechnology'] || 0

  // 使用 Worker 执行战斗模拟
  const simulationResult = await workerManager.simulateBattle({
    attacker: {
      ships: attackerFleet,
      weaponTech: attackerWeaponTech,
      shieldTech: attackerShieldTech,
      armorTech: attackerArmorTech,
      attackBonus: attackerCombat.attack,
      defenseBonus: attackerCombat.defense
    },
    defender: {
      ships: defenderFleet,
      defense: defenderDefense,
      weaponTech: defenderWeaponTech,
      shieldTech: defenderShieldTech,
      armorTech: defenderArmorTech,
      attackBonus: defenderCombat.attack,
      defenseBonus: defenderCombat.defense
    },
    maxRounds: battleToFinish ? 100 : 6 // 战斗到底模式最多100回合，经典模式6回合
  })

  // 计算掠夺（仅攻击方胜利时）
  const plunder =
    simulationResult.winner === 'attacker'
      ? await workerManager.calculatePlunder({
          defenderResources,
          attackerFleet: simulationResult.attackerRemaining
        })
      : { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 }

  // 计算残骸场
  const debrisField = await workerManager.calculateDebris({
    attackerLosses: simulationResult.attackerLosses,
    defenderLosses: simulationResult.defenderLosses
  })

  // 计算月球生成概率（根据残骸场总量）
  const totalDebris = debrisField.metal + debrisField.crystal
  const moonChance = Math.min(MOON_CONFIG.baseChance + Math.floor(totalDebris / MOON_CONFIG.chancePerDebris), MOON_CONFIG.maxChance) / 100 // 转换为0-1的概率

  // 生成战斗报告
  const battleResult: BattleResult = {
    id: generateId('battle'),
    timestamp: Date.now(),
    attackerId: '',
    defenderId: '',
    attackerPlanetId: '',
    defenderPlanetId: '',
    attackerFleet,
    defenderFleet,
    defenderDefense,
    attackerLosses: simulationResult.attackerLosses,
    defenderLosses: simulationResult.defenderLosses,
    winner: simulationResult.winner,
    plunder,
    debrisField,
    // 新增详细信息
    rounds: simulationResult.rounds,
    attackerRemaining: simulationResult.attackerRemaining,
    defenderRemaining: simulationResult.defenderRemaining,
    roundDetails: simulationResult.roundDetails,
    moonChance
  }

  return battleResult
}

/**
 * 计算防御设施修复（防御有70%概率修复）
 */
export const repairDefense = (
  defenseBeforeBattle: Partial<Record<DefenseType, number>>,
  defenseAfterBattle: Partial<Record<DefenseType, number>>
): Partial<Record<DefenseType, number>> => {
  const repaired: Partial<Record<DefenseType, number>> = { ...defenseAfterBattle }

  Object.keys(defenseBeforeBattle).forEach(defenseType => {
    const before = defenseBeforeBattle[defenseType as DefenseType] || 0
    const after = defenseAfterBattle[defenseType as DefenseType] || 0
    const lost = before - after

    if (lost > 0) {
      // 70%修复概率
      const repairedCount = Math.floor(lost * 0.7)
      repaired[defenseType as DefenseType] = after + repairedCount
    }
  })

  return repaired
}
