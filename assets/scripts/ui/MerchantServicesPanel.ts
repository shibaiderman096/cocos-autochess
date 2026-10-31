import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3, sys } from 'cc';
import type { EquipmentConfigData } from '../battle/types';
import type { ConfigManager } from '../core/ConfigManager';
import { dicePayout, diceMultiplier, forgePrice } from '../core/MerchantServices';
import type { DiceBet } from '../core/MerchantServices';
import { button, label, panel } from './BattleUI';
import { equipmentQualityBadge, equipmentStatIcons } from './EquipmentStatIcons';
import { equipmentNameColor } from './EquipmentPresentation';
import { setUISkin } from './UISkin';
import { loadArtSprite } from '../view/ArtSpriteLoader';

export interface MerchantServicesPort {
  read(): { gold: number; items: string[]; dice?: DiceBet };
  level(id: string): number; eligible(id: string): boolean;
  enhance(index: number, id: string, count?: 1 | 10): string | undefined;
  bet(stake: number, picks: number[]): void; settle(id: number): void;
  refresh(): void; inspect(item: EquipmentConfigData): void;
}
const GOLD = new Color(220,187,115), TEXT = new Color(231,236,223), MUTED = new Color(153,178,176), TEAL = new Color(94,190,178);
type ShopTab = 'travel' | 'forge' | 'lucky';

