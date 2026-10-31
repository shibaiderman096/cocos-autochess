import {Node,UITransform,UIOpacity,Sprite,SpriteFrame,Texture2D,Rect,Size,resources} from 'cc';
import type {BattleEvent} from '../battle/types';
import {FX_SPRITE} from './ArtPaths';
import {realmBorderLayout} from './RealmBorderLayout';

// Authored transparent gutters and fixed rune baselines; preserve source art without raster edits.
const ROWS=[{y:200,h:220,baseline:344},{y:420,h:280,baseline:610},{y:700,h:240,baseline:859},{y:940,h:240,baseline:1101}];
/** One shared, floor-bound perimeter. The same replay clock owns reveal, loop, pause and cleanup. */
export class SoulRealmBorder {
  readonly root:Node;
  private frames:SpriteFrame[]=[];
  private pieces:Array<{sprites:Sprite[];alphas:UIOpacity[];opacity:UIOpacity}>=[];
  private disposed=false;private ended=false;private start:number|null=null;private lastTick=0;
  constructor(parent:Node,columns:number,rows:number,private cell:number,private tickMs:number){
    this.root=new Node('soulRealmBorder');this.root.layer=parent.layer;parent.addChild(this.root);this.root.active=false;
    const floor=parent.getChildByName('ruins3DSurface')??parent.getChildByName('boardGrid');
    this.root.setSiblingIndex(floor?floor.getSiblingIndex()+1:0);
    const edges=realmBorderLayout(columns,rows,cell);
    resources.load(FX_SPRITE.soulRealmBorder.replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(error||this.disposed||!this.root.isValid)return;
      for(const row of ROWS){
        const y=Math.round(row.y/1254*texture.height),height=Math.round((row.y+row.h)/1254*texture.height)-y;
        const frame=new SpriteFrame();frame.texture=texture;frame.rect=new Rect(0,y,texture.width,height);frame.originalSize=new Size(texture.width,height);this.frames.push(frame);
      }
      for(const edge of edges){
        const node=new Node('realmEdge');node.layer=this.root.layer;this.root.addChild(node);node.setPosition(edge.x,edge.y,0);node.angle=edge.angle;
        const sprites:Sprite[]=[],alphas:UIOpacity[]=[];
        for(let i=0;i<2;i++){
          const cel=new Node('flameBlend');cel.layer=node.layer;node.addChild(cel);cel.addComponent(UITransform);
          const sprite=cel.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprites.push(sprite);alphas.push(cel.addComponent(UIOpacity));
          cel.getComponent(UITransform)!.setContentSize(edge.width/.94,cell*.85);
        }
        this.pieces.push({sprites,alphas,opacity:node.addComponent(UIOpacity)});
      }
      this.update(this.lastTick);
    });
  }
  play(event:BattleEvent):void {
    if(this.disposed||this.ended)return;
    if(event.t==='end'){this.ended=true;this.start=null;this.root.active=false;return;}
    if(event.t==='soul_realm'&&this.start===null){this.start=event.tick;this.update(this.lastTick);}
  }
  update(tick:number):void {
    this.lastTick=tick;
    if(this.disposed||this.ended||this.start===null||tick<this.start){this.root.active=false;return;}
    this.root.active=true;
    const seconds=(tick-this.start)*this.tickMs/1000,phase=seconds*5%4,index=Math.floor(phase),blend=phase-index;
    this.pieces.forEach((piece,edge)=>{
      // Reveal clockwise, then retain a soft animated edge. No overlay fills the fighting area.
      piece.opacity.opacity=Math.round((175+Math.sin(seconds*2)*15)*Math.max(0,Math.min(1,(seconds-edge*.12)/.28)));
      piece.sprites.forEach((sprite,cel)=>{
        const frame=cel?(index+1)%4:index,row=ROWS[frame],scale=this.cell*.85/240;
        sprite.spriteFrame=this.frames[frame];
        const transform=sprite.node.getComponent(UITransform)!;transform.setContentSize(transform.width,row.h*scale);
        sprite.node.setPosition(0,(row.baseline-row.y-row.h/2)*scale,0);
        piece.alphas[cel].opacity=Math.round(255*(cel?blend:1-blend));
      });
    });
  }
  destroy():void {this.disposed=true;this.root.active=false;this.root.destroy();for(const frame of this.frames)frame.destroy();this.frames=[];this.pieces=[];}
}
