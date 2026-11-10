import type { Planet, Resources } from '@/types/game'
import { BuildingType, ShipType, DefenseType } from '@/types/game'
import { MOON_CONFIG, FLEET_STORAGE_CONFIG } from '@/config/gameConfig'
import { generateId } from '@/utils/id'

/**
 * 计算月球生成概率
 * OGame规则：每100,000残骸(金属+晶体) = 1%概率，最高20%（需要2,000,000残骸）
 * @param debrisField 战斗产生的残骸场
 * @returns 生成概率（0-20）
 */
export const calculateMoonGenerationChance = (debrisField: Resources): number => {
  const totalDebris = debrisField.metal + debrisField.crystal

  // 残骸不足最小值，无法生成月球
  if (totalDebris < MOON_CONFIG.minDebrisField) {
    return 0
  }

  // 计算概率：每100k残骸 = 1%
  const chance = Math.floor(totalDebris / MOON_CONFIG.chancePerDebris)

  // 限制在最大概率内（20%）
  return Math.min(chance, MOON_CONFIG.maxChance)
}

/**
 * 计算月球直径
 * OGame规则：直径基于生成时的moonchance，20%概率保证直径>8000km
 * @param moonChance 月球生成概率（1-20）
 * @returns 月球直径(km)
 */
export const calculateMoonDiameter = (moonChance: number): number => {
  // 基础直径 + 每%概率增加的直径 + 随机波动
  const baseDiameter = MOON_CONFIG.baseDiameter
  const bonusDiameter = moonChance * MOON_CONFIG.diameterPerChance
  // 添加±10%的随机波动
  const randomFactor = 0.9 + Math.random() * 0.2
  const diameter = Math.floor((baseDiameter + bonusDiameter) * randomFactor)

  // 确保在合理范围内
  return Math.max(MOON_CONFIG.minDiameter, Math.min(MOON_CONFIG.maxDiameter, diameter))
}

/**
 * 尝试生成月球
 * OGame规则：
 * - 每100k残骸 = 1%概率
 * - 最高20%概率（需要2M残骸）
 * - 月球初始只有1格空间
 * - 直径基于moonchance计算
 *
 * @param debrisField 战斗产生的残骸场
 * @param planetPosition 星球坐标
 * @param planetId 母星ID
 * @param playerId 玩家ID
 * @returns 生成的月球对象，如果未生成则返回null
 */
export const tryGenerateMoon = (
  debrisField: Resources,
  planetPosition: { galaxy: number; system: number; position: number },
  planetId: string,
  playerId: string
): Planet | null => {
  const chance = calculateMoonGenerationChance(debrisField)

  // 无法生成
  if (chance === 0) {
    return null
  }

  // 随机判断是否生成
  const roll = Math.random() * 100
  if (roll >= chance) {
    return null
  }

  // 计算月球直径
  const diameter = calculateMoonDiameter(chance)

  // 生成月球
  const moon: Planet = {
    id: generateId('moon'),
    name: `Moon [${planetPosition.galaxy}:${planetPosition.system}:${planetPosition.position}]`,
    ownerId: playerId,
    position: planetPosition,
    resources: { metal: 0, crystal: 0, deuterium: 0, darkMatter: 0, energy: 0 },
    buildings: {} as Record<BuildingType, number>,
    fleet: {
      [ShipType.LightFighter]: 0,
      [ShipType.HeavyFighter]: 0,
      [ShipType.Cruiser]: 0,
      [ShipType.Battleship]: 0,
      [ShipType.Battlecruiser]: 0,
      [ShipType.Bomber]: 0,
      [ShipType.Destroyer]: 0,
      [ShipType.SmallCargo]: 0,
      [ShipType.LargeCargo]: 0,
      [ShipType.ColonyShip]: 0,
      [ShipType.Recycler]: 0,
      [ShipType.EspionageProbe]: 0,
      [ShipType.SolarSatellite]: 0,
      [ShipType.DarkMatterHarvester]: 0,
      [ShipType.Deathstar]: 0,
      [ShipType.StarAbyssFreighter]: 0
    },
    defense: {
      [DefenseType.RocketLauncher]: 0,
      [DefenseType.LightLaser]: 0,
      [DefenseType.HeavyLaser]: 0,
      [DefenseType.GaussCannon]: 0,
      [DefenseType.IonCannon]: 0,
      [DefenseType.PlasmaTurret]: 0,
      [DefenseType.SmallShieldDome]: 0,
      [DefenseType.LargeShieldDome]: 0,
      [DefenseType.AntiBallisticMissile]: 0,
      [DefenseType.InterplanetaryMissile]: 0,
      [DefenseType.PlanetaryShield]: 0
    },
    buildQueue: [],
    waitingBuildQueue: [], // 等待队列
    lastUpdate: Date.now(),
    maxSpace: MOON_CONFIG.baseFields, // OGame规则：月球初始只有1格空间
    maxFleetStorage: FLEET_STORAGE_CONFIG.baseStorage,
    isMoon: true,
    parentPlanetId: planetId,
    diameter: diameter // 月球直径(km)
  }

  // 初始化所有建筑为0级
  Object.values(BuildingType).forEach(building => {
    moon.buildings[building] = 0
  })

  return moon
}

