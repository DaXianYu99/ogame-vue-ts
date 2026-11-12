<template>
  <!-- 无权限时显示404 -->
  <div v-if="!gameStore.player.isGMEnabled" class="container mx-auto p-4 sm:p-6 flex items-center justify-center min-h-[60vh]">
    <Empty class="border-0">
      <EmptyMedia>
        <div class="text-8xl sm:text-9xl font-bold text-muted-foreground/20">404</div>
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{{ t('notFound.title') }}</EmptyTitle>
        <EmptyDescription>{{ t('notFound.description') }}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button @click="goHome" size="lg">
          <Home class="mr-2 h-4 w-4" />
          {{ t('notFound.goHome') }}
        </Button>
      </EmptyContent>
    </Empty>
  </div>

  <!-- 有权限时显示GM页面 -->
  <div v-else class="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl sm:text-3xl font-bold">{{ t('gmView.title') }}</h1>
      <Badge variant="destructive">{{ t('gmView.adminOnly') }}</Badge>
    </div>

    <!-- 星球选择 -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t('gmView.selectPlanet') }}</CardTitle>
      </CardHeader>
      <CardContent>
        <Select v-model="selectedPlanetId">
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t('gmView.choosePlanet')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="planet in gameStore.player.planets" :key="planet.id" :value="planet.id">
              {{ planet.name }} ({{ planet.position.galaxy }}:{{ planet.position.system }}:{{ planet.position.position }})
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>

    <!-- 标签切换 -->
    <Tabs v-if="selectedPlanet" default-value="resources" class="w-full">
      <TabsList class="grid w-full" :style="{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }">
        <TabsTrigger v-for="tab in tabs" :key="tab.value" :value="tab.value">
          {{ t(tab.label) }}
        </TabsTrigger>
      </TabsList>

      <!-- 资源 -->
      <TabsContent value="resources" class="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{{ t('gmView.modifyResources') }}</CardTitle>
            <CardDescription>{{ t('gmView.resourcesDesc') }}</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 一键拉满按钮 -->
            <Button @click="maxAllResources" variant="outline" class="w-full">
              {{ t('gmView.maxAllResources') }}
            </Button>

            <div v-for="resource in resourceTypes" :key="resource" class="space-y-2">
              <Label>{{ t(`resources.${resource}`) }}</Label>
              <div class="flex gap-2">
                <Input v-model.number="selectedPlanet.resources[resource]" type="number" min="0" class="flex-1" />
                <Button @click="setResourceAmount(resource, 1000000)" variant="outline" size="sm">+1M</Button>
                <Button @click="setResourceAmount(resource, 10000000)" variant="outline" size="sm">+10M</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- 建筑/科技/舰船/防御/军官 - 统一配置渲染 -->
      <TabsContent v-for="section in gmSections" :key="section.tabValue" :value="section.tabValue" class="space-y-4">
        <!-- 预设操作区 -->
        <Card v-if="isPresettableSection(section)" class="mb-4">
          <CardHeader class="pb-3">
            <CardTitle class="text-lg">{{ t('gmView.presets') || 'Presets' }}</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="flex flex-col sm:flex-row gap-4 items-end sm:items-center">
              <div class="flex gap-2 w-full sm:w-auto">
                <Select v-model="selectedPresets[section.tabValue]">
                  <SelectTrigger class="w-[200px]">
                    <SelectValue :placeholder="t('gmView.choosePreset') || 'Choose Preset'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">{{ t('gmView.defaultPreset') || 'Default Preset' }}</SelectItem>
                    <SelectItem v-for="p in customPresets[section.tabValue]" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button @click="handleApplyPreset(section)">{{ t('gmView.applyPreset') || 'Apply' }}</Button>
                <Button 
                  v-if="selectedPresets[section.tabValue] !== 'default'"
                  @click="handleDeletePreset(section)"
                  variant="destructive"
                  size="icon"
                  :title="t('gmView.deletePreset') || 'Delete Preset'"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
              <div class="flex gap-2 w-full sm:w-auto ml-auto">
                <Input v-model="presetNames[section.tabValue]" :placeholder="t('gmView.presetName') || 'Preset Name'" class="w-[150px]" />
                <Button @click="handleSavePreset(section)" variant="outline">{{ t('gmView.savePreset') || 'Save' }}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{{ t(section.titleKey) }}</CardTitle>
            <CardDescription>{{ t(section.descKey) }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div v-for="item in section.items" :key="item" class="space-y-2">
                <Label>{{ section.getItemName(item) }}</Label>
                <div class="flex gap-2">
                  <Input
                    :model-value="section.getValue(item)"
                    @update:model-value="section.setValue(item, Number($event) || 0)"
                    type="number"
                    :min="0"
                    :max="section.max"
                    :placeholder="section.placeholder"
                    class="flex-1"
                  />
                  <Button
                    v-for="btn in section.buttons"
                    :key="btn.label"
                    @click="section.onButtonClick(item, btn.value)"
                    variant="outline"
                    size="sm"
                  >
                    {{ btn.label }}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <!-- NPC测试 -->
    <Card class="border-primary">
      <CardHeader>
        <CardTitle>{{ t('gmView.npcTesting') || 'NPC Testing' }}</CardTitle>
        <CardDescription>{{ t('gmView.npcTestingDesc') || 'Test NPC spy and attack behavior' }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label>{{ t('gmView.selectNPC') || 'Select NPC' }}</Label>
            <Select v-model="selectedNPCId">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('gmView.chooseNPC') || 'Choose NPC'" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="npc in npcStore.npcs" :key="npc.id" :value="npc.id">
                  {{ npc.name }} ({{ t(`diplomacy.diagnostic.difficultyLevels.${npc.difficulty}`) }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>{{ t('gmView.targetPlanet') || 'Target Planet' }}</Label>
            <Select v-model="targetPlanetIndex">
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('gmView.chooseTarget') || 'Choose Target Planet'" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="(planet, index) in gameStore.player.planets" :key="planet.id" :value="index.toString()">
                  {{ planet.name }} ({{ planet.position.galaxy }}:{{ planet.position.system }}:{{ planet.position.position }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <Button @click="testNPCSpy" variant="outline" class="w-full" :disabled="!selectedNPC">
            {{ t('gmView.testSpy') || 'Test Spy' }}
          </Button>
          <Button @click="testNPCAttack" variant="outline" class="w-full" :disabled="!selectedNPC">
            {{ t('gmView.testAttack') || 'Test Attack' }}
          </Button>
        </div>

        <Button @click="testNPCSpyAndAttack" variant="default" class="w-full" :disabled="!selectedNPC">
          {{ t('gmView.testSpyAndAttack') || 'Test Spy & Attack' }}
        </Button>

        <Button @click="initializeNPCFleet" variant="secondary" class="w-full" :disabled="!selectedNPC">
          {{ t('gmView.initializeFleet') || 'Initialize NPC Fleet' }}
        </Button>

        <Button @click="accelerateAllMissions" variant="secondary" class="w-full" :disabled="!selectedNPC">
          {{ t('gmView.accelerateMissions') || 'Accelerate All Missions (5s)' }}
        </Button>

        <!-- [universal-enemy] 宇宙公敌开关（唯一新增 UI，无 toast / 外交报告 / 成就） -->
        <div class="flex items-center justify-between gap-3 pt-2 border-t">
          <Label for="gm-universal-enemy">{{ t('gmView.universalEnemy') || '宇宙公敌' }}</Label>
          <Switch id="gm-universal-enemy" :checked="universalEnemyEnabled" @update:checked="handleUniversalEnemyToggle" />
        </div>
      </CardContent>
    </Card>

    <!-- 队列管理 -->
    <Card class="border-primary">
      <CardHeader>
        <CardTitle>{{ t('gmView.completeAllQueues') }}</CardTitle>
        <CardDescription>{{ t('gmView.completeAllQueuesDesc') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button @click="completeAllQueues" variant="default" class="w-full">{{ t('gmView.completeQueues') }}</Button>
      </CardContent>
    </Card>

    <!-- 危险操作 -->
    <Card class="border-destructive">
      <CardHeader>
        <CardTitle class="text-destructive">{{ t('gmView.dangerZone') }}</CardTitle>
        <CardDescription>{{ t('gmView.dangerZoneDesc') }}</CardDescription>
      </CardHeader>
      <CardContent class="space-y-2">
        <Button @click="showResetConfirmDialog" variant="destructive" class="w-full">{{ t('gmView.resetGame') }}</Button>
      </CardContent>
    </Card>

    <!-- Reset Game 确认对话框 -->
    <AlertDialog :open="resetDialogOpen" @update:open="handleResetDialogClose">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('gmView.resetGame') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('gmView.resetGameConfirm') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="handleResetCancel">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmResetGame">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 预设覆盖确认对话框 -->
    <AlertDialog :open="presetOverwriteDialogOpen" @update:open="presetOverwriteDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('gmView.confirmOverwriteTitle') || 'Preset Already Exists' }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('gmView.confirmOverwriteMessage', { name: pendingPresetToOverwrite?.name || '' }) || `Preset with name "${pendingPresetToOverwrite?.name}" already exists. Overwrite?` }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="presetOverwriteDialogOpen = false">{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="handleConfirmOverwrite">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- AlertDialog 提示对话框 -->
    <AlertDialog :open="alertDialogOpen" @update:open="alertDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ alertDialogTitle }}</AlertDialogTitle>
          <AlertDialogDescription v-if="alertDialogMessage" class="whitespace-pre-line">
            {{ alertDialogMessage }}
          </AlertDialogDescription>
          <AlertDialogDescription v-else class="sr-only">
            {{ alertDialogTitle }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="handleAlertConfirm">{{ t('common.confirm') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { toast } from 'vue-sonner'
  import { useGameStore } from '@/stores/gameStore'
  import { useNPCStore } from '@/stores/npcStore'
  import { useUniverseStore } from '@/stores/universeStore'
  import { useI18n } from '@/composables/useI18n'
  import { useGameConfig } from '@/composables/useGameConfig'
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { Badge } from '@/components/ui/badge'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { Switch } from '@/components/ui/switch'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
  import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
  } from '@/components/ui/alert-dialog'
  import { BuildingType, TechnologyType, ShipType, DefenseType, OfficerType, RelationStatus } from '@/types/game'
  import * as npcBehaviorLogic from '@/logic/npcBehaviorLogic'
  import * as npcGrowthLogic from '@/logic/npcGrowthLogic'
  import { DIPLOMATIC_CONFIG } from '@/config/gameConfig'
  import * as publicLogic from '@/logic/publicLogic'
  import { calculateMaxFleetStorage } from '@/logic/fleetStorageLogic'
  import { calculateMissileSiloCapacity } from '@/logic/missileLogic'
  import { generateId } from '@/utils/id'
  import { Home, Trash2 } from 'lucide-vue-next'

  // --- 预设系统 ---
  interface GMPreset {
    id: string
    name: string
    values: Record<string, number>
  }

  type GMSectionTabValue = 'buildings' | 'research' | 'ships' | 'defense' | 'officers'
  type GMPresetSectionKey = Exclude<GMSectionTabValue, 'officers'>

  type GMSection = {
    tabValue: GMSectionTabValue
    titleKey: string
    descKey: string
    items: string[]
    max?: number
    placeholder?: string
    buttons: { label: string; value: number }[]
    getItemName: (item: string) => string
    getValue: (item: string) => number
    setValue: (item: string, val: number) => void
    onButtonClick: (item: string, val: number) => void
  }

  type GMPresetSection = GMSection & {
    tabValue: GMPresetSectionKey
  }

  type GMPresetNameMap = Record<GMPresetSectionKey, string>
  type GMSelectedPresetMap = Record<GMPresetSectionKey, string>
  type GMCustomPresetMap = Record<GMPresetSectionKey, GMPreset[]>

  interface PendingPresetOverwrite {
    section: GMPresetSection
    name: string
    values: Record<string, number>
    existingIndex: number
  }

  // 校验预设结构，避免历史脏数据污染当前视图
  const isGMPreset = (value: unknown): value is GMPreset => {
    if (typeof value !== 'object' || value === null) {
      return false
    }

    const preset = value as Partial<GMPreset>
    return typeof preset.id === 'string' && typeof preset.name === 'string' && typeof preset.values === 'object' && preset.values !== null
  }

  // 只有建筑/科技/舰船/防御页支持预设
  const isPresettableSection = (section: GMSection): section is GMPresetSection => {
    return section.tabValue !== 'officers'
  }

  const presetOverwriteDialogOpen = ref(false)
  const pendingPresetToOverwrite = ref<PendingPresetOverwrite | null>(null)

  const getPresets = (type: GMPresetSectionKey): GMPreset[] => {
    const key = `gm_presets_${type}`
    const data = localStorage.getItem(key)
    if (!data) {
      return []
    }

    try {
      // 兼容旧版本或手动修改导致的损坏数据，避免页面因解析失败崩溃
      const parsed = JSON.parse(data)
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(key)
        return []
      }

      const presets = parsed.filter(isGMPreset)
      // 过滤掉结构不完整的预设，并顺手回写清理后的结果
      if (presets.length !== parsed.length) {
        localStorage.setItem(key, JSON.stringify(presets))
      }

      return presets
    } catch {
      localStorage.removeItem(key)
      return []
    }
  }

  const savePresets = (type: GMPresetSectionKey, presets: GMPreset[]) => {
    localStorage.setItem(`gm_presets_${type}`, JSON.stringify(presets))
  }

  const presetNames = ref<GMPresetNameMap>({
    buildings: '',
    research: '',
    ships: '',
    defense: ''
  })

  const selectedPresets = ref<GMSelectedPresetMap>({
    buildings: 'default',
    research: 'default',
    ships: 'default',
    defense: 'default'
  })

  const customPresets = ref<GMCustomPresetMap>({
    buildings: getPresets('buildings'),
    research: getPresets('research'),
    ships: getPresets('ships'),
    defense: getPresets('defense')
  })

  const handleSavePreset = (section: GMSection) => {
    if (!isPresettableSection(section)) return

    const name = presetNames.value[section.tabValue]?.trim()
    if (!name) {
      toast.error(t('gmView.presetNameRequired') || '请输入预设名称')
      return
    }
    
    const values: Record<string, number> = {}
    section.items.forEach((item: string) => {
      values[item] = section.getValue(item)
    })

    // 检查是否存在同名预设
    const presets = customPresets.value[section.tabValue]
    const existingIndex = presets.findIndex(p => p.name === name)
    
    if (existingIndex !== -1) {
      pendingPresetToOverwrite.value = {
        section,
        name,
        values,
        existingIndex
      }
      presetOverwriteDialogOpen.value = true
      return
    }
    
    const newPreset: GMPreset = {
      id: generateId('gm_preset'),
      name,
      values
    }
    
    presets.push(newPreset)
    savePresets(section.tabValue, presets)
    presetNames.value[section.tabValue] = ''
    selectedPresets.value[section.tabValue] = newPreset.id
    toast.success(t('gmView.presetSaved') || '预设保存成功')
  }

  const handleConfirmOverwrite = () => {
    if (!pendingPresetToOverwrite.value) return
    
    const { section, values, existingIndex } = pendingPresetToOverwrite.value
    
    const presets = customPresets.value[section.tabValue]

    if (presets[existingIndex]) {
      // 更新现有预设的值，保持ID不变
      presets[existingIndex].values = values

      savePresets(section.tabValue, presets)

      presetNames.value[section.tabValue] = ''
      selectedPresets.value[section.tabValue] = presets[existingIndex].id

      toast.success(t('gmView.presetSaved') || '预设保存成功')
    }
    
    presetOverwriteDialogOpen.value = false
    pendingPresetToOverwrite.value = null
  }

  const handleDeletePreset = (section: GMSection) => {
    if (!isPresettableSection(section)) return

    const presetId = selectedPresets.value[section.tabValue]
    if (!presetId || presetId === 'default') {
      toast.error(t('gmView.cannotDeleteDefault') || '无法删除默认预设')
      return
    }
    
    const presets = customPresets.value[section.tabValue]
    const index = presets.findIndex(p => p.id === presetId)
    
    if (index !== -1) {
      presets.splice(index, 1)
      savePresets(section.tabValue, presets)
      selectedPresets.value[section.tabValue] = 'default'
      toast.success(t('gmView.presetDeleted') || '预设已删除')
    }
  }

  const handleApplyPreset = (section: GMSection) => {
    if (!isPresettableSection(section)) return

    const presetId = selectedPresets.value[section.tabValue]
    if (!presetId) return

    if (presetId === 'default') {
      if (section.tabValue === 'buildings') {
        const explicitMax: Record<string, number> = {
          [BuildingType.NaniteFactory]: 10,
          [BuildingType.MissileSilo]: 10,
          [BuildingType.JumpGate]: 5,
          [BuildingType.PlanetDestroyerFactory]: 3,
          [BuildingType.GeoResearchStation]: 10,
          [BuildingType.DeepDrillingFacility]: 10,
          [BuildingType.University]: 10
        }
        section.items.forEach((item: string) => {
          section.setValue(item, explicitMax[item] || 50)
        })
      } else if (section.tabValue === 'research') {
        const explicitMax: Record<string, number> = {
          [TechnologyType.ComputerTechnology]: 10,
          [TechnologyType.GravitonTechnology]: 1,
          [TechnologyType.PlanetDestructionTech]: 10,
          [TechnologyType.MiningTechnology]: 15,
          [TechnologyType.IntergalacticResearchNetwork]: 10,
          [TechnologyType.MineralResearch]: 20,
          [TechnologyType.CrystalResearch]: 20,
          [TechnologyType.FuelResearch]: 20
        }
        section.items.forEach((item: string) => {
          section.setValue(item, explicitMax[item] || 100)
        })
      } else if (section.tabValue === 'ships') {
        if (!selectedPlanet.value) return
        // 某些过滤场景下舰船列表可能为空，避免平均分配时除以 0
        if (!section.items.length) return
        
        // 重新计算最大舰队仓储，确保数据是最新的
        const maxStorage = calculateMaxFleetStorage(selectedPlanet.value, gameStore.player.technologies)

        // 将总容量平均分配给每种舰船
        const storagePerShip = maxStorage / section.items.length

        section.items.forEach(item => {
          const usage = SHIPS.value[item as ShipType]?.storageUsage || 1
          // 如果 usage 为 0 (如某些特殊单位)，则给予一个默认数量，或者跳过
          if (usage <= 0) {
             section.setValue(item, 100) // 防止除以0，给予固定值
          } else {
             section.setValue(item, Math.floor(storagePerShip / usage))
          }
        })
      } else if (section.tabValue === 'defense') {
        if (!selectedPlanet.value) return
        const missileCapacity = calculateMissileSiloCapacity(selectedPlanet.value.buildings)
        const defaultMissileCount = Math.floor(missileCapacity / 2)

        section.items.forEach((item: string) => {
          // 两种导弹都占用1格空间，默认各分配一半容量
          if (item === DefenseType.AntiBallisticMissile || item === DefenseType.InterplanetaryMissile) {
            section.setValue(item, defaultMissileCount)
          } else {
            section.setValue(item, 10000)
          }
        })
      }
      toast.success(t('gmView.presetApplied') || '默认预设应用成功')
    } else {
      const customPreset = customPresets.value[section.tabValue].find((p: GMPreset) => p.id === presetId)
      if (customPreset) {
        Object.entries(customPreset.values).forEach(([k, v]) => {
          section.setValue(k, v as number)
        })
        toast.success(t('gmView.presetApplied') || '预设应用成功')
      }
    }
  }
  // --- 预设系统结束 ---

  const router = useRouter()
  const gameStore = useGameStore()
  const npcStore = useNPCStore()
  const universeStore = useUniverseStore()

  // ===== [universal-enemy] GM「宇宙公敌」开关（独立 localStorage，不写入存档字段）=====
  const UNIVERSAL_ENEMY_KEY = 'gm_universal_enemy'
  interface UniversalEnemyConfig {
    enabled: boolean
    ids: string[]
  }

  // 解析失败 / 结构不符 → 删除 key 并回默认（沿用 gm_presets_ 的容错写法）
  const readUniversalEnemyConfig = (): UniversalEnemyConfig => {
    try {
      const raw = localStorage.getItem(UNIVERSAL_ENEMY_KEY)
      if (!raw) return { enabled: false, ids: [] }
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') {
        localStorage.removeItem(UNIVERSAL_ENEMY_KEY)
        return { enabled: false, ids: [] }
      }
      const obj = parsed as { enabled?: unknown; ids?: unknown }
      if (typeof obj.enabled !== 'boolean' || !Array.isArray(obj.ids) || !obj.ids.every(id => typeof id === 'string')) {
        localStorage.removeItem(UNIVERSAL_ENEMY_KEY)
        return { enabled: false, ids: [] }
      }
      return { enabled: obj.enabled, ids: obj.ids as string[] }
    } catch {
      localStorage.removeItem(UNIVERSAL_ENEMY_KEY)
      return { enabled: false, ids: [] }
    }
  }

  const initialUniversalEnemy = readUniversalEnemyConfig()
  const universalEnemyEnabled = ref(initialUniversalEnemy.enabled)
  const universalEnemyIds = ref<string[]>(initialUniversalEnemy.ids)

  const persistUniversalEnemy = (config: UniversalEnemyConfig) => {
    localStorage.setItem(UNIVERSAL_ENEMY_KEY, JSON.stringify(config))
  }

  // 只写 relations[player.id]；不触碰 allies / enemies / 其他实体 id 的关系条目
  const applyUniversalEnemyRelations = (ids: string[], hostile: boolean) => {
    const now = Date.now()
    ids.forEach(id => {
      const npc = npcStore.npcs.find(n => n.id === id)
      if (!npc) return
      if (!npc.relations) npc.relations = {}
      npc.relations[gameStore.player.id] = {
        fromId: npc.id,
        toId: gameStore.player.id,
        reputation: hostile ? DIPLOMATIC_CONFIG.HOSTILE_THRESHOLD : 0,
        status: hostile ? RelationStatus.Hostile : RelationStatus.Neutral,
        lastUpdated: now
      }
    })
  }

  const handleUniversalEnemyToggle = (enabled: boolean) => {
    if (enabled) {
      // 按舰队战力降序取前 40（不足取实际数量）；随后冻结，不因排名漂移刷新
      const ids = npcStore.npcs
        .map(npc => ({ id: npc.id, power: npcGrowthLogic.calculateNPCPower(npc).totalFleetPower }))
        .sort((a, b) => b.power - a.power)
        .slice(0, 40)
        .map(item => item.id)
      universalEnemyEnabled.value = true
      universalEnemyIds.value = ids
      persistUniversalEnemy({ enabled: true, ids })
      applyUniversalEnemyRelations(ids, true)
    } else {
      // 关闭：按同一份名单恢复中立，一次性写入；随后名单失效
      applyUniversalEnemyRelations(universalEnemyIds.value, false)
      universalEnemyEnabled.value = false
      universalEnemyIds.value = []
      persistUniversalEnemy({ enabled: false, ids: [] })
    }
  }

  const { t } = useI18n()
  const { BUILDINGS, TECHNOLOGIES, SHIPS, DEFENSES, OFFICERS } = useGameConfig()

  // 更新玩家积分的辅助函数
  const updatePlayerPoints = () => {
    gameStore.player.points = publicLogic.calculatePlayerPoints(gameStore.player)
  }

  const goHome = () => {
    router.push('/')
  }

  // 默认选中当前正在游玩的星球
  const selectedPlanetId = ref<string>(gameStore.currentPlanetId || gameStore.player.planets[0]?.id || '')
  const officerDays = ref<Record<OfficerType, number>>({} as Record<OfficerType, number>)
  const selectedNPCId = ref<string>(npcStore.npcs[0]?.id || '')
  const targetPlanetIndex = ref<string>('0')

  // AlertDialog 状态
  const alertDialogOpen = ref(false)
  const alertDialogTitle = ref('')
  const alertDialogMessage = ref('')
  const alertDialogCallback = ref<(() => void) | null>(null)

  // Reset Dialog 状态
  const resetDialogOpen = ref(false)

  // 初始化军官天数显示
  Object.values(OfficerType).forEach(officer => {
    const officerData = gameStore.player.officers[officer]
    if (officerData && officerData.expiresAt) {
      const daysLeft = Math.ceil((officerData.expiresAt - Date.now()) / (1000 * 60 * 60 * 24))
      officerDays.value[officer] = Math.max(0, daysLeft)
    } else {
      officerDays.value[officer] = 0
    }
  })

  const selectedPlanet = computed(() => {
    return gameStore.player.planets.find(p => p.id === selectedPlanetId.value)
  })

  const selectedNPC = computed(() => {
    return npcStore.npcs.find(npc => npc.id === selectedNPCId.value)
  })

  const allPlanets = computed(() => {
    return [...gameStore.player.planets, ...Object.values(universeStore.planets)]
  })

  const resourceTypes = ['metal', 'crystal', 'deuterium', 'darkMatter'] as const

  // Tab配置
  const tabs = [
    { value: 'resources' as const, label: 'gmView.resources' },
    { value: 'buildings' as const, label: 'gmView.buildings' },
    { value: 'research' as const, label: 'gmView.research' },
    { value: 'ships' as const, label: 'gmView.ships' },
    { value: 'defense' as const, label: 'gmView.defense' },
    { value: 'officers' as const, label: 'gmView.officers' }
  ]

  const setResourceAmount = (resource: string, amount: number) => {
    if (selectedPlanet.value) {
      selectedPlanet.value.resources[resource as keyof typeof selectedPlanet.value.resources] += amount
    }
  }

  const gmSections = computed<GMSection[]>(() => [
    {
      tabValue: 'buildings',
      titleKey: 'gmView.modifyBuildings',
      descKey: 'gmView.buildingsDesc',
      items: Object.values(BuildingType),
      max: 100,
      placeholder: undefined,
      buttons: [
        { label: 'Lv 10', value: 10 },
        { label: 'Lv 30', value: 30 }
      ],
      getItemName: item => BUILDINGS.value[item as BuildingType].name,
      getValue: item => selectedPlanet.value?.buildings[item as BuildingType] || 0,
      setValue: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.buildings[item as BuildingType] = val
          updatePlayerPoints()
        }
      },
      onButtonClick: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.buildings[item as BuildingType] = val
          updatePlayerPoints()
        }
      }
    },
    {
      tabValue: 'research',
      titleKey: 'gmView.modifyResearch',
      descKey: 'gmView.researchDesc',
      items: Object.values(TechnologyType),
      max: 50,
      placeholder: undefined,
      buttons: [
        { label: 'Lv 10', value: 10 },
        { label: 'Lv 20', value: 20 }
      ],
      getItemName: item => TECHNOLOGIES.value[item as TechnologyType].name,
      getValue: item => gameStore.player.technologies[item as TechnologyType] || 0,
      setValue: (item, val) => {
        gameStore.player.technologies[item as TechnologyType] = val
        updatePlayerPoints()
      },
      onButtonClick: (item, val) => {
        gameStore.player.technologies[item as TechnologyType] = val
        updatePlayerPoints()
      }
    },
    {
      tabValue: 'ships',
      titleKey: 'gmView.modifyShips',
      descKey: 'gmView.shipsDesc',
      items: Object.values(ShipType),
      max: undefined,
      placeholder: undefined,
      buttons: [
        { label: '+100', value: 100 },
        { label: '+1K', value: 1000 }
      ],
      getItemName: item => SHIPS.value[item as ShipType].name,
      getValue: item => selectedPlanet.value?.fleet[item as ShipType] || 0,
      setValue: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.fleet[item as ShipType] = val
          updatePlayerPoints()
        }
      },
      onButtonClick: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.fleet[item as ShipType] = (selectedPlanet.value.fleet[item as ShipType] || 0) + val
          updatePlayerPoints()
        }
      }
    },
    {
      tabValue: 'defense',
      titleKey: 'gmView.modifyDefense',
      descKey: 'gmView.defenseDesc',
      items: Object.values(DefenseType),
      max: undefined,
      placeholder: undefined,
      buttons: [
        { label: '+100', value: 100 },
        { label: '+1K', value: 1000 }
      ],
      getItemName: item => DEFENSES.value[item as DefenseType].name,
      getValue: item => selectedPlanet.value?.defense[item as DefenseType] || 0,
      setValue: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.defense[item as DefenseType] = val
          updatePlayerPoints()
        }
      },
      onButtonClick: (item, val) => {
        if (selectedPlanet.value) {
          selectedPlanet.value.defense[item as DefenseType] = (selectedPlanet.value.defense[item as DefenseType] || 0) + val
          updatePlayerPoints()
        }
      }
    },
    {
      tabValue: 'officers',
      titleKey: 'gmView.modifyOfficers',
      descKey: 'gmView.officersDesc',
      items: Object.values(OfficerType),
      max: undefined,
      placeholder: t('gmView.days'),
      buttons: [
        { label: `7${t('gmView.days')}`, value: 7 },
        { label: `30${t('gmView.days')}`, value: 30 },
        { label: `365${t('gmView.days')}`, value: 365 }
      ],
      getItemName: item => OFFICERS.value[item as OfficerType].name,
      getValue: item => officerDays.value[item as OfficerType] || 0,
      setValue: (item, val) => {
        officerDays.value[item as OfficerType] = val
      },
      onButtonClick: (item, days) => {
        const officerType = item as OfficerType
        officerDays.value[officerType] = days
        const now = Date.now()
        const expiresAt = now + days * 24 * 60 * 60 * 1000
        if (!gameStore.player.officers[officerType]) {
          gameStore.player.officers[officerType] = {
            type: officerType,
            active: true,
            hiredAt: now,
            expiresAt: expiresAt
          }
        } else {
          gameStore.player.officers[officerType].expiresAt = expiresAt
          gameStore.player.officers[officerType].active = true
          if (!gameStore.player.officers[officerType].hiredAt) {
            gameStore.player.officers[officerType].hiredAt = now
          }
        }
      }
    }
  ])

  // 显示重置游戏确认对话框
  const showResetConfirmDialog = () => {
    // 暂停游戏
    gameStore.isPaused = true
    resetDialogOpen.value = true
  }

  // 处理重置对话框关闭
  const handleResetDialogClose = (open: boolean) => {
    if (!open) {
      // 如果对话框关闭，恢复游戏
      gameStore.isPaused = false
    }
    resetDialogOpen.value = open
  }

  // 取消重置
  const handleResetCancel = () => {
    resetDialogOpen.value = false
    gameStore.isPaused = false
  }

  // 确认重置游戏
  const confirmResetGame = () => {
    gameStore.isPaused = true
    resetDialogOpen.value = false
    try {
      gameStore.player.isGMEnabled = false
      localStorage.clear()
      location.reload()
    } catch (error) {
      console.error('Failed to reset game:', error)
      window.location.reload()
    }
  }

  // 显示AlertDialog的辅助函数
  const showAlert = (title: string, message: string, callback?: () => void) => {
    alertDialogTitle.value = title
    alertDialogMessage.value = message
    alertDialogCallback.value = callback || null
    alertDialogOpen.value = true
  }

  // AlertDialog确认处理
  const handleAlertConfirm = () => {
    alertDialogOpen.value = false
    if (alertDialogCallback.value) {
      alertDialogCallback.value()
      alertDialogCallback.value = null
    }
  }

  // NPC测试函数
  const testNPCSpy = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const mission = npcBehaviorLogic.forceNPCSpyPlayer(
      selectedNPC.value,
      gameStore.player,
      allPlanets.value,
      parseInt(targetPlanetIndex.value)
    )

    if (mission) {
      showAlert(t('gmView.npcWillSpyIn5s', { npcName: selectedNPC.value.name }), t('gmView.testSpyMessage'), () => {
        // 加速任务到5秒后到达（在确认后执行，这样时间更准确）
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, mission.id, 5, gameStore.player)
      })
    } else {
      showAlert(t('gmView.npcNoProbes') || 'NPC does not have spy probes', '')
    }
  }

  const testNPCAttack = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const mission = npcBehaviorLogic.forceNPCAttackPlayer(
      selectedNPC.value,
      gameStore.player,
      allPlanets.value,
      parseInt(targetPlanetIndex.value)
    )

    if (mission) {
      showAlert(t('gmView.npcWillAttackIn5s', { npcName: selectedNPC.value.name }), t('gmView.testAttackMessage'), () => {
        // 加速任务到5秒后到达（在确认后执行，这样时间更准确）
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, mission.id, 5, gameStore.player)
      })
    } else {
      showAlert(t('gmView.npcNoSpyReport') || 'NPC needs to spy first', '')
    }
  }

  const testNPCSpyAndAttack = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const { spyMission, attackMission } = npcBehaviorLogic.forceNPCSpyAndAttack(
      selectedNPC.value,
      gameStore.player,
      allPlanets.value,
      parseInt(targetPlanetIndex.value)
    )

    if (spyMission && attackMission) {
      showAlert(t('gmView.npcWillSpyAndAttack', { npcName: selectedNPC.value.name }), t('gmView.testSpyAndAttackMessage'), () => {
        // 加速任务：侦查5秒后到达，攻击10秒后到达（在确认后执行，这样时间更准确）
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, spyMission.id, 5, gameStore.player)
        npcBehaviorLogic.accelerateNPCMission(selectedNPC.value!, attackMission.id, 10, gameStore.player)
      })
    } else {
      showAlert(t('gmView.npcMissionFailed') || 'Failed to create missions', '')
    }
  }

  const accelerateAllMissions = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    const count = npcBehaviorLogic.accelerateAllNPCMissions(selectedNPC.value, 5, gameStore.player)
    showAlert(t('gmView.acceleratedMissions', { count }), '')
  }

  // 初始化NPC舰队
  const initializeNPCFleet = () => {
    if (!selectedNPC.value) {
      showAlert(t('gmView.selectNPCFirst') || 'Please select an NPC first', '')
      return
    }

    // 给NPC的第一个星球添加基础舰队
    const npcPlanet = selectedNPC.value.planets[0]
    if (!npcPlanet) {
      showAlert(t('gmView.npcNoPlanets'), '')
      return
    }

    // 添加间谍探测器
    npcPlanet.fleet[ShipType.EspionageProbe] = (npcPlanet.fleet[ShipType.EspionageProbe] || 0) + 100

    // 添加战斗舰船
    npcPlanet.fleet[ShipType.LightFighter] = (npcPlanet.fleet[ShipType.LightFighter] || 0) + 500
    npcPlanet.fleet[ShipType.HeavyFighter] = (npcPlanet.fleet[ShipType.HeavyFighter] || 0) + 300
    npcPlanet.fleet[ShipType.Cruiser] = (npcPlanet.fleet[ShipType.Cruiser] || 0) + 200
    npcPlanet.fleet[ShipType.Battleship] = (npcPlanet.fleet[ShipType.Battleship] || 0) + 100
    npcPlanet.fleet[ShipType.Bomber] = (npcPlanet.fleet[ShipType.Bomber] || 0) + 50
    npcPlanet.fleet[ShipType.Destroyer] = (npcPlanet.fleet[ShipType.Destroyer] || 0) + 30
    npcPlanet.fleet[ShipType.Battlecruiser] = (npcPlanet.fleet[ShipType.Battlecruiser] || 0) + 20

    showAlert(t('gmView.npcFleetInitialized', { npcName: selectedNPC.value.name }), t('gmView.npcFleetDetails'))
  }

  // 一键拉满所有资源
  const maxAllResources = () => {
    if (!selectedPlanet.value) return

    // 计算当前星球的资源存储上限
    const capacity = publicLogic.getResourceCapacity(selectedPlanet.value, gameStore.player.officers)

    selectedPlanet.value.resources.metal = capacity.metal
    selectedPlanet.value.resources.crystal = capacity.crystal
    selectedPlanet.value.resources.deuterium = capacity.deuterium
    selectedPlanet.value.resources.darkMatter = capacity.darkMatter

    toast.success(t('gmView.maxAllResourcesSuccess'))
  }

  // 一键完成所有队列和任务
  const completeAllQueues = () => {
    const now = Date.now()
    let buildingCount = 0
    let researchCount = 0
    let missionCount = 0
    let missileCount = 0

    // 完成所有星球的建筑队列
    gameStore.player.planets.forEach(planet => {
      planet.buildQueue.forEach(item => {
        if (item.endTime > now) {
          // 根据队列类型完成建筑/拆除/舰船/防御
          if (item.type === 'building') {
            planet.buildings[item.itemType as BuildingType] = item.targetLevel || 0
          } else if (item.type === 'demolish') {
            planet.buildings[item.itemType as BuildingType] = item.targetLevel || 0
          } else if (item.type === 'ship') {
            planet.fleet[item.itemType as ShipType] = (planet.fleet[item.itemType as ShipType] || 0) + (item.quantity || 0)
          } else if (item.type === 'defense') {
            planet.defense[item.itemType as DefenseType] = (planet.defense[item.itemType as DefenseType] || 0) + (item.quantity || 0)
          }
          buildingCount++
        }
      })
      planet.buildQueue = []
    })

    // 完成科技队列
    gameStore.player.researchQueue.forEach(item => {
      if (item.endTime > now && item.type === 'technology') {
        gameStore.player.technologies[item.itemType as TechnologyType] = item.targetLevel || 0
        researchCount++
      }
    })
    gameStore.player.researchQueue = []

    // 完成所有飞行任务（设置到达时间为现在，让游戏逻辑自动处理）
    gameStore.player.fleetMissions.forEach(mission => {
      if (mission.status === 'outbound') {
        // 计算原始飞行时间
        const originalFlightTime = mission.arrivalTime - mission.departureTime
        // 将到达时间设置为现在减1毫秒，确保游戏逻辑能立即检测到
        mission.arrivalTime = now - 1
        // 同时更新返回时间为：现在 + 原始飞行时间 - 1毫秒
        mission.returnTime = now + originalFlightTime - 1
        missionCount++
      } else if (mission.status === 'returning') {
        // 返航中的任务设置返回时间为现在减1毫秒，确保游戏逻辑能立即检测到
        if (mission.returnTime) {
          mission.returnTime = now - 1
        }
        missionCount++
      } else if (mission.status === 'arrived') {
        // 修复卡在 arrived 状态的任务
        // 将状态改为 returning 并设置返回时间为现在
        mission.status = 'returning'
        mission.returnTime = now - 1
        missionCount++
      }
    })

    // 完成所有NPC任务
    npcStore.npcs.forEach(npc => {
      if (npc.fleetMissions) {
        npc.fleetMissions.forEach(mission => {
          if (mission.status === 'outbound') {
            const originalFlightTime = mission.arrivalTime - mission.departureTime
            mission.arrivalTime = now - 1
            mission.returnTime = now + originalFlightTime - 1
          } else if (mission.status === 'returning' && mission.returnTime) {
            mission.returnTime = now - 1
          }
        })
      }
    })

    // 完成所有导弹攻击（设置到达时间为现在，让游戏逻辑自动处理）
    gameStore.player.missileAttacks.forEach(attack => {
      if (attack.status === 'flying') {
        attack.arrivalTime = now - 1
        missileCount++
      }
    })

    // 更新玩家积分（因为建筑/科技/舰队/防御可能已改变）
    updatePlayerPoints()

    toast.success(
      t('gmView.completeQueuesSuccess', {
        buildingCount,
        researchCount,
        missionCount,
        missileCount
      })
    )
  }
</script>
