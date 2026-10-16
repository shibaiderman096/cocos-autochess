require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),load=name=>JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config/'+name+'.json'),'utf8'));
const equipment=load('equipment'),power=load('enemy-power'),units=load('units'),policy=load('equipment-policy');
const {EnemyPowerModel}=require('../assets/scripts/core/EnemyPowerModel.ts'),model=new EnemyPowerModel(power);
const rows=equipment.map(item=>({equipmentId:item.id,name:item.name,tier:policy.tiers[item.id],baseAttributes:Object.fromEntries(Object.entries(item).filter(([k,v])=>typeof v==='number')),
  effects:item.description,slots:3,duplicatesAllowed:true,duplicateEffects:'see real description; attribute stacks, some passives trigger once',
  calibrated:!!power.equipment[item.id],enemyEligible:policy.enemy.calibratedItems.includes(item.id),globalEstimate:power.equipment[item.id]??null,
  unitDifferences:units.map(u=>({unitId:u.id,stars:[1,2,3].map(star=>{const naked=model.estimateUnitPower({unitId:u.id,cost:u.cost,star,equipment:[]}),e=model.estimateUnitPower({unitId:u.id,cost:u.cost,star,equipment:[item.id]});
    return {star,nakedPower:naked.power,equippedPower:power.equipment[item.id]?e.power:null,contribution:power.equipment[item.id]?e.power-naked.power:null,confidence:e.confidence,method:e.method,diagnostics:e.diagnostics};})}))}));
const result={count:equipment.length,basicCount:0,additionsInP3:[],modelModified:false,modelVersion:power.version,calibrationHash:power.calibrationHash,
  caveats:['Six pre-existing added items are not calibrated: never interpret the model ignored-item partial estimate as their value; excluded from enemy candidates.',
    'iron_golem was added after P1-B and uses existing explicit cost fallback, low confidence. No P3 rebalance or recalibration.',
    'No pure basic items exist. Early basic-only reward pool explicitly falls back to two configured advanced items; fewer distinct choices, no duplicates.',
    'Rewards may include uncalibrated items; player reward selection does not spend enemy model budget.'],items:rows};
const dest=path.join(root,'docs/p3-equipment/equipment-audit.json');if(fs.existsSync(dest))throw Error('Audit already exists');fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');console.log('Equipment audit:',equipment.length,'items; basic=0; P3 additions=0; model unchanged');
