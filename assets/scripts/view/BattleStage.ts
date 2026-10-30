import { _decorator, Component, Node, resources, JsonAsset, Vec3, UITransform, EventTouch, director, sys } from 'cc';
import { ConfigManager, BattleConfigData } from '../core/ConfigManager';
import { BattleSim } from '../battle/BattleSim';
import { EquipmentConfigData } from '../battle/types';
import { TickDriver } from '../core/TickDriver';
import { CombatStatistics } from '../battle/CombatStatistics';
import { buildUnitDetailData } from '../ui/UnitDetailPresentation';
import { BoardView } from './BoardView';
import { UnitView } from './UnitView';
import { ShopVisitor } from './ShopVisitor';
import { ExpeditionPortal } from './ExpeditionPortal';
import { ChestRewardFlight, ChestFlightTarget } from './ChestRewardFlight';
import { PlayerDamageFlight } from './PlayerDamageFlight';
import { rewardDeliveryPlan } from './RewardDeliveryPlan';
import type { OwnedUnit, ItemStatGrowth } from '../core/OwnedUnits';
import { UNIT_ART, M2_UI_SPRITE, UI_SPRITE } from './ArtPaths';
import { BattleReplayer } from './BattleReplayer';
import { GameAudio } from './GameAudio';
import { FloatingRuinsBoard, BOARD_PINCH_START, BOARD_ZOOM_CHANGED } from './FloatingRuinsBoard';
import { GameLoadingOverlay } from '../ui/GameLoadingOverlay';
import { BattleUI } from '../ui/BattleUI';
import { StageRewardPanel } from '../ui/StageRewardPanel';
import { freshRunSeed } from '../core/RunRandomContext';
import type { StageChoice, StageRewardGrant } from '../core/StageProgression';
import { loadRunSave, writeRunSave } from '../core/ShopSave';
import { RunSession } from '../core/RunSession';
import { unitPrice, Cost, sellPrice } from '../core/ShopConfig';
import { WaveConfig } from '../core/RoundFlow';
import { UnitConfigData } from '../core/ConfigManager';
import { RunConfig, stageRoundCount, MAX_STAGE_COUNT, DEFAULT_STAGE_COUNT } from '../core/RunSetup';
import type { EnemyDifficultyConfig } from '../core/EnemyGenerationTypes';
import type { EnemyPowerData } from '../core/EnemyPowerTypes';
import type { EnemyFormationConfig,EnemyRoleConfig } from '../core/EnemyFormationTypes';
import type { EquipmentPolicyConfig } from '../core/EquipmentPolicyTypes';

const { ccclass, property } = _decorator;

/**
 * 战斗舞台：组装 BoardView + UnitView + BattleSim + TickDriver + BattleUI。
 * - 准备阶段：拖拽己方棋子调整站位（空格移动 / 占格交换 / 无效返回）。
 * - 战斗阶段：禁止拖拽。
 * - 战斗结束返回准备阶段后重新允许调整。
 */
@ccclass('BattleStage')
export class BattleStage extends Component {
  @property(Node)
  boardNode: Node;

  private cfg = new ConfigManager();
  private sim: BattleSim;
  private driver: TickDriver;
  private replayer: BattleReplayer;
  private views = new Map<number, UnitView>();
  private previewWaveId: number | null = null;
  private previewAstralKey = '';
  private touchBound = new WeakSet<UnitView>();
  /** 战斗回放按 sim id 索引；布阵操作按持有棋子的 uid 索引。 */
  private ownedViews = new Map<number, UnitView>();
  private benchViews = new Set<number>();
  private selectedDetail: { kind: 'owned' | 'battle'; id: number } | null = null;
  private backpackEquipmentIndices: number[] = [];
  private battleIds = new Map<number, number>();
  private cellSize = 56;
  private loaded = false;
  private fighting = false;
  private preparationRemaining = 0;
  private ui: BattleUI;
  private stageRewards: StageRewardPanel;
  private shopVisitor: ShopVisitor | null = null;
  private bossChest: ShopVisitor | null = null;
  private explorerChest: ShopVisitor | null = null;
  private traitChoiceIdentity = '';
  private expeditionPortal: Node | null = null;
  private portalRequested = false;
  private stageRewardOpen = false;
  private rewardFlight: ChestRewardFlight | null = null;
  private damageFlight: PlayerDamageFlight | null = null;
  private damageHealthBefore: number | null = null;
  private speed = 1;

  // 经济 / 等级 / 存档
  private session: RunSession;
  // Existing view helpers keep their names; every reference points to the session's live core.
  private get economy() { return this.session.economy; }
  private get levelSys() { return this.session.level; }
  private get save() { return this.session.save; }
  private get pool() { return this.session.pool; }
  private get owned() { return this.session.owned; }
  private get shop() { return this.session.shop; }
  private resultShown = false;
  private combatStats = new CombatStatistics();
  private nextWaveRemaining: number | null = null;
  private transitioning = false;
  private get flow() { return this.session.flow; }
  private get waves() { return this.session.waves; }
  private waveTemplates: WaveConfig[];
  private runConfig: RunConfig;
  private enemyDifficulty: EnemyDifficultyConfig;
  private enemyPower: EnemyPowerData;
  private formationConfig:EnemyFormationConfig;
  private enemyRoles:EnemyRoleConfig;
  private equipmentPolicy:EquipmentPolicyConfig;
  private dragStart = new Vec3();
  private dragMoved = false;

  // 拖拽状态
  private draggingId = 0;          // 被拖拽的 unit id（0 = 无）
  private dragging: UnitView | null = null;
  private touchOffset: Vec3 = new Vec3();
  private loadScreen: GameLoadingOverlay | null = null;

  async start() {
    GameAudio.mount(this.node);
    PlayerDamageFlight.preload();
    this.loadScreen = GameLoadingOverlay.show(this.node.parent ?? this.node, '正在布置棋盘');
    try {
      const loadedSave = loadRunSave();
      await this.loadConfigs();
      if (!this.isValid) return;
      this.session = new RunSession(this.cfg, this.runConfig, this.waveTemplates, {
        ...(loadedSave ? {save:loadedSave} : {}), enemyDifficulty:this.enemyDifficulty, enemyPower:this.enemyPower,
        formationConfig:this.formationConfig,enemyRoles:this.enemyRoles,equipmentPolicy:this.equipmentPolicy, openingEncounter: true });
    } catch (error) {
      if (this.isValid) this.loadScreen?.fail('棋境准备失败，请返回重试', () => director.loadScene('main'));
      console.warn('[BattleStage] initialization failed', error); return;
    }
    this.buildBoard();
    this.replayer = this.node.addComponent(BattleReplayer);
    const uiNode = new Node('battleUI');
    this.node.parent?.addChild(uiNode);
    this.ui = uiNode.addComponent(BattleUI);
    this.ui.init();
    this.stageRewards = new StageRewardPanel(this.ui.rewardDockRoot, this.cfg, action => this.chooseStageReward(action), () => {
      this.stageRewardOpen = false; this.stageRewards.hide();
    }, item => {
      if (item) { this.selectedDetail = null; this.ui.showEquipmentDetail(item); }
      else this.ui.hideEquipmentDetail();
    },this.runConfig.stageEncounters?.shop.refresh,()=>this.ui.showIncomeDetails(),this.runConfig.stageEncounters?.shop.qualityRates,{
      read:()=>({gold:this.economy.gold,items:this.owned.equipmentReserve,dice:this.session.merchantDice}),
      level:id=>this.session.forgeLevel(id),eligible:id=>this.session.canForge(id),
      enhance:(index,id,count)=>{
        const result=this.session.enhanceEquipment(index,id,count);
        if(!result.ok){this.ui.showWarn(result.error==='not_enough_gold'?'金币不足':'无法强化该装备');return undefined;}
        GameAudio.play('equip');this.persistShopState();this.refreshBackpack();this.refreshOwnedViews();this.refreshEconomyUI();
        return this.owned.equipmentReserve[index];
      },
      bet:(stake,picks)=>{
        const result=this.session.beginDiceBet(stake,picks);
        if(!result.ok){this.ui.showWarn(result.error==='not_enough_gold'?'金币不足':'暂时无法投注');return;}
        GameAudio.play('refresh');this.persistShopState();this.refreshEconomyUI();this.refreshShopContent();
      },
      settle:id=>{
        if(!this.session.finishDiceBet(id).ok)return;
        GameAudio.play('reward');this.persistShopState();this.refreshEconomyUI();this.refreshShopContent();
      },
      refresh:()=>this.refreshEconomyUI(),inspect:item=>this.ui.showEquipmentDetail(item),
    },this.runConfig.stageEncounters?.shop.refreshQuality);
    this.ui.configureDebug({ equipment: this.cfg.allEquipment(), units: this.cfgUnits(),
      roundsPerStage: Array.from({ length: MAX_STAGE_COUNT }, (_, i) => stageRoundCount(i + 1, this.runConfig)) });
    this.ui.onDebugGold = amount => this.debugGrantGold(amount);
    this.ui.onDebugUnit = (id, star) => this.debugGrantUnit(id, star);
    this.ui.onDebugStage = (stage, round) => this.debugJumpStage(stage, round);
    this.ui.bindBoardPopulation(this.boardNode);
    this.ui.onFight = () => this.startFight();
    this.ui.onSpeed = (s) => { this.speed = s; };
    this.ui.onSettings = settings => {
      this.speed = settings.speed;
      this.replayer.damageNumbers = settings.damageNumbers;
      this.replayer.healingNumbers = settings.healingNumbers;
      this.node.parent?.getComponent(FloatingRuinsBoard)?.setZoom(settings.cameraZoom);
    };
    this.node.parent?.on(BOARD_ZOOM_CHANGED,this.onBoardZoomChanged,this);
    this.ui.onSettings(this.ui.getBattleSettings());
    this.ui.onRestart = () => this.restart();
    this.ui.onNextWave = () => this.nextSpecialEncounter();
    this.ui.onClaimEquipmentReward=index=>{
      const result=this.session.claimEquipmentReward(index);
      if(!result.ok){this.ui.showWarn('无法领取该装备');return;}
      GameAudio.play('reward');
      this.persistShopState();this.ui.hideEquipmentReward();this.refreshRunUI();this.refreshShopUI();this.scheduleNextWave();
    };
    this.ui.onHome = () => {
      if (this.transitioning || this.rewardFlight || this.draggingId || this.flow.phase === 'battle') return;
      this.persistShopState();
      this.loadScreen = GameLoadingOverlay.show(this.node.parent ?? this.node, '正在返回主界面');
      const fail = () => { this.loadScreen?.finish(); this.loadScreen = null; this.ui.showWarn('主界面加载失败，请重试'); };
      if (!director.loadScene('main', error => { if (error) fail(); })) fail();
    };
    this.ui.onBackpack = (index, event) => this.equipFromBackpack(index, event);
    this.ui.onBackpackDrag = (index, event) => {
      if (!this.canManageShop() || this.flow.phase !== 'prepare' || this.session.pendingOpeningEncounter) return;
      if(this.stageRewards.forging)return;
      const reserveIndex = this.backpackEquipmentIndices[index], id = this.owned.equipmentReserve[reserveIndex];
      const item = id && this.cfg.getEquipmentReserve([id])[0];
      if (item) this.ui.showSellPreview(item.name, this.session.equipmentRecycleGold(reserveIndex), this.overSell(event));
    };
    this.ui.onInspectBackpack = index => this.inspectBackpack(index);
    this.ui.onGrantEquipment = (id = 'guinsoo') => {
      if (!this.canManageShop() || this.flow.phase !== 'prepare') return;
      if (!this.cfg.getEquipmentReserve([id]).length) return;
      this.owned.equipmentReserve.push(id); this.persistShopState();
    };
    this.ui.onEquipment = (slot) => this.changeEquipment(slot);
    this.ui.onBuy = (slot) => this.buyFromShop(slot);
    this.ui.onRefresh = () => this.refreshShop();
    this.ui.onBuyExp = () => this.buyExperience();
    this.ui.onLock = () => {
      if (!this.canManageShop()) return;
      this.session.toggleShopLock(); this.persistShopState(); this.ui.setLocked(this.shop.locked);
      GameAudio.play(this.shop.locked ? 'lock' : 'unlock');
    };
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
    this.ui.setShopVisible(true);
    this.refreshEconomyUI();
    this.loaded = true;
    this.schedule(this.finishInitialLoading, .05);
    this.refreshRunUI();
    if (this.flow.phase === 'settlement' || this.flow.phase === 'ended') {
      this.fighting = true; this.resultShown = true; this.ui.hideFightBtn(); this.ui.setShopVisible(false);
      this.showSettlement();
      this.scheduleNextWave();
    }
  }