/**
 * 检查坐标是否已有月球
 * @param planets 所有星球列表
 * @param position 坐标
 * @returns 是否已有月球
 */
export const hasMoonAtPosition = (planets: Planet[], position: { galaxy: number; system: number; position: number }): boolean => {
  return planets.some(
    p =>
      p.isMoon &&
      p.position.galaxy === position.galaxy &&
      p.position.system === position.system &&
      p.position.position === position.position
  )
}

/**
 * 月球销毁结果类型
 */
export interface MoonDestructionResult {
  moonDestroyed: boolean // 月球是否被销毁
  deathstarsDestroyed: boolean // 死星是否被反向销毁
  moonDestructionChance: number // 月球销毁概率
  deathstarDestructionChance: number // 死星被销毁概率
}

/**
 * 计算月球销毁概率
 * OGame规则：销毁概率 = (100 - √diameter) × √deathstars
 * @param moonDiameter 月球直径(km)
 * @param deathstarCount 死星数量
 * @returns 销毁概率(0-100)
 */
export const calculateMoonDestructionChance = (moonDiameter: number, deathstarCount: number): number => {
  if (deathstarCount <= 0) return 0

  // 公式：(100 - √diameter) × √deathstars
  const chance = (100 - Math.sqrt(moonDiameter)) * Math.sqrt(deathstarCount)

  // 限制在0-100之间
  return Math.max(0, Math.min(100, chance))
}

/**
 * 计算死星被反向销毁的概率
 * OGame规则：反向销毁概率 = √diameter / 2
 * @param moonDiameter 月球直径(km)
 * @returns 死星被销毁概率(0-100)
 */
export const calculateDeathstarDestructionChance = (moonDiameter: number): number => {
  // 公式：√diameter / 2
  const chance = Math.sqrt(moonDiameter) / 2

  // 限制在0-100之间
  return Math.max(0, Math.min(100, chance))
}

/**
 * 尝试销毁月球（死星攻击月球时调用）
 * OGame规则：
 * - 死星攻击月球时，先进行正常战斗
 * - 战斗后，如果死星存活，则判定月球销毁
 * - 月球销毁概率 = (100 - √diameter) × √deathstars
 * - 死星反向销毁概率 = √diameter / 2
 * - 两个概率独立判定
 *
 * @param moon 目标月球
 * @param deathstarCount 攻击的死星数量
 * @returns 销毁结果
 */
export const tryDestroyMoon = (moon: Planet, deathstarCount: number): MoonDestructionResult => {
  if (!moon.isMoon || deathstarCount <= 0) {
    return {
      moonDestroyed: false,
      deathstarsDestroyed: false,
      moonDestructionChance: 0,
      deathstarDestructionChance: 0
    }
  }

  const diameter = moon.diameter || MOON_CONFIG.minDiameter

  // 计算概率
  const moonDestructionChance = calculateMoonDestructionChance(diameter, deathstarCount)
  const deathstarDestructionChance = calculateDeathstarDestructionChance(diameter)

  // 独立判定
  const moonRoll = Math.random() * 100
  const deathstarRoll = Math.random() * 100

  const moonDestroyed = moonRoll < moonDestructionChance
  const deathstarsDestroyed = deathstarRoll < deathstarDestructionChance

  return {
    moonDestroyed,
    deathstarsDestroyed,
    moonDestructionChance,
    deathstarDestructionChance
  }
}

