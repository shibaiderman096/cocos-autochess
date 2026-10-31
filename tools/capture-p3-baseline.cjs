const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/p3-equipment');
fs.mkdirSync(out,{recursive:true});
const hashes={};
function visit(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())visit(p);else hashes[p]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');}}
for(const dir of ['assets/scripts','assets/resources/config','tools','docs/p0-enemy-difficulty','docs/p1-enemy-difficulty','docs/p2-enemy-formation'])visit(dir);
hashes['package.json']=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'package.json'))).digest('hex');
const file=path.join(out,'pre-p3-hashes.json');if(fs.existsSync(file))throw Error('P3 baseline already captured');
fs.writeFileSync(file,JSON.stringify(hashes,null,2)+'\n');
require('tsx/cjs');
const {loadRunInputs,loadEnemyGenerationInputs}=require('./run-simulation.ts');
const {buildRunWaves}=require('../assets/scripts/core/RunSetup.ts');
const inputs=loadRunInputs(root),g=loadEnemyGenerationInputs(root);
const waves=buildRunWaves(99,inputs.run,inputs.waves,inputs.units,{mode:'budget-v1',runSeed:12345,power:g.enemyPower,difficulty:g.enemyDifficulty});
fs.writeFileSync(path.join(out,'pre-p3-waves.json'),JSON.stringify(waves,null,2)+'\n');
console.log('Captured',Object.keys(hashes).length,'files and',waves.length,'waves');
