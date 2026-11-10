import type {
  AllyDefenseNotification,
  DebrisField,
  FleetMission,
  IncomingFleetAlert,
  JointAttackInvite,
  MissionReport,
  NPC,
  NPCActivityNotification,
  Planet,
  Player,
  Position,
  SpiedNotification,
  SpyReport
} from '@/types/game'
import { decryptData, encryptData } from './crypto'
import { generatePlanetTemperature } from '@/logic/planetLogic'
import pkg from '../../package.json'

/**
 * 数据迁移工具
 * 用于从旧版本数据结构迁移到新版本
 */

type PlanetKind = 'planet' | 'moon'
type RemappedPlanetEntry = { newId: string; name: string }
type DuplicatePlanetKindMap = Map<PlanetKind, RemappedPlanetEntry>
type DuplicatePlanetPositionMap = Map<string, DuplicatePlanetKindMap>

// oldPlanetId -> position -> planet/moon -> remapped target
type DuplicatePlanetIdMap = Map<string, DuplicatePlanetPositionMap>

interface MigratablePlayer extends Player {
  diplomaticRelations?: Record<string, unknown>
}

interface MigratableGameData {
  currentPlanetId?: string
  player?: MigratablePlayer
  npcs?: NPC[]
  universePlanets?: Record<string, Planet>
  debrisFields?: Record<string, DebrisField>
}

interface PlanetReferenceContext {
  position?: Position
  isMoon?: boolean
  planetName?: string
}

interface HasTargetPlanetId {
  targetPlanetId?: string
}

interface HasOriginPlanetId {
  originPlanetId?: string
}

interface HasParentPlanetId {
  parentPlanetId?: string
}

interface HasCurrentPlanetId {
  currentPlanetId?: string
}

const getPlanetPositionKey = (position: Position): string => {
  return `${position.galaxy}:${position.system}:${position.position}`
}

const getPlanetKindKey = (isMoon?: boolean): PlanetKind => {
  return isMoon ? 'moon' : 'planet'
}

const getPlanetEntriesFor = (
  planetId: string,
  idMap: DuplicatePlanetIdMap,
  position?: Position
): DuplicatePlanetKindMap | undefined => {
  if (!position) return undefined

  return idMap.get(planetId)?.get(getPlanetPositionKey(position))
}

const getEntriesByName = (entries: Iterable<RemappedPlanetEntry>, planetName?: string): RemappedPlanetEntry[] => {
  if (!planetName) {
    return []
  }

  return Array.from(entries).filter(entry => entry.name === planetName)
}

const getUniqueEntryByName = (entries: Iterable<RemappedPlanetEntry>, planetName?: string): RemappedPlanetEntry | undefined => {
  const matchedEntries = getEntriesByName(entries, planetName)
  if (matchedEntries.length !== 1) {
    return undefined
  }

  return matchedEntries[0]
}

const getOnlyEntry = (entries: DuplicatePlanetKindMap): RemappedPlanetEntry | undefined => {
  if (entries.size !== 1) {
    return undefined
  }

  return Array.from(entries.values())[0]
}

const getEntriesAcrossPositions = (byPosition: DuplicatePlanetPositionMap): RemappedPlanetEntry[] => {
  const entries: RemappedPlanetEntry[] = []

  byPosition.forEach(byKind => {
    byKind.forEach(entry => {
      entries.push(entry)
    })
  })

  return entries
}

