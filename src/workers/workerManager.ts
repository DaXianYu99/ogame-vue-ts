/**
 * Worker 管理器
 * 统一管理所有 Worker 的创建、通信和销毁
 */
import type { WorkerRequestMessage, WorkerResponseMessage, WorkerMessageType } from '@/types/worker'
import { WorkerMessageType as MsgType } from '@/types/worker'
import { toRaw } from 'vue'
import BattleWorker from './battle.worker?worker'

/**
 * Worker 任务接口
 */
interface WorkerTask {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timeout?: ReturnType<typeof setTimeout>
}

/**
 * 将 Vue 响应式对象转换为普通对象
 * 使用 toRaw() 获取原始对象，避免 Proxy 无法被 structured clone
 */
const toPlainObject = <T>(obj: T): T => {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  // 使用 toRaw 获取 Vue 响应式对象的原始值
  const raw = toRaw(obj)

  // 对于数组，递归处理每个元素
  if (Array.isArray(raw)) {
    return raw.map(item => toPlainObject(item)) as unknown as T
  }

  // 对于对象，递归处理每个属性
  if (raw && typeof raw === 'object') {
    const plain: any = {}
    for (const key in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) {
        plain[key] = toPlainObject(raw[key])
      }
    }
    return plain
  }

  return raw
}

/**
 * Worker 管理类
 */
class WorkerManager {
  private battleWorker: Worker | null = null
  private pendingTasks: Map<string, WorkerTask> = new Map()
  private messageIdCounter = 0
  private readonly defaultTimeout = 10000 // 30秒超时

  /**
   * 初始化战斗 Worker
   */
  private initBattleWorker(): void {
    if (this.battleWorker) return

    this.battleWorker = new BattleWorker()
    this.setupWorkerHandlers(this.battleWorker, 'Battle')
  }

  /**
   * 设置 Worker 消息处理器
   */
  private setupWorkerHandlers(worker: Worker, workerName: string): void {
    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const { id, success, data, error } = event.data

      const task = this.pendingTasks.get(id)
      if (!task) {
        console.warn(`[WorkerManager] No pending task found for message ID: ${id}`)
        return
      }

      // 清除超时定时器
      if (task.timeout) {
        clearTimeout(task.timeout)
      }

      // 移除任务
      this.pendingTasks.delete(id)

      // 处理响应
      if (success) {
        task.resolve(data)
      } else {
        task.reject(new Error(error || 'Worker task failed'))
      }
    }

    worker.onerror = (error: ErrorEvent) => {
      console.error(`[WorkerManager] ${workerName} worker error:`, error)
      // 拒绝所有待处理的任务
      for (const task of this.pendingTasks.values()) {
        if (task.timeout) clearTimeout(task.timeout)
        task.reject(new Error(`${workerName} worker crashed`))
      }
      this.pendingTasks.clear()

      // 清除对应的 worker 引用
      if (workerName === 'Battle') {
        this.battleWorker = null
      }
    }
  }

  /**
   * 生成唯一的消息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`
  }

  /**
   * 根据消息类型获取对应的 Worker
   */
  private getWorkerByType(type: WorkerMessageType): Worker {
    // 战斗相关消息使用 battleWorker
    if (type === MsgType.SIMULATE_BATTLE || type === MsgType.CALCULATE_PLUNDER || type === MsgType.CALCULATE_DEBRIS) {
      this.initBattleWorker()
      return this.battleWorker!
    }

    throw new Error(`Unknown message type: ${type}`)
  }

  /**
   * 发送消息到 Worker 并等待响应
   */
  private sendMessage<T>(type: WorkerMessageType, payload: unknown, timeout: number = this.defaultTimeout): Promise<T> {
    const worker = this.getWorkerByType(type)

    if (!worker) {
      return Promise.reject(new Error('Worker initialization failed'))
    }

    const id = this.generateMessageId()

    return new Promise<T>((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.pendingTasks.delete(id)
        reject(new Error(`Worker task timeout after ${timeout}ms`))
      }, timeout)

      // 保存任务
      this.pendingTasks.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout: timeoutId
      })

      // 发送消息（使用 toPlainObject 转换 Vue Proxy 对象，然后使用浏览器内置的 structured clone）
      const message: WorkerRequestMessage = { id, type, payload: toPlainObject(payload) }
      worker.postMessage(message)
    })
  }

  /**
   * 战斗模拟
   */
  public async simulateBattle(params: {
    attacker: {
      ships: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['ships']
      defense?: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['defense']
      weaponTech?: number
      shieldTech?: number
      armorTech?: number
      attackBonus?: number
      defenseBonus?: number
    }
    defender: {
      ships: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['ships']
      defense?: Parameters<typeof import('@/utils/battleSimulator').simulateBattle>[0]['defense']
      weaponTech?: number
      shieldTech?: number
      armorTech?: number
      attackBonus?: number
      defenseBonus?: number
    }
    maxRounds?: number
  }): Promise<ReturnType<typeof import('@/utils/battleSimulator').simulateBattle>> {
    return this.sendMessage(MsgType.SIMULATE_BATTLE, params)
  }

  /**
   * 计算掠夺资源
   */
  public async calculatePlunder(params: {
    defenderResources: Parameters<typeof import('@/utils/battleSimulator').calculatePlunder>[0]
    attackerFleet: Parameters<typeof import('@/utils/battleSimulator').calculatePlunder>[1]
  }): Promise<ReturnType<typeof import('@/utils/battleSimulator').calculatePlunder>> {
    return this.sendMessage(MsgType.CALCULATE_PLUNDER, params)
  }

  /**
   * 计算残骸场
   */
  public async calculateDebris(params: {
    attackerLosses: Parameters<typeof import('@/utils/battleSimulator').calculateDebrisField>[0]
    defenderLosses: Parameters<typeof import('@/utils/battleSimulator').calculateDebrisField>[1]
  }): Promise<ReturnType<typeof import('@/utils/battleSimulator').calculateDebrisField>> {
    return this.sendMessage(MsgType.CALCULATE_DEBRIS, params)
  }

  /**
   * 销毁所有 Worker
   */
  public destroy(): void {
    if (this.battleWorker) {
      this.battleWorker.terminate()
      this.battleWorker = null
    }

    // 清除所有待处理的任务
    for (const task of this.pendingTasks.values()) {
      if (task.timeout) clearTimeout(task.timeout)
      task.reject(new Error('Worker manager destroyed'))
    }
    this.pendingTasks.clear()
  }

  /**
   * 获取待处理任务数量
   */
  public getPendingTaskCount(): number {
    return this.pendingTasks.size
  }
}

// 导出单例
export const workerManager = new WorkerManager()
