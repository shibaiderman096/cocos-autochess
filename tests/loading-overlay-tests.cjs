const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {load,Node,Sprite,UITransform,pending}=require('./helpers/ui-harness.cjs');
const {GameLoadingOverlay}=load(path.resolve('assets/scripts/ui/GameLoadingOverlay.ts'));
const canvas=new Node('Canvas'),loading=GameLoadingOverlay.show(canvas,'准备棋子');
assert.deepEqual(loading.node.getComponent(UITransform).contentSize,{width:1280,height:720});
assert.equal(GameLoadingOverlay.show(canvas,'布置棋盘'),loading,'repeat loading reuses one overlay');
assert.equal(loading.status.string,'布置棋盘');
const icon=loading.emblem.getComponent(Sprite),firstY=loading.emblem.position.y;
loading.update(.3);assert.notEqual(loading.emblem.position.y,firstY,'emblem actually floats');
loading.update(1.5);assert.ok(Math.abs(loading.emblem.position.y-firstY)<1e-8,'1.8 second loop closes');
assert.equal(loading.node.active,true,'animation time never completes loading');
let returns=0;loading.fail('素材加载失败',()=>returns++);const elapsed=loading.elapsed;
loading.update(4);assert.equal(loading.elapsed,elapsed);assert.equal(loading.returnButton.active,true);
loading.returnButton.events.get('end')();loading.returnButton.events.get('end')();assert.equal(returns,1);
loading.finish();loading.finish();while(pending.length)pending.shift()();
assert.equal(canvas.getChildByName('gameLoading'),undefined);assert.equal(icon.spriteFrame,undefined,'late art callback cannot revive a finished loader');

// Exercise the production readiness gate independently of animation and resource mocks.
const source=ts.createSourceFile('BattleStage.ts',fs.readFileSync('assets/scripts/view/BattleStage.ts','utf8'),ts.ScriptTarget.ES2020,true);
const cls=source.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='BattleStage');
const method=cls.members.find(n=>n.name?.getText(source)==='finishInitialLoading').getText(source);
const compiled=ts.transpileModule(`class Stage{${method}}exports.Stage=Stage;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const out={};new Function('exports','FloatingRuinsBoard','director',compiled)(out,class{},{});
const make=()=>{const stage=new out.Stage(),presenter={loadingComplete:false,loadError:''},unit={visualReady:false,loadError:''};
let finished=0,failed=0,unscheduled=0;stage.loaded=true;stage.loadScreen={finish(){finished++;},fail(){failed++;}};
stage.node={parent:{getComponent:()=>presenter}};stage.views=new Map([[1,unit]]);stage.ownedViews=new Map([[1,unit]]);
stage.unschedule=()=>unscheduled++;return{stage,presenter,unit,counts:()=>({finished,failed,unscheduled})};};
const gate=make();gate.stage.finishInitialLoading();assert.equal(gate.counts().finished,0);
gate.presenter.loadingComplete=true;gate.stage.finishInitialLoading();assert.equal(gate.counts().finished,0,'portraits must finish too');
gate.unit.visualReady=true;gate.stage.finishInitialLoading();assert.equal(gate.counts().finished,1);assert.equal(gate.stage.loadScreen,null);
gate.stage.finishInitialLoading();assert.equal(gate.counts().finished,1);
for(const source of ['presenter','unit']){const gate=make();gate[source].loadError='missing asset';gate.stage.finishInitialLoading();assert.equal(gate.counts().failed,1);assert.equal(gate.counts().unscheduled,1);assert.equal(gate.counts().finished,0);}
console.log('PASS loading: loop motion, real readiness gate, reused overlay, resource errors, once-only return, repeated cleanup and late callback safety');