const buildDuplicatePlanetIdMap = (player: Player): DuplicatePlanetIdMap => {
  const planetsByOriginalId = new Map<string, Planet[]>()

  player.planets.forEach(planet => {
    let group = planetsByOriginalId.get(planet.id)
    if (!group) {
      group = []
      planetsByOriginalId.set(planet.id, group)
    }
    group.push(planet)
  })

  const idMap: DuplicatePlanetIdMap = new Map()

  planetsByOriginalId.forEach((planets, originalId) => {
    if (planets.length <= 1) return

    planets.forEach((planet, index) => {
      if (index === 0) return

      const newId = `${originalId}_${Math.random().toString(36).substring(2, 9)}`
      const positionKey = getPlanetPositionKey(planet.position)

      let byPosition = idMap.get(originalId)
      if (!byPosition) {
        byPosition = new Map()
        idMap.set(originalId, byPosition)
      }

      let byKind = byPosition.get(positionKey)
      if (!byKind) {
        byKind = new Map()
        byPosition.set(positionKey, byKind)
      }

      byKind.set(getPlanetKindKey(planet.isMoon), {
        newId,
        name: planet.name
      })

      planet.id = newId
    })
  })

  return idMap
}

const resolveRemappedPlanetId = (
  planetId: string | undefined,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): string | undefined => {
  if (!planetId) return undefined

  const byPosition = idMap.get(planetId)
  if (!byPosition) return undefined

  if (context.position) {
    const byKind = getPlanetEntriesFor(planetId, idMap, context.position)
    if (!byKind) return undefined

    // 只有在位置或名称足够区分目标时才重写引用，避免把旧引用误指到错误星球
    if (context.isMoon !== undefined) {
      return byKind.get(getPlanetKindKey(context.isMoon))?.newId
    }

    const matchedByName = getUniqueEntryByName(byKind.values(), context.planetName)
    if (matchedByName) {
      return matchedByName.newId
    }

    return getOnlyEntry(byKind)?.newId
  }

  if (context.planetName) {
    return getUniqueEntryByName(getEntriesAcrossPositions(byPosition), context.planetName)?.newId
  }

  return undefined
}

const getUpdatedPlanetId = (
  currentPlanetId: string | undefined,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): string | undefined => {
  const remappedPlanetId = resolveRemappedPlanetId(currentPlanetId, idMap, context)
  if (!remappedPlanetId || remappedPlanetId === currentPlanetId) {
    return undefined
  }

  return remappedPlanetId
}

const updateTargetPlanetId = (
  target: HasTargetPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.targetPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.targetPlanetId = remappedPlanetId
  return true
}

const updateOriginPlanetId = (
  target: HasOriginPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.originPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.originPlanetId = remappedPlanetId
  return true
}

const updateParentPlanetId = (
  target: HasParentPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.parentPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.parentPlanetId = remappedPlanetId
  return true
}

const updateCurrentPlanetId = (
  target: HasCurrentPlanetId,
  idMap: DuplicatePlanetIdMap,
  context: PlanetReferenceContext = {}
): boolean => {
  const remappedPlanetId = getUpdatedPlanetId(target.currentPlanetId, idMap, context)
  if (!remappedPlanetId) {
    return false
  }

  target.currentPlanetId = remappedPlanetId
  return true
}

const updateMissionTargetPlanetId = (mission: FleetMission, idMap: DuplicatePlanetIdMap): boolean => {
  return updateTargetPlanetId(mission, idMap, {
    position: mission.targetPosition,
    isMoon: mission.targetIsMoon
  })
}

const updateSpyReportTargetPlanetId = (report: SpyReport, idMap: DuplicatePlanetIdMap): boolean => {
  return updateTargetPlanetId(report, idMap, {
    position: report.targetPosition,
    planetName: report.targetPlanetName
  })
}

const updateSpiedNotificationTargetPlanetId = (
  notification: SpiedNotification,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(notification, idMap, {
    planetName: notification.targetPlanetName
  })
}

const updateNPCActivityTargetPlanetId = (
  notification: NPCActivityNotification,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(notification, idMap, {
    position: notification.targetPosition,
    planetName: notification.targetPlanetName
  })
}

const updateIncomingAlertTargetPlanetId = (
  alert: IncomingFleetAlert,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(alert, idMap, {
    planetName: alert.targetPlanetName
  })
}

const updateJointAttackTargetPlanetId = (
  invite: JointAttackInvite,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(invite, idMap, {
    position: invite.targetPosition
  })
}

