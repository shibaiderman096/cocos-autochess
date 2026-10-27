import {Node,UITransform,Label,Graphics,Color,Sprite,view} from 'cc';
import type {IncomePreview} from '../core/EconomySystem';
import {panel,label,button} from './UIPrimitives';
import {loadArtSprite} from '../view/ArtSpriteLoader';
import {UI_SPRITE} from '../view/ArtPaths';

const GOLD=new Color(204,174,109),TEXT=new Color(233,231,210),MUTED=new Color(133,161,164);
/** One small streak indicator and a dismissible income inspector, fed by the real economy. */
export class ShopIncomePanel {
  readonly streak:Node;
  private icon:Sprite;
  private count:Label;
  private bars:Graphics[]=[];
  private data?:IncomePreview;
  private popup:Node|null=null;
  private iconPath='';
  private outcome:'win'|'loss'='win';
  constructor(header:Node,private parent:Node,private y:number){
    this.streak=new Node('streakProgress');header.addChild(this.streak);this.streak.setPosition(128,y,0);this.streak.addComponent(UITransform).setContentSize(110,44);
    const icon=new Node('streakIcon');this.streak.addChild(icon);icon.setPosition(-45,0,0);icon.addComponent(UITransform).setContentSize(20,24);this.icon=icon.addComponent(Sprite);this.icon.sizeMode=Sprite.SizeMode.CUSTOM;
    this.count=label(this.streak,'0',-25,0,14,MUTED,30);this.count.node.name='streakCount';
    for(let n=0;n<6;n++){const cell=new Node(`streakStep_${n}`);this.streak.addChild(cell);cell.setPosition(-3+n*9,0,0);cell.addComponent(UITransform).setContentSize(6,8);this.bars.push(cell.addComponent(Graphics));}
    const hit=new Node('goldIncomeHit');header.addChild(hit);hit.setPosition(-12,y,0);hit.addComponent(UITransform).setContentSize(116,44);
    for(const target of [hit,this.streak]){
      target.on(Node.EventType.TOUCH_START,(e:any)=>{if(e)e.propagationStopped=true;});
      target.on(Node.EventType.TOUCH_END,(e:any)=>{if(e)e.propagationStopped=true;this.show();});
    }
  }
  refresh(data:IncomePreview):void{
    const changed=JSON.stringify(data)!==JSON.stringify(this.data);this.data=data;
    const win=data.winStreak>0,loss=data.loseStreak>0,current=win?data.winStreak:data.loseStreak,tint=win?GOLD:loss?new Color(112,170,220):MUTED;
    this.count.string=current>99?'99+':String(current);this.count.color=tint;
    const path=`art/ui_m2/streak_${loss?'loss':'win'}/spriteFrame`;
    if(path!==this.iconPath){this.iconPath=path;loadArtSprite(path,(error,frame)=>{if(!error&&this.icon.isValid&&this.iconPath===path)this.icon.spriteFrame=frame;});}
    this.icon.color=win||loss?Color.WHITE:new Color(133,161,164,100);
    const filled=Math.floor(data.progress/data.progressMax*6);
    this.bars.forEach((g,n)=>{g.clear();g.fillColor=n<filled?tint:new Color(39,59,66);g.rect(-3,-4,6,8);g.fill();});
    if(changed&&this.popup)this.show(this.outcome);
  }
  show(outcome:'win'|'loss'=this.data?.loseStreak?'loss':'win'):void{
    if(!this.data)return;this.hide();this.outcome=outcome;
    const root=this.popup=new Node('incomePopup');this.parent.addChild(root);const screen=view.getVisibleSize();root.addComponent(UITransform).setContentSize(screen.width,screen.height);
    root.on(Node.EventType.TOUCH_END,()=>this.hide());
    const body=panel(root,'incomePopupBody',-12,this.y+188,320,330,new Color(8,17,24,250),new Color(129,111,73),null);
    for(const event of [Node.EventType.TOUCH_START,Node.EventType.TOUCH_END])body.on(event,(e:any)=>{if(e)e.propagationStopped=true;});
    const d=this.data,projection=d[outcome],streak=d.winStreak?`${d.winStreak}连胜`:d.loseStreak?`${d.loseStreak}连败`:'暂无连胜／败';
    label(body,'预计收入',-70,126,18,TEXT,140).isBold=true;
    label(body,`余额 ${d.gold} · ${streak}`,-50,101,12,MUTED,180);
    const coin=new Node('incomeGoldIcon');body.addChild(coin);coin.setPosition(71,119,0);coin.addComponent(UITransform).setContentSize(20,20);const sprite=coin.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    loadArtSprite(UI_SPRITE.iconGold,(error,frame)=>{if(!error&&sprite.isValid)sprite.spriteFrame=frame;});
    const total=label(body,`+${projection.total}`,112,119,30,GOLD,76);total.isBold=true;total.node.name='incomeTotal';
    button(body,'×',140,147,20,20,()=>this.hide()).name='closeIncomePopup';
    for(const [key,x,title]of [['win',-73,'本场获胜'],['loss',73,'本场失利']] as const){
      const tab=button(body,title,x,65,136,28,()=>this.show(key),key===outcome);tab.name=`incomeOutcome_${key}`;tab.getChildByName('text')!.getComponent(Label)!.fontSize=13;
    }
    const lines=new Node('incomeDividers');body.addChild(lines);const g=lines.addComponent(Graphics);g.lineWidth=1;g.strokeColor=new Color(79,91,92);for(const y of [42,-126]){g.moveTo(-140,y);g.lineTo(140,y);g.stroke();}
    const rows:[string,string,number][]=[['base','基础收入',projection.floorIncome],['victory','胜利奖励',projection.winBonus],['interest','利息',projection.interest],['streak',outcome==='win'?'连胜奖励':'连败奖励',projection.streakBonus],['encounter','奇遇奖励',projection.extraIncome]];
    rows.forEach(([key,name,value],n)=>{const y=22-n*32;const title=label(body,name,-68,y,15,TEXT,140);title.horizontalAlign=Label.HorizontalAlign.LEFT;title.node.name=`incomeLabel_${key}`;const amount=label(body,`+${value}`,117,y,16,value?GOLD:MUTED,54);amount.node.name=`incomeValue_${key}`;});
    for(let n=0;n<5;n++){const pip=new Node(`interestPip_${n}`);body.addChild(pip);pip.setPosition(3+n*12,-42,0);const p=pip.addComponent(Graphics);p.fillColor=n<projection.interest?GOLD:new Color(39,59,66);p.rect(-3,-3,6,6);p.fill();}
    label(body,d.entrySubsidy?`本关基础补贴 +${d.entrySubsidy} 已到账 · 上方为战后预计`:'按当前余额预计，不含宝箱和出售收益',0,-144,11,d.entrySubsidy?GOLD:MUTED,294);
  }
  hide():void{if(this.popup){this.popup.active=false;this.popup.destroy();this.popup=null;}}
}