  private finishInitialLoading(): void {
    if (!this.loadScreen || !this.loaded) return;
    const presentation = this.node.parent?.getComponent(FloatingRuinsBoard);
    const units = Array.from(new Set(Array.from(this.views.values()).concat(Array.from(this.ownedViews.values()))));
    if (presentation?.loadError || units.some(unit => !!unit.loadError)) {
      this.unschedule(this.finishInitialLoading);
      this.loadScreen.fail('棋盘素材加载失败，请返回重试', () => director.loadScene('main'));
      return;
    }
    if (presentation && !presentation.loadingComplete || units.some(unit => !unit.visualReady)) return;
    this.unschedule(this.finishInitialLoading);
    this.loadScreen.finish(); this.loadScreen = null;
  }

  private loadConfigs(): Promise<void> {
    return new Promise((res, rej) => {
      let pending = 11;
      const done = () => { if (--pending === 0) res(); };
      const fail = (e: Error) => { pending = -1; rej(e); };
      resources.load('config/equipment-policy',JsonAsset,(e,a)=>{if(e){fail(e);return;}this.equipmentPolicy=a.json as EquipmentPolicyConfig;done();});
      resources.load('config/enemy-formation', JsonAsset, (e,a) => {
        if(e){fail(e);return;}this.formationConfig=a.json as EnemyFormationConfig;done();
      });
      resources.load('config/enemy-roles', JsonAsset, (e,a) => {
        if(e){fail(e);return;}this.enemyRoles=a.json as EnemyRoleConfig;done();
      });
      resources.load('config/enemy-difficulty', JsonAsset, (e,a) => {
        if(e){fail(e);return;}this.enemyDifficulty=a.json as EnemyDifficultyConfig;done();
      });
      resources.load('config/enemy-power', JsonAsset, (e,a) => {
        if(e){fail(e);return;}this.enemyPower=a.json as EnemyPowerData;done();
      });
      resources.load('config/equipment', JsonAsset, (e, a) => {
        if (e) { fail(e); return; } this.cfg.setEquipment(a.json as EquipmentConfigData[]); done();
      });

      resources.load('config/units', JsonAsset, (e, a) => {
        if (e) { fail(e); return; }
        this.cfg.setUnits(a.json as UnitConfigData[]);
        done();
      });
      resources.load('config/skills', JsonAsset, (e, a) => {
        if (e) { fail(e); return; }
        this.cfg.setSkills(a.json as Record<string, never>);
        done();
      });
      resources.load('config/battle', JsonAsset, (e, a) => {
        if (e) { fail(e); return; }
        this.cfg.setBattle(a.json as BattleConfigData);
        done();
      });
      resources.load('config/waves', JsonAsset, (e, a) => {
        if (e) { fail(e); return; } this.waveTemplates = a.json as WaveConfig[]; done();
      });
      resources.load('config/run', JsonAsset, (e, a) => {
        if (e) { fail(e); return; } this.runConfig = a.json as RunConfig; done();
      });
    });
  }

  private cfgUnits(): UnitConfigData[] {
    return this.cfg.allUnits();
  }

  private unitMap(): Map<string, UnitConfigData> {
    const m = new Map<string, UnitConfigData>();
    for (const u of this.cfgUnits()) m.set(u.id, u);
    return m;
  }

  private buildBoard() {
    const bv = this.boardNode.getComponent(BoardView) ?? this.boardNode.addComponent(BoardView);
    // Lift the shared model/portrait/input root so the full reserve bench clears the shop dock.
    this.boardNode.setPosition(0, 100, 0);
    bv.benchSlots = this.save.benchSlots;
    bv.initialize(this.cfg.battle.boardWidth, this.cfg.battle.boardHeight, 48);
    this.node.parent?.on(BOARD_PINCH_START, this.cancelBoardDrag, this);
  }

  private createSim(battle: boolean) {
    const preview = this.session.createPreview();
    this.battleIds = preview.battleIds;
    this.sim = battle ? this.session.battle! : preview.sim;
  }

  private createViews() {
    const bv = this.boardNode.getComponent(BoardView)!;
    const old = this.boardNode.getChildByName('units');
    const reuse = this.flow.phase === 'prepare' && this.previewWaveId === this.flow.wave.id;
    const previousOwned = reuse ? new Map(this.ownedViews) : new Map<number, UnitView>();
    const previousSim = reuse ? new Map(this.views) : new Map<number, UnitView>();
    const previousBench = new Set(this.benchViews);
    if (!reuse && old) { old.removeFromParent(); old.destroy(); }
    const root = reuse && old ? old : new Node('units');
    const ut = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    ut.setContentSize(Math.max(bv.boardPixelW, this.save.benchSlots * 64), bv.boardPixelH + 180);
    if (!root.parent) this.boardNode.addChild(root);
    const retained = new Set<UnitView>();
    const uidById = new Map(Array.from(this.battleIds, ([uid, id]) => [id, uid]));
    this.views.clear(); this.ownedViews.clear(); this.benchViews.clear();

    // 棋盘上的双方视图严格使用 sim id，回放事件不会与 owned uid 混用。
    for (const u of this.sim.units) {
      if(u.cfg.summonOnly&&u.side!==0&&this.flow.phase!=='battle')continue;
      const uid = uidById.get(u.id);
      const candidate = uid !== undefined ? (!previousBench.has(uid) ? previousOwned.get(uid) : undefined) : previousSim.get(u.id);
      const uv = candidate?.cfgId === u.cfg.id && candidate.side === u.side && !retained.has(candidate)
        ? candidate : this.makeUnitView(root, u.cfg.id, u.side, u.id, bv.cellToWorld(u.x, u.y));
      retained.add(uv); uv.unitId = u.id;
      uv.node.setPosition(bv.cellToWorld(u.x, u.y));
      this.views.set(u.id, uv);
      uv.setStar(u.star); uv.setEquipment(u.equipment);
      uv.sync(u.snapshot(this.sim.tick), this.cellSize);
    }
    for (const ou of this.owned.onBoard()) {
      const uv = this.views.get(this.battleIds.get(ou.uid)!)!;
      this.ownedViews.set(ou.uid, uv);
    }
    // The independent 3D reserve modules share these exact hit centers.
    for (let slot = 0; slot < this.save.benchSlots; slot++) {
      if (root.getChildByName(`bench_${slot}`)) continue;
      const node = new Node(`bench_${slot}`);
      node.addComponent(UITransform).setContentSize(62, 50);
      node.setPosition(this.benchSlotWorld(slot));
      root.addChild(node);
    }
    // Keep reserve identity even when simulation IDs shift after a merge or sale.
    for (const uid of previousBench) {
      if (this.owned.get(uid)?.location !== 'bench') continue;
      const view = previousOwned.get(uid);
      if (view) { this.ownedViews.set(uid, view); this.benchViews.add(uid); retained.add(view); }
    }
    this.createBenchViews(root);
    for (const view of new Set(Array.from(previousOwned.values()).concat(Array.from(previousSim.values())))) {
      if (!retained.has(view)) { view.node.removeFromParent(); view.node.destroy(); }
    }
    this.previewWaveId = this.flow.phase === 'prepare' ? this.flow.wave.id : null;
    for (const ou of this.owned.all()) {
      const uv = this.ownedViews.get(ou.uid)!;
      uv.setStar(ou.star); uv.setEquipment(this.cfg.getEquipment(ou.equipment));
    }
  }