const updateAllyDefenseTargetPlanetId = (
  notification: AllyDefenseNotification,
  idMap: DuplicatePlanetIdMap
): boolean => {
  return updateTargetPlanetId(notification, idMap, {
    planetName: notification.targetPlanetName
  })
}

const updateMissionReportPlanetIds = (report: MissionReport, idMap: DuplicatePlanetIdMap): boolean => {
  let mutated = false

  if (updateOriginPlanetId(report, idMap, {
    planetName: report.originPlanetName
  })) {
    mutated = true
  }

  if (updateTargetPlanetId(report, idMap, {
    position: report.targetPosition,
    planetName: report.targetPlanetName
  })) {
    mutated = true
  }

  if (report.details?.newPlanetId) {
    const remappedNewPlanetId = getUpdatedPlanetId(report.details.newPlanetId, idMap, {
      position: report.targetPosition,
      planetName: report.details.newPlanetName || report.targetPlanetName
    })

    if (remappedNewPlanetId) {
      report.details.newPlanetId = remappedNewPlanetId
      mutated = true
    }
  }

  return mutated
}

const fixPlayerPlanetsAndQueues = (player: Player, idMap: DuplicatePlanetIdMap): boolean => {
  let mutated = false

  player.planets.forEach(planet => {
    if (planet.isMoon && updateParentPlanetId(planet, idMap, {
      position: planet.position,
      isMoon: false
    })) {
      mutated = true
    }

    // 等待队列里的 planetId 应始终与所属星球保持一致
    planet.waitingBuildQueue?.forEach(item => {
      if (item.planetId && item.planetId !== planet.id) {
        item.planetId = planet.id
        mutated = true
      }
    })
  })

  return mutated
}

const fixPlayerReferences = (
  player: Player,
  data: MigratableGameData,
  idMap: DuplicatePlanetIdMap
): boolean => {
  let mutated = false

  if (updateCurrentPlanetId(data, idMap)) {
    mutated = true
  }

  player.fleetMissions?.forEach(mission => {
    if (updateMissionTargetPlanetId(mission, idMap)) {
      mutated = true
    }
  })

  player.spyReports?.forEach(report => {
    if (updateSpyReportTargetPlanetId(report, idMap)) {
      mutated = true
    }
  })

  player.spiedNotifications?.forEach(notification => {
    if (updateSpiedNotificationTargetPlanetId(notification, idMap)) {
      mutated = true
    }
  })

  player.npcActivityNotifications?.forEach(notification => {
    if (updateNPCActivityTargetPlanetId(notification, idMap)) {
      mutated = true
    }
  })

  player.missionReports?.forEach(report => {
    if (updateMissionReportPlanetIds(report, idMap)) {
      mutated = true
    }
  })

  player.incomingFleetAlerts?.forEach(alert => {
    if (updateIncomingAlertTargetPlanetId(alert, idMap)) {
      mutated = true
    }
  })

  player.jointAttackInvites?.forEach(invite => {
    if (updateJointAttackTargetPlanetId(invite, idMap)) {
      mutated = true
    }
  })

  player.allyDefenseNotifications?.forEach(notification => {
    if (updateAllyDefenseTargetPlanetId(notification, idMap)) {
      mutated = true
    }
  })

  return mutated
}

const fixNpcPlayerSpyReports = (npc: NPC, idMap: DuplicatePlanetIdMap): boolean => {
  if (!npc.playerSpyReports) {
    return false
  }

  let mutated = false
  const remappedPlayerSpyReports: Record<string, SpyReport> = {}

  // playerSpyReports 的 key 就是玩家星球 ID，需要和报告内容一起迁移
  Object.entries(npc.playerSpyReports).forEach(([planetId, report]) => {
    if (updateSpyReportTargetPlanetId(report, idMap)) {
      mutated = true
    }

    const remappedPlanetId = getUpdatedPlanetId(planetId, idMap, {
      position: report.targetPosition,
      planetName: report.targetPlanetName
    })

    if (remappedPlanetId) {
      remappedPlayerSpyReports[remappedPlanetId] = report
      mutated = true
      return
    }

    remappedPlayerSpyReports[planetId] = report
  })

  npc.playerSpyReports = remappedPlayerSpyReports
  return mutated
}

