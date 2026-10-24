import { _decorator, Component, Node, resources, JsonAsset, Vec3, UITransform, EventTouch, director } from 'cc';
import { ConfigManager, BattleConfigData } from '../core/ConfigManager';
import { BattleSim } from '../battle/BattleSim';
import { resolveTraits } from '../battle/Traits';
import { EquipmentConfigData } from '../battle/types';
import { TickDriver } from '../core/TickDriver';
import { CombatStatistics } from '../battle/CombatStatistics';
import { buildUnitDetailData } from '../ui/UnitDetailPresentation';
import { BoardView } from './BoardView';
import { UnitView } from './UnitView';
import { ShopVisitor } from './ShopVisitor';
import { ExpeditionPortal } from './ExpeditionPortal';
import { ChestRewardFlight } from './ChestRewardFlight';
import { rewardDeliveryPlan } from './RewardDeliveryPlan';
import type { OwnedUnit } from '../core/OwnedUnits';
import { UNIT_ART } from './ArtPaths';
import { BattleReplayer } from './BattleReplayer';
import { GameAudio } from './GameAudio';
import { FloatingRuinsBoard } from './FloatingRuinsBoard';
import { GameLoadingOverlay } from '../ui/GameLoadingOverlay';
import { BattleUI } from '../ui/BattleUI';
import { StageRewardPanel } from '../ui/StageRewardPanel';
import { freshRunSeed } from '../core/RunRandomContext';
import type { StageChoice } from '../core/StageProgression';
import { loadSaveV2, writeSaveV2 } from '../core/ShopSave';
import { RunSession } from '../core/RunSession';
import { COST_PRICE, Cost, sellPrice } from '../core/ShopConfig';
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
  private expeditionPortal: Node | null = null;
  private portalRequested = false;
  private stageRewardOpen = false;
  private rewardFlight: ChestRewardFlight | null = null;
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
    this.loadScreen = GameLoadingOverlay.show(this.node.parent ?? this.node, '正在布置棋盘');
    try {
      const loadedSave = loadSaveV2();
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
    this.stageRewards = new StageRewardPanel(uiNode, this.cfg, action => this.chooseStageReward(action), () => {
      this.stageRewardOpen = false; this.stageRewards.hide();
    }, item => {
      if (item) { this.selectedDetail = null; this.ui.showEquipmentDetail(item); }
      else this.ui.hideEquipmentDetail();
    });
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
    };
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
  }

  private createSim(battle: boolean) {
    const preview = this.session.createPreview();
    this.battleIds = preview.battleIds;
    this.sim = battle ? this.session.battle! : preview.sim;
  }

  private createViews() {
    const bv = this.boardNode.getComponent(BoardView)!;
    const old = this.boardNode.getChildByName('units');
    if (old) { old.removeFromParent(); old.destroy(); }
    const root = new Node('units');
    const ut = root.addComponent(UITransform);
    ut.setContentSize(Math.max(bv.boardPixelW, this.save.benchSlots * 64), bv.boardPixelH + 180);
    this.boardNode.addChild(root);
    this.views.clear();
    this.ownedViews.clear();
    this.benchViews.clear();

    // 棋盘上的双方视图严格使用 sim id，回放事件不会与 owned uid 混用。
    for (const u of this.sim.units) {
      const uv = this.makeUnitView(root, u.cfg.id, u.side, u.id, bv.cellToWorld(u.x, u.y));
      this.views.set(u.id, uv);
      uv.setStar(u.star); uv.setEquipment(u.equipment);
    }
    for (const ou of this.owned.onBoard()) {
      const uv = this.views.get(this.battleIds.get(ou.uid)!)!;
      this.ownedViews.set(ou.uid, uv);
    }
    // The independent 3D reserve modules share these exact hit centers.
    for (let slot = 0; slot < this.save.benchSlots; slot++) {
      const node = new Node(`bench_${slot}`);
      node.addComponent(UITransform).setContentSize(62, 50);
      node.setPosition(this.benchSlotWorld(slot));
      root.addChild(node);
    }
    this.createBenchViews(root);
    for (const ou of this.owned.all()) {
      const uv = this.ownedViews.get(ou.uid)!;
      uv.setStar(ou.star); uv.setEquipment(this.cfg.getEquipment(ou.equipment));
    }
  }

  /** Refresh only reserve units during combat; keep the active army and event cursor intact. */
  private createBenchViews(root: Node): void {
    const old = root.getChildByName('benchUnits');
    if (old) { old.removeFromParent(); old.destroy(); }
    for (const uid of this.benchViews) this.ownedViews.delete(uid);
    this.benchViews.clear();
    const bench = new Node('benchUnits'); root.addChild(bench);
    for (const ou of this.owned.inBench()) {
      const uv = this.makeUnitView(bench, ou.unitId, 0, ou.uid, this.benchSlotWorld(ou.y), 0.82 * 1.3);
      uv.setVitalsVisible(false);
      uv.setStar(ou.star); uv.setEquipment(this.cfg.getEquipment(ou.equipment)); this.ownedViews.set(ou.uid, uv); this.benchViews.add(ou.uid);
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
    this.ui.refreshFormation(this.owned.all(), this.cfgUnits());
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

  /** 每次改变布阵或切换阶段，模拟器、视图和事件游标一起重建。 */
  private resetBattle(battle: boolean): void {
    this.selectedDetail = null; this.ui.closeUnitDetail();
    this.createSim(battle);
    this.createViews();
    this.ui.refreshFormation(this.owned.all(), this.cfgUnits());
    this.ui.refreshTraits(resolveTraits(this.cfg.battle.traits ?? [], this.sim.units.filter(u => u.side === 0).map(u => u.cfg), this.cfgUnits()), this.cfgUnits());
    const bv = this.boardNode.getComponent(BoardView)!;
    bv.showAstralFields(this.sim.astralFields);
    this.replayer.bind(this.sim, this.views, this.cellSize, bv, this.cfg.battle.tickMs);
    const oldFx = this.boardNode.getChildByName('fx');
    if (oldFx) { oldFx.removeFromParent(); oldFx.destroy(); }
    const fx = new Node('fx');
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
    for (const u of this.sim.units.filter(u => u.side === 1)) {
      this.views.get(u.id)!.node.on(Node.EventType.TOUCH_END, () => this.showBattleDetail(u.id));
    }
  }

  private bindOwnedTouch(uid: number, uv: UnitView): void {
    uv.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    uv.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    uv.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
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
    if (!this.canManageShop()) return;
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
    if (!bestId || bestDist > (this.cellSize * 0.6) ** 2) return;

    const uv = this.ownedViews.get(bestId);
    if (!uv) return;
    this.boardNode.getComponent(BoardView)!.interactionActive = true;
    this.draggingId = bestId;
    this.dragging = uv;
    this.dragStart.set(boardPos.x, boardPos.y, 0); this.dragMoved = false;
    this.touchOffset.set(boardPos.x - uv.node.position.x, boardPos.y - uv.node.position.y, 0);
    uv.node.setScale(1.15, 1.15, 1);
  }

  private onTouchMove(event: EventTouch) {
    if (!this.draggingId || !this.dragging) return;
    const boardPos = this.touchToBoard(event);
    if (Math.hypot(boardPos.x - this.dragStart.x, boardPos.y - this.dragStart.y) > 8) this.dragMoved = true;
    if (!this.dragMoved) return;
    this.selectedDetail = null;
    this.dragging.node.setPosition(boardPos.x - this.touchOffset.x, boardPos.y - this.touchOffset.y, 0);
    const u = this.owned.get(this.draggingId)!;
    const selling = this.overSell(event);
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
      && (u.location === 'board' || !!this.owned.atBoard(cell.x, cell.y) || population <= this.levelSys.unitCap), this.cfg.getUnit(u.unitId).range);
    this.ui.showSellPreview(this.cfg.getUnit(u.unitId).name,
      sellPrice(this.pool.costOfUnit(u.unitId), u.star), selling, population);
  }

  private onTouchEnd(event: EventTouch) {
    if (!this.draggingId || !this.dragging) return;
    const uv = this.dragging;
    const bv = this.boardNode.getComponent(BoardView)!;
    uv.node.setScale(1, 1, 1);

    const curPos = uv.node.position;
    const cell = bv.worldToCell(curPos.x, curPos.y);

    const ou = this.owned.get(this.draggingId);
    if (!ou) { this.resetDrag(); return; }
    if (event.type !== Node.EventType.TOUCH_CANCEL && !this.dragMoved) {
      uv.node.setPosition(ou.location === 'board' ? bv.cellToWorld(ou.x, ou.y) : this.benchSlotWorld(ou.y));
      this.resetDrag(); this.showOwnedDetail(ou.uid); return;
    }
    if (event.type !== Node.EventType.TOUCH_CANCEL && this.overSell(event)) {
      if (this.session.sellUnit(ou.uid).ok) GameAudio.play('sell');
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
      if (this.session.moveUnit(ou.uid, { location: 'bench', x: -1, y: benchSlot }).ok) GameAudio.play('place');
      this.resetDrag();
      this.refreshOwnedViews();
      this.persistShopState();
      return;
    }

    // 上阵人数检查（board 目标格为空且当前上阵数已满 → 拒绝）
    const occupant = this.owned.atBoard(cell.x, cell.y);
    if (!occupant && ou.location === 'bench') {
      const cap = this.levelSys.unitCap;
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
    if (this.session.moveUnit(ou.uid, { location: 'board', x: cell.x, y: cell.y }).ok) GameAudio.play('place');
    const target = bv.cellToWorld(cell.x, cell.y);
    uv.node.setPosition(target.x, target.y, 0);
    // 若发生合并，uv 可能已失效——重建视图
    this.resetDrag();
    this.resetBattle(false);
    this.persistShopState();
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
    let uid = this.selectedDetail?.kind === 'owned' ? this.selectedDetail.id : 0;
    if (event) {
      const point = this.touchToBoard(event); uid = 0; let best = (this.cellSize * 0.65) ** 2;
      for (const [candidate, view] of this.ownedViews) {
        const p = view.node.position, distance = (point.x - p.x) ** 2 + (point.y - p.y) ** 2;
        if (distance < best) { best = distance; uid = candidate; }
      }
    }
    if (!uid) { this.ui.showWarn('先选择棋子，或把装备拖到棋子身上'); return; }
    if (!this.session.equipItem(uid, reserveIndex).ok) { this.ui.showWarn('该棋子已装备3件'); return; }
    GameAudio.play('equip');
    this.persistShopState(); this.resetBattle(false); this.refreshRunUI(); this.showOwnedDetail(uid);
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
  private changeEquipment(slot: number): void {
    if (!this.canManageShop() || this.flow.phase !== 'prepare' || this.selectedDetail?.kind !== 'owned') return;
    const uid = this.selectedDetail.id, unit = this.owned.get(uid); if (!unit) return;
    if (slot < (unit.equipment?.length ?? 0)) { if (this.session.unequipItem(uid, slot).ok) GameAudio.play('equip'); }
    else return;
    this.persistShopState(); this.resetBattle(false); this.refreshRunUI(); this.showOwnedDetail(uid);
  }
  private showOwnedDetail(uid: number): void {
    const u = this.owned.get(uid); if (!u) return;
    this.selectedDetail = { kind: 'owned', id: uid };
    const base = this.cfg.getUnit(u.unitId);
    const deployed = this.owned.onBoard().some(unit => unit.uid === uid);
    const previewUnit = deployed ? this.sim.units.find(unit => unit.id === this.battleIds.get(uid)) : null;
    const scaled = this.cfg.scaleUnit(base, u.star); scaled.hp += u.permanentMaxHp ?? 0;
    const cfg = previewUnit ? { ...previewUnit.cfg, damageAmp: previewUnit.damageAmp, lifesteal: previewUnit.lifesteal } : this.cfg.equipmentStats(scaled, u.equipment);
    cfg.atkSpeed = Math.min(this.cfg.battle.attackSpeedCap ?? 5, cfg.atkSpeed + this.cfg.getEquipment(u.equipment).reduce((sum, item) => sum + item.attackSpeedBonus + (item.healthStance?.attackSpeedBonus ?? 0), 0));
    this.ui.showEquipment(this.cfg.getEquipment(u.equipment), this.canManageShop() && this.flow.phase === 'prepare', 0);
    this.showDetail(u.star, cfg, this.cfg.battle.starScaling[u.star - 1].skill, 0, cfg.hp, cfg.startMana, 0, previewUnit?.soulLampHealth ?? u.soulLampHealth ?? 0);
  }
  private showBattleDetail(id: number): void {
    const unit = this.sim.units.find(u => u.id === id); if (!unit) return;
    this.selectedDetail = { kind: 'battle', id };
    this.ui.showEquipment(unit.equipment, false, unit.equipmentAttackStacks, unit.equipmentDamageStacks);
    this.showDetail(unit.star, { ...unit.cfg, armor: unit.armor, mr: unit.mr, atkSpeed: unit.attackSpeed, damageAmp: unit.damageAmp, lifesteal: unit.lifesteal, damageReduction: unit.damageReductionAt(this.sim.tick) }, unit.skillScale, unit.side, unit.hp, unit.mana, unit.shield, unit.soulLampHealth);
  }
  private showDetail(star: number, cfg: UnitConfigData, skillScale: number, side: 0 | 1, hp: number, mana: number, shield = 0, passiveHealth = 0): void {
    this.ui.showUnitDetail(buildUnitDetailData(this.cfg, cfg, star, {
      skillScale, side, hp, mana, shield, passiveHealth,
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
    this.ui.refreshRun(this.flow.health, this.cfg.battle.initialHealth, this.flow.waveIndex + 1, this.waves.length, this.flow.wave.name,
      this.flow.wave, this.save.stageCount, this.waves.filter(w => w.stage === this.flow.wave.stage).map(w => w.encounterKind ?? 'normal'));
    this.ui.setRewardStorage(this.save.stageProgress?.unitReserve.length ?? 0, this.save.stageProgress?.unitCredit ?? 0);
    const pending = this.session.pendingStageReward;
    const shopEncounter = this.flow.phase === 'prepare' && pending?.kind === 'specialShop';
    if (!pending) this.stageRewardOpen = false;
    if (!this.session.pendingTraitChoice) this.stageRewards.show((pending?.kind === 'unitBundle' || pending?.kind === 'bossChoice') && !this.stageRewardOpen ? undefined : pending, this.economy.gold);
    this.refreshShopContent();
    this.ui.setShopEncounter(shopEncounter);
    // A real back-row tile keeps the prop away from the central restored enemy portrait.
    const visitorPosition = this.boardNode.getComponent(BoardView)!.cellToWorld(3, 6);
    if (shopEncounter && !this.shopVisitor) this.shopVisitor = new ShopVisitor(this.boardNode,
      visitorPosition, () => this.openStageReward());
    this.shopVisitor?.setVisible(shopEncounter);
    const chestVisible = !!pending && pending.kind !== 'specialShop';
    if (chestVisible && !this.bossChest) this.bossChest = new ShopVisitor(this.boardNode,
      visitorPosition, () => this.openStageReward(), 'chest');
    this.bossChest?.setVisible(chestVisible);
    const portalVisible = this.session.portalAvailable && !this.transitioning;
    if (portalVisible && !this.expeditionPortal) {
      this.expeditionPortal = new Node('expeditionPortal'); this.expeditionPortal.layer = this.boardNode.layer;
      this.boardNode.addChild(this.expeditionPortal);
      this.expeditionPortal.addComponent(ExpeditionPortal).init(this.boardNode.getComponent(BoardView)!.cellToWorld(1, 6), () => {
        if (!this.loaded || this.transitioning || this.rewardFlight || this.draggingId || !this.session.portalAvailable) return;
        if (this.session.pendingStageReward) { this.ui.showWarn('请先领取宝箱奖励'); this.openStageReward(); return; }
        if (this.session.pendingEquipmentReward) { this.showEquipmentReward(); return; }
        GameAudio.play('portal'); this.portalRequested = true; this.restart();
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
    if (!this.loaded || this.transitioning || this.draggingId || this.flow.phase === 'battle'
      || !this.session.pendingStageReward) return;
    const pending = this.session.pendingStageReward;
    if (!this.stageRewardOpen) GameAudio.play(pending.kind === 'specialShop' ? 'confirm' : 'chest');
    if (pending.kind === 'bossChoice' || (this.flow.wave.encounterKind === 'monster' && pending.kind === 'unitBundle')) {
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
    if (this.rewardFlight) return;
    const pending = this.session.pendingStageReward;
    let rewards = pending?.kind === 'unitBundle' && action.choice === 'claim' ? [...pending.units] : [];
    const before = rewards.length || pending?.kind === 'bossChoice' ? this.owned.snapshot() : [];
    const result = this.session.claimStageReward(action);
    if (!result.ok) { this.ui.showWarn(result.error === 'not_enough_gold' ? '金币不足' : result.error === 'unit_sold_out' ? '该棋子已售罄' : '无法领取该奖励'); return; }
    GameAudio.play('reward');
    if (result.stageReward?.kind === 'units') rewards = result.stageReward.units;
    else if (result.stageReward?.kind === 'equipment') this.ui.showWarn(`获得装备：${this.cfg.getEquipmentReserve([result.stageReward.equipmentId])[0].name}`);
    else if (result.stageReward?.kind === 'health') this.ui.showWarn(result.stageReward.amount ? `恢复 ${result.stageReward.amount} 点生命` : '生命已满');
    this.persistShopState();
    if (rewards.length && this.flyChestRewards(rewards, before)) return;
    this.finishStageReward();
  }

  private flyChestRewards(rewards: string[], before: OwnedUnit[]): boolean {
    const plan = rewardDeliveryPlan(rewards, before, this.owned.snapshot());
    if (!plan.length) return false;
    // Core ownership is already committed. Refresh real landing nodes, but hide recipients until arrival.
    this.refreshOwnedViews(false); this.stageRewards.hide(); this.stageRewardOpen = false;
    this.nextWaveRemaining = null;
    const root = new Node('chestRewardFlight'); root.layer = this.ui.node.layer; this.ui.node.addChild(root);
    const transform = root.addComponent(UITransform); transform.setContentSize(1280, 720);
    const worldToOverlay = (node: Node, local = new Vec3()): Vec3 => transform.convertToNodeSpaceAR(
      node.getComponent(UITransform)!.convertToWorldSpaceAR(local));
    const flight = this.rewardFlight = root.addComponent(ChestRewardFlight);
    const targets = plan.map(delivery => {
      const view = delivery.uid === undefined ? undefined : this.ownedViews.get(delivery.uid);
      const cfg = this.cfg.getUnit(delivery.unitId), old = before.find(unit => unit.uid === delivery.uid);
      const upgraded = old && delivery.uid !== undefined && this.owned.get(delivery.uid)!.star > old.star;
      return {art: UNIT_ART[cfg.artId ?? cfg.id] ?? UNIT_ART[cfg.id], recipient: view?.node,
        position: () => view ? worldToOverlay(view.node, new Vec3(0, 18, 0))
          : worldToOverlay(this.ui.rewardStorageAnchor ?? this.ui.node),
        land: upgraded ? () => view?.playStarUpgrade() : undefined};
    });
    flight.play(() => worldToOverlay(this.boardNode, this.bossChest?.rewardOrigin()
      ?? this.boardNode.getComponent(BoardView)!.cellToWorld(3, 6)), targets, () => {
      this.rewardFlight = null; this.finishStageReward(false);
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
    if (this.transitioning || this.rewardFlight) return;
    if (this.session.pendingStageReward) { this.openStageReward(); return; }
    if (this.transitioning || this.fighting || !this.loaded || this.flow.phase !== 'prepare' || this.draggingId) return;
    if (this.owned.onBoard().length === 0) {
      this.ui.showWarn('请先将棋子拖到己方棋盘');
      return;
    }
    this.resetDrag();
    if (!this.session.startBattle()) return;
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
    if (this.transitioning || this.rewardFlight) return;
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
    if (!this.loaded || this.transitioning || this.draggingId || !Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE_COUNT
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
  onDestroy(): void {
    this.unschedule(this.finishInitialLoading);
    this.loadScreen?.finish(); this.loadScreen = null;
    this.stageRewards?.hide();
    if (this.rewardFlight) { this.rewardFlight.cancel(); this.rewardFlight.node.destroy(); this.rewardFlight = null; }
    this.shopVisitor?.dispose(); this.bossChest?.dispose();
  }
  private refreshEconomyUI(): void {
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys, this.shop.costRates());
    this.ui.setFreeRefreshes(this.session.freeRefreshes);
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
    writeSaveV2(this.session.snapshot());
    this.refreshBackpack();
  }

  private refreshShopUI() {
    const slots = this.shop.slots.map(s => {
      if (!s.unitId) return { unitId: null, name: '', cost: 0, price: 0, poolLeft: 0 };
      const cfg = this.unitMap().get(s.unitId)!;
      const cost = (cfg.cost ?? 1) as Cost;
      return {
        unitId: s.unitId,
        name: cfg.name,
        cost, price: COST_PRICE[cost],
        poolLeft: this.pool.count(s.unitId),
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
      this.stageRewards.showTraitChoice(traitChoice, this.owned.all(), index => {
        if (!this.session.chooseEquipmentTrait(index).ok) return;
        this.persistShopState(); this.resetBattle(false); this.refreshRunUI(); this.showOwnedDetail(traitChoice.uid);
      });
      return;
    }
    const pending = this.session.pendingStageReward;
    // Keep the outgoing shop hidden until advanceWave swaps the encounter under the curtain.
    const stageContent = this.flow.wave.encounterKind === 'specialShop' || (!!pending && (pending.kind !== 'unitBundle' || this.stageRewardOpen));
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
    this.ui.showResult(
      round.winner,
      breakdown,
      expGained,
      levelUps,
      this.levelSys.level,
      round,
    );
    this.refreshEconomyUI();
    this.persistShopState();
    this.refreshRunUI();
    this.showEquipmentReward();
    this.scheduleNextWave();
  }

  update(dt: number) {
    if (!this.loaded || !this.sim || this.transitioning || this.rewardFlight) return;
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