  /** Refresh only reserve units during combat; keep the active army and event cursor intact. */
  private createBenchViews(root: Node): void {
    const reserve = this.owned.inBench();
    const wanted = new Set(reserve.map(unit => unit.uid));
    for (const uid of this.benchViews) {
      if (wanted.has(uid)) continue;
      const view = this.ownedViews.get(uid);
      view?.node.removeFromParent(); view?.node.destroy(); this.ownedViews.delete(uid);
    }
    this.benchViews = wanted;
    let bench = root.getChildByName('benchUnits');
    if (!bench) { bench = new Node('benchUnits'); root.addChild(bench); }
    for (const ou of this.owned.inBench()) {
      let uv = this.ownedViews.get(ou.uid);
      if (!uv || uv.cfgId !== ou.unitId) {
        uv?.node.removeFromParent(); uv?.node.destroy();
        uv = this.makeUnitView(bench, ou.unitId, 0, ou.uid, this.benchSlotWorld(ou.y), 0.82 * 1.3);
      }
      uv.node.setPosition(this.benchSlotWorld(ou.y));
      uv.setVitalsVisible(false);
      uv.setStar(ou.star); uv.setEquipment(this.cfg.getEquipment(ou.equipment)); this.ownedViews.set(ou.uid, uv); this.benchViews.add(ou.uid);
      const base = this.cfg.scaleUnit(this.cfg.getUnit(ou.unitId), ou.star);
      const grown = this.cfg.equipmentStats({...base, hp: base.hp + (ou.permanentMaxHp ?? 0)}, ou.equipment);
      uv.setMaxHealthAppearance(base.role, base.hp, grown.hp);
    }
  }

  private refreshOwnedViews(playUpgrades = true): void {
    const upgraded = this.owned.all().filter(unit => {
      const previous = this.ownedViews.get(unit.uid);
      return previous && unit.star > previous.displayedStar;
    }).map(unit => unit.uid);
    if (playUpgrades && upgraded.length) GameAudio.play('upgrade');
    if (this.flow.phase === 'prepare') {
      this.resetBattle(false);
      if (playUpgrades) for (const uid of upgraded) this.ownedViews.get(uid)?.playStarUpgrade();
      return;
    }
    this.createBenchViews(this.boardNode.getChildByName('units')!);
    for (const uid of this.benchViews) this.bindOwnedTouch(uid, this.ownedViews.get(uid)!);
    for (const uid of upgraded) {
      const view = this.ownedViews.get(uid);
      view?.setStar(this.owned.get(uid)!.star);
      if (playUpgrades) view?.playStarUpgrade();
    }
    this.refreshEconomyUI();this.ui.refreshFormation(this.owned.all(), this.cfgUnits());
    if (this.selectedDetail?.kind === 'owned' && !this.owned.get(this.selectedDetail.id)) {
      this.selectedDetail = null; this.ui.closeUnitDetail();
    } else if (this.selectedDetail?.kind === 'owned' && this.ui.unitDetailVisible) {
      this.showOwnedDetail(this.selectedDetail.id);
    }
  }

  private makeUnitView(root: Node, cfgId: string, side: 0 | 1, id: number, pos: Vec3, portraitScale = 1.3): UnitView {
    const node = new Node(`unit_${side}_${id}`);
    node.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
    root.addChild(node);
    const uv = node.addComponent(UnitView);
    const cfg = this.cfg.getUnit(cfgId);
    uv.setup(cfgId, side, id, this.cellSize, cfg.artId ?? cfgId, cfg.tint, portraitScale);
    node.setPosition(pos);
    return uv;
  }

  /** Recompute preview logic; retain view identity within preparation, fully reset on phase/wave changes. */
  private resetBattle(battle: boolean): void {
    this.refreshEconomyUI();
    this.selectedDetail = null; this.ui.closeUnitDetail();
    const reusePreview = !battle && this.flow.phase === 'prepare' && this.previewWaveId === this.flow.wave.id;
    this.createSim(battle);
    this.createViews();
    this.ui.refreshFormation(this.owned.all(), this.cfgUnits());
    this.ui.refreshTraits(this.sim.resolvedTraits[0], this.cfgUnits());
    const bv = this.boardNode.getComponent(BoardView)!;
    const astralKey = JSON.stringify(this.sim.astralFields);
    if (!reusePreview || this.previewAstralKey !== astralKey) bv.showAstralFields(this.sim.astralFields);
    this.previewAstralKey = astralKey;
    const previewOnly = reusePreview && !!this.boardNode.getChildByName('fx');
    if (previewOnly) {
      this.replayer.bindPreview(this.sim, this.views);
      this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
      this.setupTouchEvents();
      return;
    }
    this.replayer.bind(this.sim, this.views, this.cellSize, bv, this.cfg.battle.tickMs);
    const oldFx = this.boardNode.getChildByName('fx');
    if (oldFx) { oldFx.removeFromParent(); oldFx.destroy(); }
    const fx = new Node('fx');
    fx.layer=this.boardNode.layer;fx.addComponent(UITransform).setContentSize(bv.boardPixelW,bv.boardPixelH);
    this.boardNode.addChild(fx);
    this.replayer.setFxRoot(fx);
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
    this.setupTouchEvents();
  }

  // ─── 拖拽布阵 ───

  private setupTouchEvents() {
    for (const [uid, uv] of this.ownedViews) {
      this.bindOwnedTouch(uid, uv);
    }
    for (const u of this.sim.units.filter(u => u.side === 1 || u.cfg.summonOnly)) {
      const view = this.views.get(u.id);
      if (!view || this.touchBound.has(view)) continue;
      this.touchBound.add(view);
      if(u.side===0&&u.cfg.summonOnly&&this.flow.phase==='prepare'){
        const node=this.views.get(u.id)?.node;
        node?.on(Node.EventType.TOUCH_START,this.onTouchStart,this);
        node?.on(Node.EventType.TOUCH_MOVE,this.onTouchMove,this);
        node?.on(Node.EventType.TOUCH_END,this.onTouchEnd,this);
        node?.on(Node.EventType.TOUCH_CANCEL,this.onTouchEnd,this);
        continue;
      }
      this.views.get(u.id)?.node.on(Node.EventType.TOUCH_END, () => {
        if(!this.boardGestureActive)this.showBattleDetail(view.unitId);
      });
    }
  }