/** View state only; inventory, random outcomes and all gold mutations belong to RunSession. */
export class MerchantServicesPanel {
  private tab: ShopTab = 'travel';
  private merchantId = '';
  private selected = '';
  private stake = 1;
  private picks: number[] = [1];
  private drop?: Node;
  private die?: Node;
  private dieGraphics?: Graphics;
  private rollingId = 0;
  private elapsed = 0;
  constructor(private cfg: ConfigManager, private port: MerchantServicesPort) {}
  private goldUpdates: Array<() => void> = [];
  structureKey(id: string): string {
    const state = this.port.read();
    return JSON.stringify([id === this.merchantId ? this.tab : 'travel', this.selected, state.items, state.dice,
      this.stake, this.picks, this.cfg.getEquipmentReserve(this.selected ? [this.selected] : [])]);
  }
  refreshGold(): void { for (const update of this.goldUpdates) update(); }
  get forging(): boolean { return this.tab === 'forge' && !!this.drop?.isValid && this.drop.activeInHierarchy; }
  mount(body: Node, id: string): boolean {
    this.goldUpdates = [];
    if (id !== this.merchantId) { this.tab = 'travel'; this.selected = ''; this.merchantId = id; }
    const state = this.port.read(), rolling = !!state.dice && !state.dice.settled;
    if (rolling && this.rollingId !== state.dice!.id) { this.rollingId = state.dice!.id; this.elapsed = 0; this.tab = 'lucky'; }
    this.drop = undefined; this.die = undefined; this.dieGraphics = undefined;
    const rail = panel(body.parent!, 'merchantTabs', -442, 0, 86, 178, new Color(13,27,35), TEAL, null);
    (['travel','forge','lucky'] as ShopTab[]).forEach((tab,i) => {
      const active = tab === this.tab;
      const control = button(rail, '', 0, 58-i*58, 78, 52, () => { if (!rolling) { this.tab = tab; this.port.refresh(); } }, active);
      control.name = `merchantTab_${tab}`;
      const icon = new Node('shopSymbol'); control.addChild(icon); icon.setPosition(-23,0,0);
      const g = icon.addComponent(Graphics); g.strokeColor = active ? GOLD : MUTED; g.fillColor = active ? GOLD : MUTED; g.lineWidth = 2;
      if (tab === 'forge') { g.moveTo(-10,7);g.lineTo(10,7);g.lineTo(6,0);g.lineTo(0,-2);g.lineTo(0,-8);g.moveTo(-8,-9);g.lineTo(8,-9);g.stroke(); }
      else if (tab === 'lucky') { g.roundRect(-9,-9,18,18,3);g.stroke();g.circle(-4,4,1.5);g.circle(0,0,1.5);g.circle(4,-4,1.5);g.fill(); }
      else { g.moveTo(-10,0);g.lineTo(0,10);g.lineTo(10,0);g.lineTo(0,-10);g.close();g.stroke();g.circle(0,0,2);g.fill(); }
      label(control, ['旅行','铁匠','幸运'][i], 12, 0, sys.isMobile ? 20 : 17, active ? GOLD : TEXT, 43);
      if (rolling && !active) setUISkin(control,'btn_disabled');
    });
    if (this.tab === 'travel') return false;
    label(body, this.tab === 'forge' ? '铁匠商店' : '幸运商店', -275, 66, sys.isMobile ? 22 : 18, GOLD, 190).isBold = true;
    const balance = label(body, `${state.gold} 金币`, 285, 65, sys.isMobile ? 22 : 18, GOLD, 170); balance.isBold = true;
    this.goldUpdates.push(() => { balance.string = `${this.port.read().gold} 金币`; });
    if (this.tab === 'forge') this.forge(body, state.items, state.gold);
    else this.lucky(body, state.dice, state.gold);
    this.refreshGold();
    return true;
  }
  private forge(body: Node, ids: string[], gold: number): void {
    if (!ids.includes(this.selected)) this.selected = '';
    const index = ids.indexOf(this.selected), item = this.cfg.getEquipmentReserve(this.selected ? [this.selected] : [])[0];
    const radiant=this.cfg.allEquipment().find(candidate=>candidate.radiantBaseId===item?.id);
    label(body, item?.radiantBaseId?'沐光装备已完成强化 · 属性及效果收益翻倍':radiant?'成装仅强化一次 · 绿色 → 紫色 · 属性及效果收益翻倍':'基础装备 3 金币强化 · 成装 18 金币沐光强化', -30, 39, sys.isMobile ? 17 : 14, MUTED, 680);
    const slot = this.drop = panel(body, 'forgeDropTarget', -260, -23, 192, 106, new Color(9,23,31), TEAL, null);
    if (item) {
      const art = new Node('forgeItemIcon'); slot.addChild(art); art.setPosition(-58,7,0); art.addComponent(UITransform).setContentSize(48,48);
      const sprite = art.addComponent(Sprite); sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      loadArtSprite(item.icon,(error,frame)=>{if(!error&&sprite.isValid)sprite.spriteFrame=frame;});
      const name=label(slot,item.name,26,15,sys.isMobile ? 20 : 16,new Color(...equipmentNameColor(item)),132);
      name.enableWrapText=false;name.overflow=Label.Overflow.SHRINK;name.node.getComponent(UITransform)!.setContentSize(132,26);
      equipmentQualityBadge(slot,item,26,-10,100,sys.isMobile ? 15 : 12);
      label(slot,`价值 ${item.shopPrice ?? 3} 金币`,0,-38,sys.isMobile ? 17 : 14,GOLD,175);
      slot.on(Node.EventType.TOUCH_END,()=>this.port.inspect(item));
      const rows = equipmentStatIcons(body,item,256,2,sys.isMobile ? 24 : 20,sys.isMobile ? 19 : 15,sys.isMobile ? 27 : 23); rows.root.setPosition(0,-4,0);
    } else {
      const g=slot.getComponent(Graphics)!;g.strokeColor=TEAL;g.lineWidth=2;
      g.moveTo(-18,15);g.lineTo(18,15);g.lineTo(9,3);g.lineTo(0,0);g.lineTo(0,-9);g.moveTo(-16,-10);g.lineTo(16,-10);g.stroke();
      label(slot,'拖入基础装备或绿色成装',0,-33,sys.isMobile ? 17 : 14,TEXT,185);
      label(body,'从左侧背包拖入装备\n装备仍保留在背包中',0,-18,sys.isMobile ? 19 : 15,MUTED,252);
    }
    const cost=forgePrice(this.port.level(this.selected),!!radiant), enabled=!!item&&this.port.eligible(item.id)&&gold>=cost;
    const bulk=!!item&&!radiant&&!item.radiantBaseId&&this.port.eligible(item.id);
    const control=button(body,item?.radiantBaseId?'已完成沐光强化':item?`${radiant?'沐光强化':'强化'} · ${cost} 金币`:'等待放入装备',280,bulk?12:-13,190,bulk?(sys.isMobile?44:38):(sys.isMobile?52:44),()=>{if(item&&this.port.eligible(item.id)&&this.port.read().gold>=cost){this.selected=this.port.enhance(index,this.selected)??this.selected;this.port.refresh();}},true);
    control.name='forgeEnhance'; if(!enabled)setUISkin(control,'btn_disabled');
    this.goldUpdates.push(() => setUISkin(control, item&&this.port.eligible(item.id)&&this.port.read().gold>=cost ? 'btn_primary' : 'btn_disabled'));
    if(bulk){
      const fit=(node:Node)=>{const text=node.getChildByName('text')!.getComponent(Label)!;text.fontSize=sys.isMobile?20:18;text.enableWrapText=false;text.overflow=Label.Overflow.SHRINK;node.getChildByName('text')!.getComponent(UITransform)!.setContentSize(180,sys.isMobile?44:38);};
      fit(control);
      const total=cost*10,canBulk=gold>=total;
      const ten=button(body,`强化10次 · ${total} 金币`,280,sys.isMobile?-39:-34,190,sys.isMobile?44:38,()=>{
        if(this.port.read().gold>=total&&this.port.eligible(this.selected)){this.selected=this.port.enhance(index,this.selected,10)??this.selected;this.port.refresh();}
      },true);
      ten.name='forgeEnhanceTen';fit(ten);if(!canBulk)setUISkin(ten,'btn_disabled');
      this.goldUpdates.push(() => setUISkin(ten, this.port.read().gold>=total&&this.port.eligible(this.selected) ? 'btn_primary' : 'btn_disabled'));
    }
    label(body,item?.radiantBaseId?'每件仅限一次':radiant?'装备价值增加 18 金币':bulk?'攻速强化上限 500%':item?`每次固定 ${cost} 金币`:'特殊道具不能强化',280,bulk?-77:-53,sys.isMobile ? 17 : 14,MUTED,220);
  }
  tryDrop(index: number, event: {getUILocation(): {x: number; y: number}}): boolean {
    if (this.tab !== 'forge' || !this.drop?.isValid || !this.drop.activeInHierarchy) return false;
    const p=event.getUILocation(), transform=this.drop.getComponent(UITransform)!, local=transform.convertToNodeSpaceAR(new Vec3(p.x,p.y,0));
    if(Math.abs(local.x)>transform.width/2||Math.abs(local.y)>transform.height/2)return false;
    const id=this.port.read().items[index];
    if(id&&this.port.eligible(id)){this.selected=id;this.port.refresh();}
    return true;
  }
  private lucky(body: Node, bet: DiceBet | undefined, gold: number): void {
    const rolling=!!bet&&!bet.settled;
    label(body,'最多选 3 个点数 · 选 1 / 2 / 3 个，命中返还 6 / 3 / 2 倍（含本金）',-25,39,sys.isMobile ? 17 : 14,MUTED,680);
    const die=this.die=new Node('luckyDie');body.addChild(die);die.setPosition(-267,-15,0);die.addComponent(UITransform).setContentSize(62,62);
    this.dieGraphics=die.addComponent(Graphics);this.drawDie(bet?.settled?bet.face:1);
    label(body,rolling?'摇骰中…':bet?`${bet.face} 点 · ${dicePayout(bet)?`返还 ${dicePayout(bet)} 金币`:'本次未中奖'}`:'选择投注后摇骰',-265,-64,sys.isMobile ? 18 : 15,bet?.settled&&dicePayout(bet)?GOLD:MUTED,210);
    [1,2,3,4,5,6].forEach((face,i)=>{
      const active=this.picks.includes(face);
      const control=button(body,`${face}${active?' ✓':''}`,-126+(i%3)*80,6-Math.floor(i/3)*49,72,sys.isMobile ? 46 : 39,()=>{
        if(rolling)return;
        if(active)this.picks=this.picks.filter(n=>n!==face);else if(this.picks.length<3)this.picks.push(face);
        this.port.refresh();
      },active);
      control.name=`dicePick_${face}`;if(sys.isMobile)control.getChildByName('text')!.getComponent(Label)!.fontSize=23;
      if(rolling||(!active&&this.picks.length===3))setUISkin(control,'btn_disabled');
    });
    [1,5,10].forEach((stake,i)=>{
      const control=button(body,`${stake} 金币`,154+i*81,7,75,sys.isMobile ? 44 : 32,()=>{if(!rolling){this.stake=stake;this.port.refresh();}},stake===this.stake);
      if(sys.isMobile)control.getChildByName('text')!.getComponent(Label)!.fontSize=20;
      control.name=`diceStake_${stake}`;
    });
    const enabled=!rolling&&this.picks.length>0&&gold>=this.stake;
    const roll=button(body,rolling?'摇骰中…':this.picks.length?`摇骰 · ${this.stake} 金币 · ${diceMultiplier(this.picks.length)} 倍`:'请选择点数',235,-41,236,40,()=>{
      const current = this.port.read();
      if (current.dice && !current.dice.settled) return;
      if (this.picks.length > 0 && current.gold >= this.stake) this.port.bet(this.stake,[...this.picks]);
    },true);
    roll.name='diceRoll';if(!enabled)setUISkin(roll,'btn_disabled');
    this.goldUpdates.push(() => setUISkin(roll, !rolling&&this.picks.length>0&&this.port.read().gold>=this.stake ? 'btn_primary' : 'btn_disabled'));
    label(body,rolling?`已押 ${bet!.picks.join('、')} · 动画后结算`:`已选 ${this.picks.length} / 3 个点数`,-46,-75,sys.isMobile ? 16 : 12,MUTED,250);
  }
  private drawDie(face: number): void {
    const g=this.dieGraphics;if(!g?.isValid)return;
    g.clear();g.fillColor=new Color(22,45,52);g.strokeColor=GOLD;g.lineWidth=2;g.roundRect(-28,-28,56,56,9);g.fill();g.stroke();g.fillColor=TEXT;
    const dots: Record<number,number[][]>={1:[[0,0]],2:[[-12,12],[12,-12]],3:[[-12,12],[0,0],[12,-12]],4:[[-12,12],[12,12],[-12,-12],[12,-12]],5:[[-12,12],[12,12],[0,0],[-12,-12],[12,-12]],6:[[-12,14],[12,14],[-12,0],[12,0],[-12,-14],[12,-14]]};
    for(const [x,y] of dots[face])g.circle(x,y,3.8);g.fill();
  }
  update(dt: number): void {
    const bet=this.port.read().dice;if(!bet||bet.settled)return;
    if(this.rollingId!==bet.id){this.rollingId=bet.id;this.elapsed=0;}
    this.elapsed+=Math.max(0,dt);
    if(this.die?.isValid){this.die.angle=Math.sin(this.elapsed*24)*15*(1-Math.min(1,this.elapsed/1.5));this.drawDie(1+Math.floor(this.elapsed*14)%6);}
    if(this.elapsed>=1.5)this.port.settle(bet.id);
  }
}
