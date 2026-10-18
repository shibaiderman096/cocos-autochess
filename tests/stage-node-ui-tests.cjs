const assert=require('node:assert/strict');
const path=require('node:path');
const {load,Node,Sprite,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {BattleUI}=load(path.join(__dirname,'../assets/scripts/ui/BattleUI.ts'));
const ui=new BattleUI();ui.node=new Node('UI');new Node('Canvas').addChild(ui.node);ui.init();
const flush=()=>{while(pending.length)pending.shift()();};
const stagePlan=['monster','normal','elite','specialShop','normal','normal','normal','normal','normal','boss'];
ui.refreshRun(20,20,1,60,'测试阶段',{stage:4,round:3,roundsInStage:10,encounterKind:'elite'},6,stagePlan);flush();
const trackNames=ui.waveTrack.children.map(n=>n.name);
assert.equal(trackNames.filter(n=>n==='stage_link_done').length,1);
assert.equal(trackNames.filter(n=>n==='stage_link_current').length,1);
assert.equal(trackNames.filter(n=>n==='stage_link_todo').length,7);
assert.ok(trackNames.includes('stage_node_monster')&&trackNames.includes('stage_node_normal'));
assert.ok(trackNames.includes('stage_node_elite')&&trackNames.includes('stage_node_shop_locked')&&trackNames.includes('stage_node_boss_locked'));
assert.equal(trackNames.filter(n=>n==='stage_node_ring').length,1);
for(const node of ui.waveTrack.children.filter(n=>n.name!=='skin')) {
  const size=node.getComponent(UITransform).contentSize;
  assert.ok(Math.abs(node.position.x)+size.width/2<=165,'ten nodes and current ring fit the track');
  assert.ok(node.getChildByName('skin').getComponent(Sprite).spriteFrame.name.startsWith('art/ui_m2/stage_'),'track loads the replacement artwork');
}
assert.equal(ui.waveTrack.getChildByName('skin').getComponent(Sprite).type,Sprite.Type.SLICED);
ui.refreshRun(20,20,1,60,'首领',{stage:4,round:10,roundsInStage:10,encounterKind:'boss'},6,stagePlan);flush();
assert.ok(ui.waveTrack.getChildByName('stage_node_boss'));
assert.ok(ui.waveTrack.getChildByName('stage_node_ring_boss'));
assert.ok(!ui.waveTrack.getChildByName('stage_node_ring'),'refresh clears the previous current ring');
assert.ok(!ui.waveTrack.children.some(n=>n.name.endsWith('_locked')),'reaching the boss clears locked states');
ui.refreshRun(20,20,1,3,'野怪',{stage:1,round:1,roundsInStage:3,encounterKind:'monster'},5,['monster','monster','monster']);
ui.refreshRun(20,20,1,3,'野怪',{stage:1,round:2,roundsInStage:3,encounterKind:'monster'},5,['monster','monster','monster']);flush();
assert.equal(ui.waveTrack.children.filter(n=>n.name==='stage_node_ring').length,1,'delayed loads do not restore destroyed nodes');
assert.equal(ui.waveTrack.children.filter(n=>n.name==='stage_node_monster_locked').length,1);
const art=load(path.join(__dirname,'../assets/scripts/view/ArtPaths.ts'));
for(const kind of ['normal','monster','elite','specialShop','boss'])assert.ok(art.ENCOUNTER_SPRITE[kind].startsWith('art/ui_m2/stage_node_'));
for(const old of ['wave_done','wave_current','wave_todo','wave_boss'])assert.equal(art.M2_UI_SPRITE[old],undefined);
const headerWidth=ui.node.getChildByName('roundBar').getComponent(UITransform).contentSize.width;
const trackWidth=ui.waveTrack.getComponent(UITransform).contentSize.width;
assert.equal(trackWidth,headerWidth,'upper and lower progress panels have equal width');
for(const count of [1,3,5,6,10]) {
  const plan=Array(count).fill('normal');plan[count-1]='boss';
  ui.refreshRun(20,20,count,count,'测试',{stage:4,round:count,roundsInStage:count,encounterKind:'boss'},5,plan);flush();
  const nodes=ui.waveTrack.children.filter(n=>/^stage_node_(normal|boss)(_locked)?$/.test(n.name));
  assert.equal(nodes.length,count);
  if(count===1)assert.equal(nodes[0].position.x,0);
  else {
    assert.equal(nodes[0].position.x,-trackWidth/2+26);
    assert.equal(nodes.at(-1).position.x,trackWidth/2-26);
    const spacing=(trackWidth-52)/(count-1);
    for(let i=1;i<count;i++) {
      assert.ok(Math.abs(nodes[i].position.x-nodes[i-1].position.x-spacing)<1e-8,'nodes evenly fill available width');
      const previous=nodes[i-1].getComponent(UITransform).contentSize.width;
      const next=nodes[i].getComponent(UITransform).contentSize.width;
      assert.ok((previous+next)/2<spacing,'node artwork does not overlap');
    }
  }
  for(const node of ui.waveTrack.children.filter(n=>n.name!=='skin'))assert.ok(Math.abs(node.position.x)+node.getComponent(UITransform).contentSize.width/2<=trackWidth/2,'nodes and boss halo remain inside panel');
}
console.log('PASS stage node UI: five encounter kinds, completed/current/locked states, links, boss ring, ten-node bounds, sliced track and asynchronous refresh');
