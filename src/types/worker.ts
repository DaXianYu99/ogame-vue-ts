import type { Fleet, Resources } from './game'
import { DefenseType } from './game'

/**
 * Worker 消息类型
 */
export const WorkerMessageType = {
  // 战斗模拟相关
  SIMULATE_BATTLE: 'SIMULATE_BATTLE',
  CALCULATE_PLUNDER: 'CALCULATE_PLUNDER',
  CALCULATE_DEBRIS: 'CALCULATE_DEBRIS',

  // 通用响应
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
} as const

export type WorkerMessageType = (typeof WorkerMessageType)[keyof typeof WorkerMessageType]

/**
 * 战斗方数据
 */
export interface BattleSideData {
  ships: Partial<Fleet>
  defense?: Partial<Record<DefenseType, number>>
  weaponTech?: number
  shieldTech?: number
  armorTech?: number
  attackBonus?: number // 军官攻击加成 (%)
  defenseBonus?: number // 军官防御加成 (%)
}

/**
 * 战斗模拟结果
 */
export interface BattleSimulationResult {
  winner: 'attacker' | 'defender' | 'draw'
  rounds: number
  attackerLosses: Partial<Fleet>
  defenderLosses: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  attackerRemaining: Partial<Fleet>
  defenderRemaining: {
    fleet: Partial<Fleet>
    defense: Partial<Record<DefenseType, number>>
  }
  roundDetails: Array<{
    round: number
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
    attackerRemainingPower: number
    defenderRemainingPower: number
  }>
}

/**
 * Worker 消息基础接口
 */
export interface WorkerMessageBase {
  id: string
  type: WorkerMessageType
}

/**
 * Worker 请求消息
 */
export interface WorkerRequestMessage extends WorkerMessageBase {
  payload: unknown
}

/**
 * Worker 响应消息
 */
export interface WorkerResponseMessage extends WorkerMessageBase {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * 战斗模拟请求
 */
export interface SimulateBattleRequest extends WorkerRequestMessage {
  type: typeof WorkerMessageType.SIMULATE_BATTLE
  payload: {
    attacker: BattleSideData
    defender: BattleSideData
    maxRounds?: number
  }
}

/**
 * 掠夺计算请求
 */
export interface CalculatePlunderRequest extends WorkerRequestMessage {
  type: typeof WorkerMessageType.CALCULATE_PLUNDER
  payload: {
    defenderResources: Resources
    attackerFleet: Partial<Fleet>
  }
}

/**
 * 残骸场计算请求
 */
export interface CalculateDebrisRequest extends WorkerRequestMessage {
  type: typeof WorkerMessageType.CALCULATE_DEBRIS
  payload: {
    attackerLosses: Partial<Fleet>
    defenderLosses: {
      fleet: Partial<Fleet>
      defense: Partial<Record<DefenseType, number>>
    }
  }
}

/**
 * 所有 Worker 请求类型
 */
export type WorkerRequest = SimulateBattleRequest | CalculatePlunderRequest | CalculateDebrisRequest