  private bindOwnedTouch(uid: number, uv: UnitView): void {
    if (this.touchBound.has(uv)) return;
    this.touchBound.add(uv);
    uv.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    uv.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    uv.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      if(this.boardGestureActive)return;
      const battleId = this.battleIds.get(uid);
      if (this.flow.phase === 'battle' && !this.benchViews.has(uid) && battleId) this.showBattleDetail(battleId);
      else this.onTouchEnd(event);
    });
    uv.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  /** 触摸点 → boardNode 本地坐标 */
  private touchToBoard(event: EventTouch): Vec3 {
    const worldPos = event.getUILocation();
    const bvUt = this.boardNode.getComponent(UITransform) ?? this.boardNode.addComponent(UITransform);
    return bvUt.convertToNodeSpaceAR(new Vec3(worldPos.x, worldPos.y, 0));
  }

  private onTouchStart(event: EventTouch) {
    if (this.boardGestureActive || !this.canManageShop()) return;
    const boardPos = this.touchToBoard(event);

    // 用视图本地坐标检测己方棋盘和备战席棋子。
    let bestId = 0;
    let bestDist = Infinity;
    for (const [uid, uv] of this.ownedViews) {
      const owned = this.owned.get(uid);
      if (!owned || (this.flow.phase === 'battle' && owned.location !== 'bench')) continue;
      const c = uv.node.position;
      const d = (boardPos.x - c.x) ** 2 + (boardPos.y - c.y) ** 2;
      if (d < bestDist) { bestDist = d; bestId = uid; }
    }
    if(this.flow.phase==='prepare')for(const u of this.sim.units.filter(u=>u.side===0&&u.cfg.summonOnly)){
      const view=this.views.get(u.id);if(!view)continue;
      const c=view.node.position,d=(boardPos.x-c.x)**2+(boardPos.y-c.y)**2;
      if(d<bestDist){bestDist=d;bestId=-u.id;}
    }
    if (!bestId || bestDist > (this.cellSize * 0.6) ** 2) return;

    const uv = bestId<0?this.views.get(-bestId):this.ownedViews.get(bestId);
    if (!uv) return;
    this.boardNode.getComponent(BoardView)!.interactionActive = true;
    this.draggingId = bestId;
    this.dragging = uv;
    this.dragStart.set(boardPos.x, boardPos.y, 0); this.dragMoved = false;
    this.touchOffset.set(boardPos.x - uv.node.position.x, boardPos.y - uv.node.position.y, 0);
    uv.node.setScale(1.15, 1.15, 1);
  }

  private onTouchMove(event: EventTouch) {
    if (this.boardGestureActive || !this.draggingId || !this.dragging) return;
    const boardPos = this.touchToBoard(event);
    if (Math.hypot(boardPos.x - this.dragStart.x, boardPos.y - this.dragStart.y) > 8) this.dragMoved = true;
    if (!this.dragMoved) return;
    this.selectedDetail = null;
    this.dragging.node.setPosition(boardPos.x - this.touchOffset.x, boardPos.y - this.touchOffset.y, 0);
    if(this.draggingId<0){
      const bv=this.boardNode.getComponent(BoardView)!,pos=this.dragging.node.position,cell=bv.worldToCell(pos.x,pos.y);
      bv.highlightTarget(cell,!!cell&&bv.isOwnCell(cell.y));return;
    }
    const u = this.owned.get(this.draggingId)!;
    const selling = this.overSell(event) && !this.session.unitSellingLocked;
    const pos = this.dragging.node.position;
    const bench = this.benchSlotAt(pos.x, pos.y);
    const bv = this.boardNode.getComponent(BoardView)!;
    const cell = bv.worldToCell(pos.x, pos.y);
    let population = this.owned.onBoard().length;
    if (selling && u.location === 'board') population--;
    else if (bench !== null && u.location === 'board' && !this.owned.atBench(bench)) population--;
    else if (this.flow.phase === 'prepare' && !selling && bench === null && cell && bv.isOwnCell(cell.y)
      && u.location === 'bench' && !this.owned.atBoard(cell.x, cell.y)) population++;
    bv.highlightTarget(!selling && bench === null ? cell : null,
      this.flow.phase === 'prepare' && !!cell && bv.isOwnCell(cell.y)
      && population <= this.session.unitCapAfterMove(u.uid,{location:'board',x:cell.x,y:cell.y}), this.cfg.getUnit(u.unitId).range);
    this.ui.showSellPreview(this.cfg.getUnit(u.unitId).name,
      sellPrice(this.pool.costOfUnit(u.unitId), u.star), selling, population, !this.session.unitSellingLocked);
  }

  private onTouchEnd(event: EventTouch) {
    if (this.boardGestureActive || !this.draggingId || !this.dragging) return;
    const uv = this.dragging;
    const bv = this.boardNode.getComponent(BoardView)!;
    uv.node.setScale(1, 1, 1);

    const curPos = uv.node.position;
    const cell = bv.worldToCell(curPos.x, curPos.y);

    if(this.draggingId<0){
      const id=-this.draggingId,unit=this.sim.units.find(u=>u.id===id)!;
      if(event.type!==Node.EventType.TOUCH_CANCEL&&!this.dragMoved){
        uv.node.setPosition(bv.cellToWorld(unit.x,unit.y));this.resetDrag();this.showBattleDetail(id);return;
      }
      const result=event.type!==Node.EventType.TOUCH_CANCEL&&cell?this.session.moveSummon(cell):null;
      if(result?.ok)GameAudio.play('place');
      this.resetDrag();this.refreshOwnedViews(false);this.persistShopState();return;
    }

    const ou = this.owned.get(this.draggingId);
    if (!ou) { this.resetDrag(); return; }
    if (event.type !== Node.EventType.TOUCH_CANCEL && !this.dragMoved) {
      uv.node.setPosition(ou.location === 'board' ? bv.cellToWorld(ou.x, ou.y) : this.benchSlotWorld(ou.y));
      this.resetDrag(); this.showOwnedDetail(ou.uid); return;
    }
    if (event.type !== Node.EventType.TOUCH_CANCEL && this.overSell(event)) {
      const result=this.session.sellUnit(ou.uid);
      if(result.ok)GameAudio.play('sell');
      else if(result.error==='opening_sell_locked')this.ui.showWarn('1-1 不能出售棋子');
      else if(result.error==='population_cap')this.ui.showWarn('请先减少上阵棋子，再出售统御冠携带者');
      this.resetDrag(); this.refreshOwnedViews(); this.persistShopState();
      this.refreshShopUI(); this.refreshEconomyUI(); return;
    }

    const benchSlot = this.benchSlotAt(curPos.x, curPos.y);
    if (event.type === Node.EventType.TOUCH_CANCEL || (benchSlot === null && (this.flow.phase === 'battle' || !cell || !bv.isOwnCell(cell.y)))) {
      // 回原位
      const orig = ou.location === 'board' ? bv.cellToWorld(ou.x, ou.y) : this.benchSlotWorld(ou.y);
      uv.node.setPosition(orig.x, orig.y, 0);
      this.resetDrag();
      return;
    }

    if (benchSlot !== null) {
      const result=this.session.moveUnit(ou.uid,{location:'bench',x:-1,y:benchSlot});
      if(result.ok)GameAudio.play('place');else if(result.error==='population_cap')this.ui.showWarn('该移动会超出上阵人口上限');
      this.resetDrag();
      this.refreshOwnedViews();
      this.persistShopState();
      this.refreshShopUI();
      return;
    }

    // 上阵人数检查（board 目标格为空且当前上阵数已满 → 拒绝）
    const occupant = this.owned.atBoard(cell.x, cell.y);
    if (!occupant && ou.location === 'bench') {
      const cap = this.session.unitCapAfterMove(ou.uid,{location:'board',x:cell.x,y:cell.y});
      if (this.owned.onBoard().length >= cap) {
        // 超员：回原位 + 提示
        const orig = this.benchSlotWorld(ou.y);
        uv.node.setPosition(orig.x, orig.y, 0);
        this.ui.showWarn(`上阵人数已达上限 ${cap}`);
        this.resetDrag();
        return;
      }
    }

    // 数据层移动/交换（自动合并同名）
    const move=this.session.moveUnit(ou.uid,{location:'board',x:cell.x,y:cell.y});
    if(move.ok)GameAudio.play('place');else if(move.error==='population_cap')this.ui.showWarn('该移动会超出上阵人口上限');
    const target = bv.cellToWorld(cell.x, cell.y);
    uv.node.setPosition(target.x, target.y, 0);
    // 若发生合并，uv 可能已失效——重建视图
    this.resetDrag();
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
  }

  /** 备战席槽位的世界坐标（棋盘下方一排） */
  private benchSlotWorld(slot: number): Vec3 {
    return this.boardNode.getComponent(BoardView)!.benchPosition(slot);
  }

  private benchSlotAt(x: number, y: number): number | null {
    for (let slot = 0; slot < this.save.benchSlots; slot++) {
      const pos = this.benchSlotWorld(slot);
      if (Math.abs(x - pos.x) <= 31 && Math.abs(y - pos.y) <= 25) return slot;
    }
    return null;
  }

  private get boardGestureActive(): boolean {
    return this.node.parent?.getComponent(FloatingRuinsBoard)?.touchGestureActive ?? false;
  }
  private cancelBoardDrag(): void {
    if(this.draggingId<0&&this.dragging){
      const unit=this.sim.units.find(u=>u.id===-this.draggingId);
      if(unit)this.dragging.node.setPosition(this.boardNode.getComponent(BoardView)!.cellToWorld(unit.x,unit.y));
    }
    const owned=this.draggingId?this.owned.get(this.draggingId):undefined;
    if(owned&&this.dragging){
      const board=this.boardNode.getComponent(BoardView)!;
      this.dragging.node.setPosition(owned.location==='board'?board.cellToWorld(owned.x,owned.y):this.benchSlotWorld(owned.y));
    }
    this.resetDrag();
  }
  private resetDrag() {
    const board = this.boardNode?.getComponent(BoardView);
    if(board) board.interactionActive = false;
    this.boardNode?.getComponent(BoardView)?.highlightTarget(null);
    if (this.dragging) this.dragging.node.setScale(1, 1, 1);
    this.draggingId = 0;
    this.dragging = null;
    this.ui?.clearSellPreview();
  }

  private overSell(event: EventTouch): boolean {
    const p = event.getUILocation();
    const local = this.ui.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    return this.ui.isInSellArea(local.x, local.y);
  }
  private equipFromBackpack(index: number, event?: EventTouch): void {
    if (!this.canManageShop() || this.flow.phase !== 'prepare') return;
    const reserveIndex = this.backpackEquipmentIndices[index];
    const id = Number.isInteger(index) && reserveIndex !== undefined ? this.owned.equipmentReserve[reserveIndex] : undefined;
    if (!id) { this.ui.showWarn('道具暂未配置使用效果'); return; }
    if(event&&this.stageRewards.tryDropEquipment(reserveIndex,event))return;
    if (event && this.overSell(event)) { this.recycleBackpack(reserveIndex, id); return; }
    let uid = this.selectedDetail?.kind === 'owned' ? this.selectedDetail.id : 0;
    if (event) {
      const point = this.touchToBoard(event); uid = 0; let best = (this.cellSize * 0.65) ** 2;
      for (const [candidate, view] of this.ownedViews) {
        const p = view.node.position, distance = (point.x - p.x) ** 2 + (point.y - p.y) ** 2;
        if (distance < best) { best = distance; uid = candidate; }
      }
    }
    if (!uid) { this.ui.showWarn('先选择棋子，或把装备拖到棋子身上'); return; }
    const result=this.session.equipItem(uid,reserveIndex);
    if(!result.ok){this.ui.showWarn(result.error==='copy_cost_limit'?'该复制器无法复制此费用棋子':result.error==='pool_empty'?'该棋子卡池已空，道具未消耗':result.error==='bench_full'?'备战席已满且无法合成，道具未消耗':result.error==='population_cap'?'请先减少上阵棋子再操作':result.error==='attribute_overflow'?'属性已达上限，道具未消耗':'该棋子已装备3件');return;}
    GameAudio.play('equip');
    this.persistShopState(); this.refreshOwnedViews(); this.refreshRunUI();
    if(this.owned.get(uid)&&!this.session.pendingTraitChoice)this.showOwnedDetail(uid);else this.ui.closeUnitDetail();
    if(result.copiedUnitId)this.ui.showWarn(`已复制1张一星${this.cfg.getUnit(result.copiedUnitId).name}`);
  }
  private refreshBackpack(): void {
    const equipment = this.owned.equipmentReserve.map((id, index) => ({ item: this.cfg.getEquipmentReserve([id])[0], index }))
      .filter(entry => !!entry.item);
    this.backpackEquipmentIndices = equipment.map(entry => entry.index);
    this.ui.refreshBackpack([
      ...equipment.map(({ item }) => ({ ...item, kind: 'equipment' as const })),
      ...(this.save.backpackItems ?? []),
    ], this.loaded && !this.draggingId && this.flow.phase === 'prepare');
  }
  private inspectBackpack(index: number): void {
    const reserveIndex = this.backpackEquipmentIndices[index];
    const id = Number.isInteger(index) && reserveIndex !== undefined ? this.owned.equipmentReserve[reserveIndex] : undefined;
    const item = id && this.cfg.getEquipmentReserve([id])[0];
    if (!item) return;
    const editable = this.canManageShop() && this.flow.phase === 'prepare' && !this.session.pendingOpeningEncounter;
    this.ui.showEquipmentDetail(item, editable ? {
      gold: this.session.equipmentRecycleGold(reserveIndex),
      equip: () => {
        if (this.owned.equipmentReserve[reserveIndex] === id) this.equipFromBackpack(index);
      },
      recycle: () => {
        this.recycleBackpack(reserveIndex, id);
      },
    } : undefined);
  }
  private recycleBackpack(reserveIndex: number, id: string): void {
    if (!this.canManageShop()) return;
    const result = this.session.act({ type: 'recycleEquipment', reserveIndex, equipmentId: id });
    if (!result.ok) { this.ui.showWarn('当前无法回收该装备'); return; }
    this.ui.hideEquipmentDetail(); GameAudio.play('sell');
    this.persistShopState(); this.refreshEconomyUI(); this.refreshRunUI();
  }
  private changeEquipment(slot: number): void {
    if (!this.canManageShop() || this.flow.phase !== 'prepare' || this.selectedDetail?.kind !== 'owned') return;
    const uid = this.selectedDetail.id, unit = this.owned.get(uid); if (!unit) return;
    if (slot < (unit.equipment?.length ?? 0)) {
      const result=this.session.unequipItem(uid,slot);
      if(!result.ok){if(result.error==='population_cap')this.ui.showWarn('请先减少上阵棋子，再卸下统御冠');return;}
      GameAudio.play('equip');
    }
    else return;
    this.persistShopState(); this.resetBattle(false);this.refreshEconomyUI(); this.refreshRunUI(); this.showOwnedDetail(uid);
  }
  private showOwnedDetail(uid: number): void {
    const u = this.owned.get(uid); if (!u) return;
    this.selectedDetail = { kind: 'owned', id: uid };
    const base = this.cfg.getUnit(u.unitId);
    const deployed = this.owned.onBoard().some(unit => unit.uid === uid);
    const previewUnit = deployed ? this.sim.units.find(unit => unit.id === this.battleIds.get(uid)) : null;
    const scaled = this.cfg.scaleUnit(base, u.star); scaled.hp += u.permanentMaxHp ?? 0;
    scaled.spellPower = (scaled.spellPower ?? 0) + (u.permanentSpellPower ?? 0);
    scaled.physicalPower = (scaled.physicalPower ?? 0) + (u.permanentPhysicalPower ?? 0);
    const cfg = previewUnit ? { ...previewUnit.cfg, damageAmp: previewUnit.damageAmp, lifesteal: previewUnit.lifesteal } : this.cfg.equipmentStats(scaled, u.equipment);
    cfg.atkSpeed = Math.min(this.cfg.battle.attackSpeedCap ?? 5, cfg.atkSpeed + this.cfg.getEquipment(u.equipment).reduce((sum, item) => sum + item.attackSpeedBonus + (item.healthStance?.attackSpeedBonus ?? 0), 0));
    this.ui.showEquipment(this.cfg.getEquipment(u.equipment), this.canManageShop() && this.flow.phase === 'prepare', 0);
    this.showDetail(u.star, cfg, this.cfg.battle.starScaling[u.star - 1].skill, 0, cfg.hp, cfg.startMana, 0, previewUnit?.soulLampHealth ?? u.soulLampHealth ?? 0, previewUnit?.permanentSpellPower ?? u.permanentSpellPower ?? 0, false, previewUnit?.permanentPhysicalPower ?? u.permanentPhysicalPower ?? 0, u);
  }
  private showBattleDetail(id: number): void {
    const unit = this.sim.units.find(u => u.id === id); if (!unit) return;
    this.selectedDetail = { kind: 'battle', id };
    this.ui.showEquipment(unit.equipment, false, unit.equipmentAttackStacks, unit.equipmentDamageStacks);
    const ownedUid = unit.side === 0 ? [...this.battleIds].find(([, battleId]) => battleId === id)?.[0] : undefined;
    this.showDetail(unit.star, { ...unit.cfg, armor: unit.armor, physicalPower: unit.physicalPower, mr: unit.mr, atkSpeed: unit.attackSpeed, damageAmp: unit.damageAmp, lifesteal: unit.lifesteal, damageReduction: unit.damageReductionAt(this.sim.tick) }, unit.skillScale, unit.side, unit.hp, unit.mana, unit.shield, unit.soulLampHealth, unit.permanentSpellPower, true, unit.permanentPhysicalPower, ownedUid === undefined ? undefined : this.owned.get(ownedUid));
  }
  private showDetail(star: number, cfg: UnitConfigData, skillScale: number, side: 0 | 1, hp: number, mana: number, shield = 0, passiveHealth = 0, passiveSpellPower = 0, runtimeStats = false, passivePhysicalPower = 0, itemGrowth: ItemStatGrowth = {}): void {
    this.ui.showUnitDetail(buildUnitDetailData(this.cfg, cfg, star, {
      skillScale, side, hp, mana, shield, passiveHealth, passiveSpellPower, runtimeStats, passivePhysicalPower, itemGrowth,
      detailKey: this.selectedDetail ? `${this.selectedDetail.kind}:${this.selectedDetail.id}` : `${cfg.id}:${side}:${star}`,
    }));
  }
  private refreshDetailVitals(): void {
    const selected = this.selectedDetail; if (!selected || !this.ui.unitDetailVisible) return;
    if (selected.kind === 'battle') {
      const unit = this.sim.units.find(u => u.id === selected.id);
      if (!unit) { this.selectedDetail = null; this.ui.closeUnitDetail(); return; }
      this.showBattleDetail(unit.id);
    } else {
      const unit = this.owned.get(selected.id);
      if (!unit) { this.selectedDetail = null; this.ui.closeUnitDetail(); return; }
      this.showOwnedDetail(unit.uid);
    }
  }
  private refreshRunUI(): void {
    GameAudio.setMusic(this.flow.phase === 'battle' ? this.flow.wave.encounterKind === 'boss' ? 'boss' : 'battle' : 'prepare');
    this.refreshBackpack();
    this.ui.refreshRun(this.damageHealthBefore ?? this.flow.health, this.cfg.battle.initialHealth, this.flow.waveIndex + 1, this.waves.length, this.flow.wave.name,
      this.flow.wave, this.save.stageCount, this.waves.filter(w => w.stage === this.flow.wave.stage).map(w => w.encounterKind ?? 'normal'));
    this.ui.setRewardStorage(this.save.stageProgress?.unitReserve.length ?? 0);
    const pending = this.session.pendingStageReward;
    const shopEncounter = this.flow.phase === 'prepare' && pending?.kind === 'specialShop';
    if (!pending) this.stageRewardOpen = false;
    if (!this.session.pendingTraitChoice) this.stageRewards.show((pending?.kind==='mixedChest') && !this.stageRewardOpen ? undefined : pending, this.economy.gold);
    this.refreshShopContent();
    this.ui.setShopEncounter(shopEncounter);
    // A real back-row tile keeps the prop away from the central restored enemy portrait.
    const visitorPosition = this.boardNode.getComponent(BoardView)!.cellToWorld(3, 6);
    if (shopEncounter && !this.shopVisitor) this.shopVisitor = new ShopVisitor(this.boardNode,
      visitorPosition, () => this.openStageReward());
    this.shopVisitor?.setVisible(shopEncounter);
    const chestVisible = !!pending && pending.kind !== 'specialShop';
    if (chestVisible && !this.bossChest) this.bossChest = new ShopVisitor(this.boardNode,
      new Vec3(0,0,0), () => this.openStageReward(), 'chest');
    this.bossChest?.setVisible(chestVisible);
    const explorerVisible=this.session.explorerChestVisible;
    const explorerPosition=this.boardNode.getComponent(BoardView)!.cellToWorld(0,3);explorerPosition.x-=72;
    if(explorerVisible&&!this.explorerChest)this.explorerChest=new ShopVisitor(this.boardNode,explorerPosition,()=>this.inspectExplorerChest(),'chest',{
      name:'explorerChest',modelScale:.7,yawDegrees:90,inspectOnClick:true,canEnter:()=>
        !this.transitioning&&!this.rewardFlight&&!this.damageFlight&&!this.draggingId&&this.session.explorerChestVisible});
    this.explorerChest?.setLootCaption(this.session.explorerPoints,sys.isMobile?1.2:1);
    this.explorerChest?.setVisible(explorerVisible);
    if(!explorerVisible||this.flow.phase==='battle')this.ui.hideExplorerChest();
    const portalVisible = this.session.portalAvailable && !this.transitioning;
    if (portalVisible && !this.expeditionPortal) {
      this.expeditionPortal = new Node('expeditionPortal'); this.expeditionPortal.layer = this.boardNode.layer;
      this.boardNode.addChild(this.expeditionPortal);
      this.expeditionPortal.addComponent(ExpeditionPortal).init(this.boardNode.getComponent(BoardView)!.cellToWorld(3, 2), () => {
        if (!this.loaded || this.transitioning || this.rewardFlight || this.draggingId || !this.session.portalAvailable) return;
        if (this.session.pendingStageReward) { this.ui.showWarn('请先领取宝箱奖励'); this.openStageReward(); return; }
        if (this.session.pendingEquipmentReward) { this.showEquipmentReward(); return; }
        GameAudio.play('portal');
        this.expeditionPortal!.getComponent(ExpeditionPortal)!.playEnter(() => {
          if (!this.loaded || !this.session.portalAvailable) return;
          this.portalRequested = true; this.restart();
        });
      });
    }
    if (this.expeditionPortal) this.expeditionPortal.active = portalVisible;
    if (this.session.portalAvailable) for (const unit of this.sim.units) {
      if (unit.side === 1) { const view = this.views.get(unit.id); if (view) view.node.active = false; }
    }
    this.ui.setPortalState(this.session.portalAvailable);
    this.refreshNextWaveButton();
    this.ui.setLocked(this.shop.locked);
    this.ui.refreshDebugState(this.flow.wave.stage!, this.flow.wave.round!, this.save.stageCount);
  }
  private openStageReward(): void {
    if (!this.loaded || this.transitioning || this.draggingId || this.explorerChest?.isOpening || this.flow.phase === 'battle'
      || !this.session.pendingStageReward) return;
    const pending = this.session.pendingStageReward;
    if (!this.stageRewardOpen) GameAudio.play(pending.kind === 'specialShop' ? 'confirm' : 'chest');
    if (pending.kind==='mixedChest') {
      this.chooseStageReward({ type: 'stageChoice', rewardId: pending.id, choice: 'claim' });
      return;
    }
    this.stageRewardOpen = true; this.ui.closeUnitDetail();
    this.stageRewards.show(this.session.pendingStageReward, this.economy.gold);
  }
  private showSettlement(): void {
    const s = this.flow.lastSettlement; if (!s) return;
    const r = this.save.lastReward;
    this.ui.showResult(s.winner, r?.breakdown ?? null, r?.expGained ?? 0, r?.levelUps ?? 0, this.levelSys.level, s);
    this.ui.setPortalState(this.session.portalAvailable);
    this.showEquipmentReward();
  }
  private showEquipmentReward():void {
    if (this.session.pendingStageReward) { if (this.stageRewardOpen) this.openStageReward(); return; }
    const pending=this.session.pendingEquipmentReward;
    if(pending)this.ui.showEquipmentReward(this.cfg.getEquipment(pending.candidates));
  }
  private chooseStageReward(action: StageChoice): void {
    if (this.rewardFlight || this.explorerChest?.isOpening) return;
    const pending = this.session.pendingStageReward;
    const before = pending?.kind==='mixedChest' ? this.owned.snapshot() : [];
    const result = this.session.claimStageReward(action);
    if (!result.ok) { this.ui.showWarn(result.error === 'dice_rolling' ? '请等待摇骰结算' : result.error === 'not_enough_gold' ? '金币不足' : result.error === 'unit_sold_out' ? '该棋子已售罄' : '无法领取该奖励'); return; }
    GameAudio.play(action.choice==='refresh'?'refresh':'reward');
    this.persistShopState();
    if(result.stageReward?.kind==='mixed'){
      if(this.flyMixedChestRewards(result.stageReward,before))return;
      this.finishStageReward();return;
    }
    this.finishStageReward();
  }

  private inspectExplorerChest():void {
    this.ui.showExplorerChest(this.session.explorerPoints,this.session.explorerChestQualityRates,
      this.flow.phase!=='battle'&&this.session.explorerChestOpenable,()=>{
        if(this.transitioning||this.rewardFlight||this.damageFlight||this.draggingId||this.flow.phase==='battle'||!this.session.explorerChestOpenable)return;
        this.explorerChest?.openChest(()=>this.openExplorerChest());
      });
  }

  private openExplorerChest():void {
    if(this.transitioning||this.rewardFlight||this.damageFlight||this.flow.phase==='battle'||!this.session.explorerChestOpenable)return;
    const before=this.owned.snapshot(),result=this.session.act({type:'openExplorerChest'});
    if(!result.ok||result.stageReward?.kind!=='mixed')return;
    GameAudio.play('chest');this.persistShopState();
    this.flyMixedChestRewards(result.stageReward,before,()=>this.explorerChest?.rewardOrigin()??new Vec3(),()=>{
      this.explorerChest?.resetLid();
      this.refreshShopUI();this.refreshEconomyUI();this.refreshRunUI();
    });
  }
  private flyMixedChestRewards(reward: Extract<StageRewardGrant,{kind:'mixed'}>, before: OwnedUnit[], origin?:()=>Vec3, complete?:()=>void): boolean {
    this.refreshOwnedViews(false);this.stageRewards.hide();this.stageRewardOpen=false;this.nextWaveRemaining=null;
    const root=new Node('chestRewardFlight');root.layer=this.ui.node.layer;this.ui.node.addChild(root);
    const transform=root.addComponent(UITransform);transform.setContentSize(1280,720);
    const worldToOverlay=(node:Node,local=new Vec3())=>transform.convertToNodeSpaceAR(node.getComponent(UITransform)!.convertToWorldSpaceAR(local));
    const targets:ChestFlightTarget[]=rewardDeliveryPlan(reward.units,before,this.owned.snapshot()).map(delivery=>{
      const unit=this.cfg.getUnit(delivery.unitId),view=delivery.uid===undefined?undefined:this.ownedViews.get(delivery.uid);
      const old=before.find(u=>u.uid===delivery.uid),upgraded=old&&delivery.uid!==undefined&&this.owned.get(delivery.uid)!.star>old.star;
      return {art:UNIT_ART[unit.artId??unit.id]??UNIT_ART[unit.id],recipient:view?.node,
        position:()=>view?worldToOverlay(view.node,new Vec3(0,18,0)):worldToOverlay(this.ui.node),
        land:upgraded?()=>view?.playStarUpgrade():undefined};
    });
    if(reward.equipmentIds.length){
      const first=reward.equipmentStart??this.owned.equipmentReserve.length-reward.equipmentIds.length;
      this.refreshBackpack();this.ui.prepareBackpackReward(first);
      reward.equipmentIds.forEach((id,index)=>{const slot=this.ui.backpackRewardSlot(first+index);
        targets.push({art:this.cfg.getEquipmentReserve([id])[0].icon,recipient:slot,size:{width:48,height:48},
          position:()=>worldToOverlay(slot??this.ui.backpackRewardAnchor)});});
    }
    if(reward.health>0)targets.push({art:M2_UI_SPRITE.stat_hp,size:{width:48,height:48},position:()=>worldToOverlay(this.ui.healthRewardAnchor),land:()=>this.refreshRunUI()});
    if(reward.gold>0)targets.push({art:UI_SPRITE.iconGold,size:{width:40,height:40},position:()=>worldToOverlay(this.ui.goldRewardAnchor),land:()=>this.refreshEconomyUI()});
    const flight=this.rewardFlight=root.addComponent(ChestRewardFlight);
    flight.play(()=>worldToOverlay(this.boardNode,origin?origin():this.bossChest?.rewardOrigin()??new Vec3()),targets,()=>{
      this.rewardFlight=null;if(complete)complete();else this.finishStageReward(false);
      this.ui.showWarn([reward.units.length?`棋子×${reward.units.length}`:'',reward.equipmentIds.length?`装备×${reward.equipmentIds.length}`:'',reward.health?`生命+${reward.health}`:'',reward.gold?`金币+${reward.gold}`:''].filter(Boolean).join(' · '));
    });
    return true;
  }
  private finishStageReward(refreshOwned = true): void {
    if (refreshOwned) this.refreshOwnedViews();
    this.refreshShopUI(); this.refreshEconomyUI(); this.refreshRunUI();
    if (this.flow.wave.encounterKind === 'monster' && this.session.canAdvanceWave()) {
      this.restart(); return;
    }
    this.scheduleNextWave();
  }

  private manualEncounter(): boolean {
    const kind = this.flow.wave.encounterKind;
    return kind === 'specialShop';
  }

  private refreshNextWaveButton(): void {
    this.ui.setNextWaveVisible(!this.transitioning && this.manualEncounter()
      && (this.flow.phase === 'settlement' || (this.flow.phase === 'prepare'
        && this.session.pendingStageReward?.kind === 'specialShop')));
  }

  private nextSpecialEncounter(): void {
    if (!this.loaded || this.transitioning || this.draggingId || !this.manualEncounter()) return;
    const pending = this.session.pendingStageReward;
    if (pending?.kind === 'specialShop' && this.flow.phase === 'prepare') {
      this.chooseStageReward({ type: 'stageChoice', rewardId: pending.id, choice: 'continue' });
      if (this.session.pendingStageReward) return;
      this.resultShown = true;
      if (this.session.flow.phase === 'ended') { this.showSettlement(); return; }
    } else if (pending) { this.ui.showWarn('请先点击宝箱领取奖励'); return; }
    this.restart();
  }


  private startFight() {
    if (this.transitioning || this.rewardFlight || this.explorerChest?.isOpening) return;
    if (this.session.pendingStageReward) { this.openStageReward(); return; }
    if (this.transitioning || this.fighting || !this.loaded || this.flow.phase !== 'prepare' || this.draggingId) return;
    if (this.owned.onBoard().length === 0) {
      this.ui.showWarn('请先将棋子拖到己方棋盘');
      return;
    }
    this.resetDrag();
    if (!this.session.startBattle()) return;
    this.refreshRunUI();
    GameAudio.setMusic(this.flow.wave.encounterKind === 'boss' ? 'boss' : 'battle');
    GameAudio.play(this.flow.wave.encounterKind === 'boss' ? 'boss_start' : 'battle_start');
    this.persistShopState();
    this.fighting = true;
    this.resultShown = false;
    this.ui.hideFightBtn();
    this.ui.setNextWaveVisible(false);
    this.ui.setShopVisible(true); this.ui.setCombatActive(true);
    this.resetBattle(true);
    this.combatStats.begin(this.sim.units);
    this.ui.refreshCombatStats(this.combatStats.snapshot());
    const seconds = this.cfg.battle.preparationSeconds ?? 1;
    this.preparationRemaining = Number.isFinite(seconds) ? Math.max(0, seconds) : 1;
    this.ui.setCombatCountdown(this.preparationRemaining, seconds);
  }

  private restart() {
    if (this.transitioning || this.rewardFlight || this.damageFlight || this.explorerChest?.isOpening) return;
    if (this.session.portalAvailable && !this.portalRequested) return;
    if (this.session.pendingStageReward) { this.openStageReward(); return; }
    if(this.session.pendingEquipmentReward){this.showEquipmentReward();return;}
    if (!this.resultShown || !['settlement', 'ended'].includes(this.flow.phase)) return;
    this.transitioning = true;
    if (this.expeditionPortal) this.expeditionPortal.active = false;
    this.ui.setNextWaveVisible(false);
    this.nextWaveRemaining = null;
    this.resetDrag();
    this.ui.playWaveTransition(() => {
      this.advanceWave();
      return this.flow.wave;
    }, () => { this.transitioning = false; this.refreshNextWaveButton(); });
  }

  /** Swap the board only while the transition curtain is fully covering it. */
  private advanceWave(): void {
    const ended = this.flow.phase === 'ended';
    this.nextWaveRemaining = null;
    this.stageRewardOpen = false;
    this.ui.hideResult();
    this.fighting = false;
    this.preparationRemaining = 0;
    this.resultShown = false;
    this.resetDrag();
    if (this.portalRequested) {
      this.session.enterPortal(); this.portalRequested = false;
    } else if (ended) {
      this.session = new RunSession(this.cfg, this.runConfig, this.waveTemplates, { stageCount: DEFAULT_STAGE_COUNT, runSeed: this.runConfig.starterSelection ? freshRunSeed(this.save.runSeed) : this.save.runSeed,
        enemyDifficulty:this.enemyDifficulty, enemyPower:this.enemyPower,formationConfig:this.formationConfig,enemyRoles:this.enemyRoles,equipmentPolicy:this.equipmentPolicy, openingEncounter: true });
    } else { this.session.nextWave(); }
    this.save.floor = this.flow.wave.stage!; this.save.lastReward = undefined;
    GameAudio.play('wave');
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
    this.refreshEconomyUI();
    this.ui.setCombatActive(false);
    this.ui.setShopVisible(true);
    this.ui.showFightBtn();
    this.refreshRunUI();
  }

  // ─── 商店操作（准备 / 战斗均可，结算面板期间锁定） ───

  private canManageShop(): boolean {
    return this.loaded && !this.session.pendingTraitChoice && !this.transitioning && !this.rewardFlight && !this.draggingId && (this.flow.phase === 'prepare' || this.flow.phase === 'battle');
  }

  private debugGrantGold(amount: number): void {
    if (!this.canManageShop()) return;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000) return;
    // Match the save format's gold limit so reloading never silently removes a grant.
    const gained = Math.min(amount, Math.max(0, 999999 - this.economy.gold));
    if (gained === 0) { this.ui.showWarn('金币已达999999上限'); return; }
    this.economy.add(gained);
    this.persistShopState(); this.refreshEconomyUI();
    this.ui.showWarn(`已获得${gained}金币`);
  }

  private debugGrantUnit(id: string, star: number): void {
    if (!this.canManageShop() || this.flow.phase !== 'prepare') { this.ui.showWarn('仅准备阶段可领取棋子'); return; }
    if (!Number.isInteger(star) || star < 1 || star > 3 || !this.cfgUnits().some(unit => unit.id === id)) return;
    const copies = 3 ** (star - 1);
    if (this.pool.count(id) < copies) { this.ui.showWarn(`卡池不足，需要${copies}张`); return; }
    const benchFree = this.owned.inBench().length < this.save.benchSlots;
    if (!benchFree && (star === 3 || this.owned.all().filter(unit => unit.unitId === id && unit.star === star).length < 2)) {
      this.ui.showWarn('备战席已满'); return;
    }
    try {
      this.owned.transaction(() => {
        if (benchFree) {
          if (!this.owned.addToBench(id, this.save.benchSlots, -1, star)) throw new Error('Bench full');
        } else {
          this.owned.forceAdd(id, star); this.owned.tryMerge(id);
          if (this.owned.inBench().some(unit => unit.y < 0)) throw new Error('Merge did not release temporary slot');
        }
      });
    } catch { this.ui.showWarn('备战席已满'); return; }
    for (let i = 0; i < copies; i++) this.pool.take(id);
    this.refreshOwnedViews(); this.persistShopState(); this.refreshShopUI();
    this.ui.showWarn(`已获得${star}星${this.cfg.getUnit(id).name}`);
  }

  private debugJumpStage(stage: number, round: number): void {
    if (!this.loaded || this.transitioning || this.draggingId || this.explorerChest?.isOpening || !Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE_COUNT
      || !Number.isInteger(round) || round < 1 || round > stageRoundCount(stage, this.runConfig)) return;
    if (!this.session.debugJump(stage, round)) return;
    this.stageRewardOpen = false;
    this.nextWaveRemaining = null; this.preparationRemaining = 0;
    this.fighting = false; this.resultShown = false;
    this.resetDrag();
    this.save.floor = stage; this.save.lastReward = undefined;
    this.ui.hideResult(); this.ui.setCombatActive(false); this.ui.setCombatCountdown(0, 0);
    this.ui.setShopVisible(true); this.ui.showFightBtn();
    this.resetBattle(false);
    this.combatStats.begin(this.sim.units); this.ui.refreshCombatStats(this.combatStats.snapshot());
    this.persistShopState(); this.refreshShopUI(); this.refreshEconomyUI(); this.refreshRunUI();
    this.ui.showWarn(`已跳转到${stage}-${round}`);
  }
  private onBoardZoomChanged(zoom: number): void { this.ui.setCameraZoom(zoom); }
  onDestroy(): void {
    if(this.damageFlight){this.damageFlight.cancel();this.damageFlight.node.destroy();this.damageFlight=null;}
    this.node.parent?.off(BOARD_PINCH_START, this.cancelBoardDrag, this);
    this.node.parent?.off(BOARD_ZOOM_CHANGED, this.onBoardZoomChanged, this);
    this.unschedule(this.finishInitialLoading);
    this.loadScreen?.finish(); this.loadScreen = null;
    this.stageRewards?.hide();
    if (this.rewardFlight) { this.rewardFlight.cancel(); this.rewardFlight.node.destroy(); this.rewardFlight = null; }
    this.shopVisitor?.dispose(); this.bossChest?.dispose();this.explorerChest?.dispose();
  }
  private refreshEconomyUI(): void {
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys, this.shop.costRates());
    this.ui.refreshIncome(this.session.incomePreview);
    this.ui.setFreeRefreshes(this.session.freeRefreshes);
    // Merchant prices and button callbacks capture the displayed balance. Rebuild after
    // any wallet change, including unit sales, instead of waiting for the next wave.
    const pending = this.session.pendingStageReward;
    if (pending?.kind === 'specialShop' && !this.session.pendingTraitChoice) this.stageRewards.show(pending, this.economy.gold);
  }

  private buyFromShop(slot: number) {
    if (!this.canManageShop()) return;
    const r = this.session.buyShopSlot(slot);
    if (r.error) {
      const msg = r.error === 'not_enough_gold' ? '金币不足'
        : r.error === 'bench_full' ? '备战席已满'
        : r.error === 'pool_empty' ? '卡池已空'
        : '无法购买';
      this.ui.showWarn(msg);
      GameAudio.play('error');
      return;
    }
    GameAudio.play('buy');
    this.refreshOwnedViews();
    this.persistShopState();
    this.refreshShopUI();
    this.refreshEconomyUI();
  }

  private refreshShop() {
    if (!this.canManageShop()) return;
    const err = this.session.refreshShop().error;
    if (err) {
      this.ui.showWarn(err === 'not_enough_gold' ? '金币不足' : '刷新失败');
      GameAudio.play('error');
      return;
    }
    GameAudio.play('refresh');
    this.persistShopState();
    this.refreshShopUI();
    this.refreshEconomyUI();
  }

  private buyExperience(): void {
    if (!this.canManageShop()) return;
    const previousLevel = this.levelSys.level;
    const result = this.session.buyExp();
    if (!result.ok) { this.ui.showWarn(result.error === 'max_level' ? '已达最高等级' : '金币不足'); return; }
    GameAudio.play(this.levelSys.level > previousLevel ? 'level_up' : 'confirm');
    this.persistShopState();
    this.refreshEconomyUI();
  }

  private persistShopState() {
    this.session.persist(writeRunSave);
    this.refreshBackpack();
  }

  private refreshShopUI() {
    const deployed=new Set(this.owned.onBoard().map(unit=>unit.unitId));
    const slots = this.shop.slots.map(s => {
      if (!s.unitId) return { unitId: null, name: '', cost: 0, price: 0, poolLeft: 0 };
      const cfg = this.unitMap().get(s.unitId)!;
      const cost = (cfg.cost ?? 1) as Cost;
      return {
        unitId: s.unitId,
        name: cfg.name,
        cost, price: unitPrice(cost),
        poolLeft: this.pool.count(s.unitId),
        deployed: deployed.has(s.unitId),
        upgradeStar: this.owned.purchaseUpgradeStar(s.unitId),
        artId:cfg.artId, role:cfg.role, damageType:cfg.damageType, tint:cfg.tint,
      };
    });
    this.ui.refreshShop(slots);
    this.refreshShopContent();
  }

  private refreshShopContent(): void {
    this.ui.setOpeningShopLocked(this.session.openingShopLocked);
    const traitChoice = this.session.pendingTraitChoice;
    if (traitChoice) {
      this.ui.setShopContentOccupied(true); this.ui.hideOpeningEncounter(); this.ui.hideFightBtn();
      const identity=JSON.stringify(traitChoice);
      if(this.traitChoiceIdentity!==identity){
        this.traitChoiceIdentity=identity;this.ui.hideExplorerChest();this.ui.closeUnitDetail();this.ui.revealShopContent();
      }
      this.stageRewards.showTraitChoice(traitChoice, this.owned.all(), index => {
        if (!this.session.chooseEquipmentTrait(index).ok) return;
        this.persistShopState(); this.resetBattle(false); this.refreshRunUI(); this.showOwnedDetail(traitChoice.uid);
      });
      return;
    }
    this.traitChoiceIdentity='';
    const pending = this.session.pendingStageReward;
    // Keep the outgoing shop hidden until advanceWave swaps the encounter under the curtain.
    const boardChest=pending&&pending.kind==='mixedChest';
    const stageContent = this.flow.wave.encounterKind === 'specialShop' || (!!pending && (!boardChest || this.stageRewardOpen));
    this.ui.setShopContentOccupied(stageContent || this.session.pendingOpeningEncounter || !!this.session.pendingEquipmentReward);
    if (this.session.pendingOpeningEncounter) {
      const rules = this.runConfig.openingEncounter!;
      this.ui.showOpeningEncounter(rules.name, this.session.openingEncounterOptions, id => {
        if (!this.session.chooseOpeningEncounter(id).ok) return;
        GameAudio.play('confirm');
        this.persistShopState(); this.refreshShopUI(); this.refreshEconomyUI(); this.refreshRunUI();
      });
      this.ui.hideFightBtn();
    } else {
      this.ui.hideOpeningEncounter();
      if (this.flow.phase === 'prepare' && !stageContent && !this.fighting) this.ui.showFightBtn();
    }
  }

  /** 一场战斗只结算一次（由 resultShown 保证）。 */
  private scheduleNextWave(): void {
    const delay = this.cfg.battle.nextWaveDelaySeconds ?? 1;
    this.nextWaveRemaining = !this.manualEncounter() && this.session.canAdvanceWave()
      ? (Number.isFinite(delay) ? Math.max(0, delay) : 1) : null;
    this.refreshNextWaveButton();
  }

  private settleBattleEnd() {
    if (this.combatStats.consume(this.sim.events)) this.ui.refreshCombatStats(this.combatStats.snapshot());
    // A battle can finish while dragging a reserve unit; roll that gesture back first.
    if (this.draggingId) {
      const owned = this.owned.get(this.draggingId);
      if (owned && this.dragging) this.dragging.node.setPosition(this.benchSlotWorld(owned.y));
      this.resetDrag();
    }
    const settlement = this.session.settleBattle();
    if (!settlement) return;
    // Reward changes may rebuild an unfinished preview. It must stay idle during settlement.
    this.fighting = false;
    this.preparationRemaining = 0;
    this.refreshOwnedViews();
    // Persist settlement, currency/XP and the frozen pending candidates together before presenting any controls.
    this.persistShopState();
    const { round, reward } = settlement;
    GameAudio.play(round.winner === 0 ? 'victory' : 'defeat');
    const { breakdown, expGained, levelUps } = reward;
    this.ui.setShopVisible(false);
    const present=()=>{
      this.ui.showResult(round.winner,breakdown,expGained,levelUps,this.levelSys.level,round);
      this.refreshEconomyUI();this.persistShopState();this.refreshRunUI();
      this.showEquipmentReward();this.scheduleNextWave();
    };
    if(round.healthLost>0)this.playHealthLoss(round.healthLost,present);else present();
  }

  private playHealthLoss(damage:number,finish:()=>void):void {
    const root=new Node('playerDamageFlight');root.layer=this.ui.node.layer;this.ui.node.addChild(root);
    const transform=root.addComponent(UITransform);
    transform.setContentSize(this.ui.node.getComponent(UITransform)!.contentSize);
    const sources=this.sim.units.filter(u=>u.side===1&&u.alive).flatMap(u=>{
      const node=this.views.get(u.id)?.node;if(!node?.isValid)return [];
      return [transform.convertToNodeSpaceAR(node.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0,this.cellSize*.35,0)))];
    });
    this.nextWaveRemaining=null;this.ui.setNextWaveVisible(false);
    this.damageHealthBefore=this.flow.health+damage;this.refreshRunUI();
    // The overlay stays above result/reward controls rebuilt by refreshRunUI.
    root.setSiblingIndex(this.ui.node.children.length-1);
    this.damageFlight=root.addComponent(PlayerDamageFlight);
    this.damageFlight.play(sources,()=>transform.convertToNodeSpaceAR(this.ui.healthRewardAnchor.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(0,-12,0))),damage,
      ()=>{this.damageHealthBefore=null;this.refreshRunUI();root.setSiblingIndex(this.ui.node.children.length-1);},
      ()=>{this.damageFlight=null;finish();});
  }

  update(dt: number) {
    if(this.loaded)this.stageRewards?.update(dt);
    if (!this.loaded || !this.sim || this.transitioning || this.rewardFlight || this.damageFlight || this.explorerChest?.isOpening) return;
    if (this.nextWaveRemaining !== null) {
      if(this.session.pendingEquipmentReward||this.session.pendingStageReward){this.nextWaveRemaining=null;return;}
      this.nextWaveRemaining = Math.max(0, this.nextWaveRemaining - Math.max(0, dt));
      if (this.nextWaveRemaining === 0) { this.restart(); return; }
    }
    const wasFinished = this.sim.finished;
    if (this.flow.phase === 'battle' && this.fighting && !this.sim.finished) {
      if (this.preparationRemaining > 0) {
        const elapsed = Math.min(Math.max(0, dt), this.preparationRemaining);
        this.preparationRemaining = Math.max(0, this.preparationRemaining - elapsed);
        dt -= elapsed;
        this.ui.setCombatCountdown(this.preparationRemaining, this.cfg.battle.preparationSeconds ?? 1);
        if (this.preparationRemaining > 0 || dt <= 0) return;
      }
      this.driver.advance(dt * this.speed);
      this.ui.setBattleTimer(this.sim.clockState);
      this.replayer.consumeEvents();
      this.replayer.syncViews(dt, this.driver.interpolation, this.speed);
      if (this.combatStats.consume(this.sim.events)) this.ui.refreshCombatStats(this.combatStats.snapshot());
    }
    if (this.flow.phase === 'battle' && this.sim.finished && !this.resultShown) {
      this.resultShown = true;
      this.replayer.consumeEvents();
      this.settleBattleEnd();
    }
    if (wasFinished && this.sim.finished && (this.flow.phase === 'settlement' || this.flow.phase === 'ended')) this.replayer.syncViews(dt, 0, this.speed);
    this.refreshDetailVitals();
  }
}