const fixNpcReferences = (npcs: NPC[], idMap: DuplicatePlanetIdMap): boolean => {
  let mutated = false

  npcs.forEach(npc => {
    if (fixNpcPlayerSpyReports(npc, idMap)) {
      mutated = true
    }

    npc.fleetMissions?.forEach(mission => {
      if (updateMissionTargetPlanetId(mission, idMap)) {
        mutated = true
      }
    })
  })

  return mutated
}

/**
 * 修复玩家星球的重复ID，并同步更新可被可靠识别的旧引用。
 * 缺少位置或名称上下文、无法安全判定归属的旧引用会保留原ID，
 * 继续指向保留下来的首个星球，避免把数据误指到错误目标。
 */
const fixDuplicatePlanetIds = (data: MigratableGameData): boolean => {
  const player = data.player
  if (!player || !Array.isArray(player.planets) || player.planets.length === 0) {
    return false
  }

  const idMap = buildDuplicatePlanetIdMap(player)
  if (idMap.size === 0) {
    return false
  }

  // buildDuplicatePlanetIdMap 已经在上一步直接修复了重复星球 ID，
  // 只要 idMap 非空，就说明当前迁移已经发生了实际修改。
  let mutated = true

  if (fixPlayerPlanetsAndQueues(player, idMap)) {
    mutated = true
  }

  if (fixPlayerReferences(player, data, idMap)) {
    mutated = true
  }

  if (data.npcs && fixNpcReferences(data.npcs, idMap)) {
    mutated = true
  }

  return mutated
}

/**
 * 执行数据迁移
 * 将旧版本的 universePlanets 和 debrisFields 从 gameStore 迁移到 universeStore
 */