/**
 * 计算传感器阵列扫描范围
 * OGame规则：范围 = level² - 1 个星系
 * @param sensorPhalanxLevel 传感器阵列等级
 * @returns 可扫描的星系范围（单向）
 */
export const calculateSensorPhalanxRange = (sensorPhalanxLevel: number): number => {
  if (sensorPhalanxLevel <= 0) return 0
  return sensorPhalanxLevel * sensorPhalanxLevel - 1
}

/**
 * 检查目标坐标是否在传感器阵列扫描范围内
 * @param moonPosition 月球坐标
 * @param targetPosition 目标坐标
 * @param sensorPhalanxLevel 传感器阵列等级
 * @returns 是否在扫描范围内
 */
export const isInSensorPhalanxRange = (
  moonPosition: { galaxy: number; system: number; position: number },
  targetPosition: { galaxy: number; system: number; position: number },
  sensorPhalanxLevel: number
): boolean => {
  // 必须在同一银河系
  if (moonPosition.galaxy !== targetPosition.galaxy) return false

  const range = calculateSensorPhalanxRange(sensorPhalanxLevel)
  const systemDistance = Math.abs(moonPosition.system - targetPosition.system)

  return systemDistance <= range
}

/**
 * 检查跳跃门是否可用（冷却是否结束）
 * OGame规则：跳跃门使用后有1小时冷却时间
 * @param moon 月球对象
 * @returns 是否可以使用跳跃门
 */
export const isJumpGateReady = (moon: Planet): boolean => {
  if (!moon.isMoon) return false
  if (!moon.buildings[BuildingType.JumpGate] || moon.buildings[BuildingType.JumpGate] <= 0) return false

  const lastUsed = moon.jumpGateLastUsed || 0
  const cooldownEnd = lastUsed + MOON_CONFIG.jumpGateCooldown

  return Date.now() >= cooldownEnd
}

/**
 * 获取跳跃门剩余冷却时间（毫秒）
 * @param moon 月球对象
 * @returns 剩余冷却时间（毫秒），0表示已冷却完成
 */
export const getJumpGateCooldownRemaining = (moon: Planet): number => {
  if (!moon.isMoon) return 0
  if (!moon.buildings[BuildingType.JumpGate] || moon.buildings[BuildingType.JumpGate] <= 0) return 0

  const lastUsed = moon.jumpGateLastUsed || 0
  const cooldownEnd = lastUsed + MOON_CONFIG.jumpGateCooldown
  const remaining = cooldownEnd - Date.now()

  return Math.max(0, remaining)
}

/**
 * 使用跳跃门（记录使用时间）
 * @param moon 月球对象
 */
export const useJumpGate = (moon: Planet): void => {
  if (moon.isMoon) {
    moon.jumpGateLastUsed = Date.now()
  }
}

/**
 * 检查两个月球之间是否可以使用跳跃门传送
 * OGame规则：两个月球都必须有跳跃门，且都必须冷却完成
 * @param sourceMoon 源月球
 * @param targetMoon 目标月球
 * @returns 是否可以传送
 */
export const canUseJumpGate = (sourceMoon: Planet, targetMoon: Planet): boolean => {
  // 两个都必须是月球
  if (!sourceMoon.isMoon || !targetMoon.isMoon) return false

  // 两个都必须有跳跃门
  const sourceHasGate = sourceMoon.buildings[BuildingType.JumpGate] > 0
  const targetHasGate = targetMoon.buildings[BuildingType.JumpGate] > 0
  if (!sourceHasGate || !targetHasGate) return false

  // 两个跳跃门都必须冷却完成
  return isJumpGateReady(sourceMoon) && isJumpGateReady(targetMoon)
}
