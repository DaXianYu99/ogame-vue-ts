import type { Officer, Resources } from '@/types/game'
import { OfficerType } from '@/types/game'
import { OFFICERS } from '@/config/gameConfig'

/**
 * 获取军官成本
 */
export const getOfficerCost = (officerType: OfficerType): Resources => {
  const config = OFFICERS[officerType]
  return config.cost
}

/**
 * 检查军官是否激活
 */
export const isOfficerActive = (officer: Officer, now: number): boolean => {
  return officer.active && (!officer.expiresAt || officer.expiresAt > now)
}

/**
 * 创建激活的军官
 */
export const createActiveOfficer = (officerType: OfficerType, duration: number): Officer => {
  const now = Date.now()
  return {
    type: officerType,
    active: true,
    hiredAt: now,
    expiresAt: now + duration * 24 * 60 * 60 * 1000 // duration天后过期
  }
}

/**
 * 创建未激活的军官
 */
export const createInactiveOfficer = (officerType: OfficerType): Officer => {
  return {
    type: officerType,
    active: false
  }
}

/**
 * 续约军官
 */
export const renewOfficerExpiration = (officer: Officer, duration: number, now: number): Officer => {
  const expiresAt = officer.expiresAt && officer.expiresAt > now ? officer.expiresAt : now
  return {
    ...officer,
    active: true,
    expiresAt: expiresAt + duration * 24 * 60 * 60 * 1000
  }
}

/**
 * 计算所有激活军官的加成
 */
export const calculateActiveBonuses = (officers: Record<OfficerType, Officer>, now: number) => {
  const bonuses = {
    buildingSpeedBonus: 0,
    researchSpeedBonus: 0,
    resourceProductionBonus: 0,
    darkMatterProductionBonus: 0,
    energyProductionBonus: 0,
    fleetSpeedBonus: 0,
    fuelConsumptionReduction: 0,
    defenseBonus: 0,
    additionalBuildQueue: 0,
    additionalFleetSlots: 0,
    storageCapacityBonus: 0
  }

  Object.values(officers).forEach(officer => {
    if (isOfficerActive(officer, now)) {
      const config = OFFICERS[officer.type]
      if (!config) return // 未知军官类型（例如存档修改器写入的自定义 type）直接跳过，避免 TypeError
      Object.entries(config.benefits).forEach(([key, value]) => {
        if (value !== undefined) {
          bonuses[key as keyof typeof bonuses] += value
        }
      })
    }
  })

  return bonuses
}

/**
 * 检查并停用过期的军官
 */
export const checkAndDeactivateExpiredOfficers = (officers: Record<OfficerType, Officer>, now: number): void => {
  Object.values(officers).forEach(officer => {
    if (officer.active && officer.expiresAt && officer.expiresAt <= now) {
      officer.active = false
    }
  })
}