export const migrateGameData = (): void => {
  try {
    const storageKey = pkg.name
    const universeStorageKey = `${pkg.name}-universe`

    // 读取旧的加密存档
    const oldEncryptedData = localStorage.getItem(storageKey)
    if (!oldEncryptedData) return

    // 尝试解密（如果是加密格式）
    let oldData: MigratableGameData
    try {
      oldData = decryptData(oldEncryptedData) as MigratableGameData
    } catch {
      // 解密失败，可能是新格式（未加密），直接解析
      try {
        oldData = JSON.parse(oldEncryptedData) as MigratableGameData
      } catch {
        return // 无法解析，放弃迁移
      }
    }

    // 标记是否有数据需要保存
    let needsSave = false

    // 修复NPC数据（确保所有必需字段都存在）
    if (oldData.npcs && Array.isArray(oldData.npcs)) {
      const now = Date.now()
      const playerId = oldData.player?.id

      oldData.npcs.forEach((npc: NPC) => {
        // 确保NPC有必需的时间字段，并设置随机冷却避免同时行动
        if (npc.lastSpyTime === undefined || npc.lastSpyTime === 0) {
          // 0-4分钟的随机延迟
          const randomSpyOffset = Math.random() * 240 * 1000
          npc.lastSpyTime = now - randomSpyOffset
          needsSave = true
        }
        if (npc.lastAttackTime === undefined || npc.lastAttackTime === 0) {
          // 0-8分钟的随机延迟
          const randomAttackOffset = Math.random() * 480 * 1000
          npc.lastAttackTime = now - randomAttackOffset
          needsSave = true
        }
        // 确保NPC有必需的数组字段
        if (!npc.fleetMissions) {
          npc.fleetMissions = []
          needsSave = true
        }
        if (!npc.playerSpyReports) {
          npc.playerSpyReports = {}
          needsSave = true
        }
        if (!npc.relations) {
          npc.relations = {}
          needsSave = true
        }
        if (!npc.allies) {
          npc.allies = []
          needsSave = true
        }
        if (!npc.enemies) {
          npc.enemies = []
          needsSave = true
        }

        // 如果NPC与玩家没有建立关系，自动建立中立关系
        if (playerId && !npc.relations[playerId]) {
          npc.relations[playerId] = {
            fromId: npc.id,
            toId: playerId,
            reputation: 0,
            status: 'neutral' as const,
            lastUpdated: now,
            history: []
          }
          needsSave = true
        }
      })
    }

    // [emperor-officer] 为旧存档补齐帝王槽位
    // migrateGameData() 在 Pinia store 初始化之前执行，直接读写 localStorage 中的加密存档。
    // 不补齐的话 OfficersView / GMView 遍历 Object.values(OfficerType) 会取到 undefined.active 而崩溃。
    if (oldData.player) {
      const p = oldData.player as unknown as { officers?: Record<string, unknown> }
      const hadSlots = !!p.officers
      const slots: Record<string, unknown> = p.officers || (p.officers = {})
      if (!hadSlots) needsSave = true
      if (!slots['sovereign']) {
        slots['sovereign'] = { type: 'sovereign', active: false }
        needsSave = true
      }
    }

    // 初始化玩家积分（如果不存在）
    if (oldData.player && oldData.player.points === undefined) {
      // 积分会在游戏启动时通过 initGame 计算，这里设置为0
      oldData.player.points = 0
      needsSave = true
    }

    // 修复重复的星球ID
    if (fixDuplicatePlanetIds(oldData)) {
      needsSave = true
    }

    // 迁移温度数据：为没有温度的星球生成温度
    // 玩家星球
    if (oldData.player?.planets && Array.isArray(oldData.player.planets)) {
      oldData.player.planets.forEach((planet: Planet) => {
        // 月球不需要温度
        if (!planet.isMoon && !planet.temperature) {
          planet.temperature = generatePlanetTemperature(planet.position.position)
          needsSave = true
        }
        // 迁移矿脉数据：确保所有矿脉都有 position 字段
        if (planet.oreDeposits && !planet.isMoon) {
          const deposits = planet.oreDeposits as any
          // 情况1：旧格式有 initialMetal，需要删除并添加 position
          if (deposits.initialMetal !== undefined) {
            delete deposits.initialMetal
            delete deposits.initialCrystal
            delete deposits.initialDeuterium
            needsSave = true
          }
          // 情况2：没有 position 字段，需要添加
          if (!deposits.position) {
            deposits.position = { ...planet.position }
            needsSave = true
          }
        }
      })
    }

    // NPC星球
    if (oldData.npcs && Array.isArray(oldData.npcs)) {
      oldData.npcs.forEach((npc: NPC) => {
        if (npc.planets && Array.isArray(npc.planets)) {
          npc.planets.forEach((planet: Planet) => {
            // 月球不需要温度
            if (!planet.isMoon && !planet.temperature) {
              planet.temperature = generatePlanetTemperature(planet.position.position)
              needsSave = true
            }
            // 迁移矿脉数据：确保所有矿脉都有 position 字段
            if (planet.oreDeposits && !planet.isMoon) {
              const deposits = planet.oreDeposits as any
              // 情况1：旧格式有 initialMetal，需要删除
              if (deposits.initialMetal !== undefined) {
                delete deposits.initialMetal
                delete deposits.initialCrystal
                delete deposits.initialDeuterium
                needsSave = true
              }
              // 情况2：没有 position 字段，需要添加
              if (!deposits.position) {
                deposits.position = { ...planet.position }
                needsSave = true
              }
            }
          })
        }
      })
    }

    // 迁移 player.diplomaticRelations 到 npc.relations
    // 旧版本使用 player.diplomaticRelations[npcId] 存储玩家对NPC的关系
    // 新版本统一使用 npc.relations[playerId] 存储NPC对玩家的关系
    if (oldData.player?.diplomaticRelations && oldData.npcs && Array.isArray(oldData.npcs)) {
      const playerId = oldData.player.id
      const npcs = oldData.npcs
      const playerRelations = oldData.player.diplomaticRelations as Record<string, any>

      Object.entries(playerRelations).forEach(([npcId, relation]) => {
        const npc = npcs.find((n: NPC) => n.id === npcId)
        if (npc) {
          if (!npc.relations) {
            npc.relations = {}
          }
          // 如果NPC对玩家的关系不存在，使用玩家对NPC的关系数据
          if (!npc.relations[playerId]) {
            npc.relations[playerId] = {
              ...relation,
              fromId: npcId,
              toId: playerId
            }
            needsSave = true
          } else {
            // 如果两边都有数据，使用声望值更极端的那个（偏离0更远的）
            const existingReputation = npc.relations[playerId].reputation || 0
            const playerReputation = relation.reputation || 0
            if (Math.abs(playerReputation) > Math.abs(existingReputation)) {
              npc.relations[playerId].reputation = playerReputation
              npc.relations[playerId].status = relation.status
              needsSave = true
            }
          }
        }
      })

      // 删除旧的 diplomaticRelations 字段
      delete oldData.player.diplomaticRelations
      needsSave = true
    }

    // 检查是否需要迁移地图数据
    const hasOldMapData = oldData.universePlanets || oldData.debrisFields

    if (hasOldMapData) {
      // 准备 universeStore 数据
      const universeData: {
        planets: Record<string, Planet>
        debrisFields: Record<string, DebrisField>
      } = {
        planets: {},
        debrisFields: {}
      }

      // 迁移星球数据（排除玩家星球）
      if (oldData.universePlanets) {
        const oldPlanets = oldData.universePlanets as Record<string, Planet>
        const playerPlanets = oldData.player?.planets || []
        const playerPlanetIds = new Set(playerPlanets.map((p: Planet) => p.id))
        Object.entries(oldPlanets).forEach(([key, planet]) => {
          // 只迁移非玩家星球
          if (!playerPlanetIds.has(planet.id)) {
            // 为没有温度的星球生成温度
            if (!planet.isMoon && !planet.temperature) {
              planet.temperature = generatePlanetTemperature(planet.position.position)
            }
            universeData.planets[key] = planet
          }
        })
        delete oldData.universePlanets
        needsSave = true
      }

      // 迁移残骸场数据
      if (oldData.debrisFields) {
        universeData.debrisFields = oldData.debrisFields
        delete oldData.debrisFields
        needsSave = true
      }

      // 保存universeStore数据
      localStorage.setItem(universeStorageKey, encryptData(universeData))
    }

    // 检查并更新已存在的 universeStore 数据中的星球温度
    const existingUniverseData = localStorage.getItem(universeStorageKey)
    if (existingUniverseData) {
      try {
        let universeData: { planets: Record<string, Planet>; debrisFields: Record<string, DebrisField> }
        try {
          universeData = decryptData(existingUniverseData)
        } catch {
          universeData = JSON.parse(existingUniverseData)
        }

        let universePlanetMigrated = false
        if (universeData.planets) {
          Object.values(universeData.planets).forEach((planet: Planet) => {
            if (!planet.isMoon && !planet.temperature) {
              planet.temperature = generatePlanetTemperature(planet.position.position)
              universePlanetMigrated = true
            }
          })
        }

        if (universePlanetMigrated) {
          localStorage.setItem(universeStorageKey, encryptData(universeData))
        }
      } catch (error) {
        console.error('[Migration] Failed to migrate universe planets temperature:', error)
      }
    }

    // 如果有任何数据被修改，保存gameStore数据
    if (needsSave) {
      localStorage.setItem(storageKey, encryptData(oldData))
    }
  } catch (error) {
    console.error('[Migration] Failed to migrate game data:', error)
  }
}
