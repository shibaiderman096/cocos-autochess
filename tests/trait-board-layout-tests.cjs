const assert=require('node:assert/strict'),path=require('node:path');
const {load,Node,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {TraitPanel}=load(path.resolve(__dirname,'../assets/scripts/ui/TraitPanel.ts'));
const {BattleUI}=load(path.resolve(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const {resolveTraits}=load(path.resolve(__dirname,'../assets/scripts/battle/Traits.ts'));
const {projectGroundPoint}=load(path.resolve(__dirname,'../assets/scripts/view/BoardPresentation.ts'));
const battle=require('../assets/resources/config/battle.json'),roster=require('../assets/resources/config/units.json');
const panel=new TraitPanel(new Node('UI')),flush=()=>{while(pending.length)pending.shift()();};
const states=resolveTraits(battle.traits,roster.map(u=>u.id),roster);
const delayedPanel=new TraitPanel(new Node('deferred UI'));
delayedPanel.refresh(states.slice(0,4),roster);flush();
for(const row of delayedPanel.rows.children)row.destroy=()=>{};
delayedPanel.refresh(states,roster);flush();
assert.equal(delayedPanel.rows.children.filter(n=>n.active).length,states.filter(s=>s.count>0).length,'deferred destruction does not hide refreshed content');
panel.refresh(states,roster);flush();
assert.ok(panel.states.length>6,'fixture exercises overflow');
const viewport=panel.rows.parent.getComponent(UITransform).contentSize;
assert.equal(viewport.height,330,'six full 50px rows and five 6px gaps');
assert.equal(panel.rows.getComponent(UITransform).contentSize.height,panel.states.length*56-6);
assert.ok(panel.scrollView.inertia && panel.scrollView.cancelInnerEvents);
assert.equal(panel.root.getChildByName('traitScrollUp'),undefined,'no page navigation');
const firstY=panel.rows.children[0].position.y;
panel.scrollView.scrollToOffset({x:0,y:19.5});
assert.equal(panel.scrollView.getScrollOffset().y,19.5,'content can stop between rows');
assert.equal(panel.rows.children[0].position.y,firstY,'scroll moves shared content, never rearranges rows');
panel.refresh(states.slice(0,-1),roster);flush();
assert.equal(panel.scrollView.getScrollOffset().y,19.5,'roster refresh preserves fractional pixel offset');
panel.scrollView.moving=true;
panel.rows.parent.events.get('scroll-began')();
panel.rows.children[0].events.get('end')();assert.equal(panel.detail,null,'inertial scrolling does not open details');
panel.scrollView.moving=false;
panel.rows.children[0].events.get('end')();assert.ok(panel.detail,'stationary tap opens details');panel.hideDetail();flush();
panel.scrollView.scrollToOffset({x:0,y:100});
panel.refresh(states.slice(0,2),roster);flush();assert.equal(panel.scrollView.getScrollOffset().y,0,'shrinking content clamps offset');
for(const state of states.filter(s=>s.count>0)) {
  panel.refresh([state],roster);panel.showDetail(state.config.id);flush();
  const card=panel.detail,size=card.getComponent(UITransform).contentSize;
  const rows=card.children.filter(n=>n.name.endsWith('Breakpoint'));
  const owners=card.children.filter(n=>n.name.startsWith('traitOwner_'));
  assert.equal(owners.length,state.config.members.filter(id=>roster.some(u=>u.id===id)).length);
  const columns=[...new Set(owners.map(n=>n.position.x))];assert.equal(columns.length,Math.min(4,owners.length),state.config.id);
  owners.forEach((n,i)=>{if(i>=4)assert.equal(owners[i-4].position.y-n.position.y,52);});
  for(const n of [...rows,...owners]){
    const h=n.getComponent(UITransform).contentSize.height;
    assert.ok(Math.abs(n.position.y)+h/2<=size.height/2,state.config.id+' bounded content');
  }
  for(let i=1;i<rows.length;i++) {
    const bottom=rows[i-1].position.y-rows[i-1].getComponent(UITransform).contentSize.height/2;
    const top=rows[i].position.y+rows[i].getComponent(UITransform).contentSize.height/2;
    assert.equal(bottom-top,6,'rows never overlap');
  }
  if(owners.length){
    const last=owners.at(-1),bottom=last.position.y-last.getComponent(UITransform).contentSize.height/2;
    assert.equal(bottom+size.height/2,14,'bottom padding is content-bound');
  }
  if(state.config.id==='conqueror'){
    const before=size.height;
    panel.refresh([{...state,config:{...state.config,description:state.config.description.repeat(4)}}],roster);
    panel.showDetail(state.config.id);flush();
    assert.ok(panel.detail.getComponent(UITransform).contentSize.height>before,'longer actual copy expands the panel');
  }
  panel.hideDetail();flush();
}
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();flush();
assert.equal(ui.backpackSlots.length,8);
for(const [i,s] of ui.backpackSlots.entries()){
  assert.equal(s.node.getComponent(UITransform).contentSize.width,72);
  assert.equal(s.icon.node.getComponent(UITransform).contentSize.width,52);
  assert.deepEqual(s.node.position,{x:-40+i%2*80,y:112-Math.floor(i/2)*80,z:0});
}
const items=Array.from({length:19},(_,i)=>({id:'item'+i,name:'装备'+i,icon:'art/equipment/guinsoo/spriteFrame',kind:'equipment'}));
ui.refreshBackpack(items,true);flush();
const captions=n=>[...n.components.values()].find(c=>c.string!==undefined)?.string;
const next=ui.backpackRoot.children.find(n=>captions(n.getChildByName('text')??{components:new Map()})==='›');
next.events.get('end')();flush();assert.deepEqual(ui.backpackSlots.map(s=>s.index),[8,9,10,11,12,13,14,15]);
let equipped;ui.onBackpack=i=>equipped=i;ui.backpackSlots[2].node.events.get('end')();assert.equal(equipped,10);
next.events.get('end')();flush();assert.deepEqual(ui.backpackSlots.map(s=>s.index),[16,17,18,-1,-1,-1,-1,-1]);
ui.refreshBackpack(items.slice(0,1),false);assert.equal(ui.backpackPage,0);equipped=null;ui.backpackSlots[0].node.events.get('end')();assert.equal(equipped,null,'combat remains locked');
const board=new Node('Board');board.layer=1<<25;ui.bindBoardPopulation(board);
const c=projectGroundPoint({x:0,y:0,z:1.15});
assert.equal(ui.capLabel.node.parent,board);assert.equal(ui.capLabel.node.layer,board.layer);
assert.equal(ui.capLabel.node.position.y,c.y);assert.ok(ui.capLabel.node.scale.y>0&&ui.capLabel.node.scale.y<ui.capLabel.node.scale.x,'ground foreshortening follows 45-degree board');
console.log('PASS all current trait content bounds, four-column portraits, dynamic text height, 2-column enlarged backpack pagination/selection/lock, board-ground population');
