import {Node,UITransform,UIOpacity,Sprite,SpriteFrame,Texture2D,Rect,Size,Color,resources} from 'cc';
import {FX_SPRITE} from './ArtPaths';
import {groundFogLayout} from './GroundFogLayout';

/** One floor-bound fog layer for either/both shadow boards. It never covers unit portraits or HUD. */
export class ShadowGroundFog {
  readonly root:Node;
  private frames:SpriteFrame[]=[];
  private disposed=false;
  constructor(parent:Node,columns:number,rows:number,size:number,private tickMs:number) {
    this.root=new Node('shadowBoardFog');this.root.layer=parent.layer;parent.addChild(this.root);
    const floor=parent.getChildByName('ruins3DSurface')??parent.getChildByName('boardGrid');
    this.root.setSiblingIndex(floor?floor.getSiblingIndex()+1:0);
    this.root.addComponent(UIOpacity).opacity=152;
    const layout=groundFogLayout(columns,rows,size);
    resources.load(FX_SPRITE.shadowBoardFog.replace('/spriteFrame','/texture'),Texture2D,(err,texture)=>{
      if(err||this.disposed||!this.root.isValid)return;
      for(const band of layout){
        const y=Math.round(band.index*texture.height/layout.length),end=Math.round((band.index+1)*texture.height/layout.length);
        const frame=new SpriteFrame();frame.texture=texture;frame.rect=new Rect(0,y,texture.width,end-y);frame.originalSize=new Size(texture.width,end-y);this.frames.push(frame);
        const node=new Node('groundFogBand');node.layer=this.root.layer;this.root.addChild(node);node.setPosition(band.x,band.y,0);
        // Adjacent bands share projected edges exactly; overlap would darken translucent seams.
        node.addComponent(UITransform).setContentSize(band.width,band.height);
        const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.color=new Color(88,88,92,255);sprite.spriteFrame=frame;
      }
    });
  }
  update(tick:number):void {
    if(this.disposed||!this.root.isValid)return;
    this.root.getComponent(UIOpacity)!.opacity=152+Math.round(Math.sin(tick*this.tickMs/1000*.75)*8);
  }
  destroy():void {
    this.disposed=true;this.root.active=false;this.root.destroy();
    for(const frame of this.frames)frame.destroy();this.frames=[];
  }
}
