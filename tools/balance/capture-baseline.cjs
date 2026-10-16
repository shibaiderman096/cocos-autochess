const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/p4-balance/baseline');
if(fs.existsSync(path.join(out,'frozen.json')))throw Error('P4 baseline already frozen');
fs.mkdirSync(out,{recursive:true});
const hashes={};function scan(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())scan(p);else hashes[p]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');}}
for(const dir of ['assets/scripts','assets/resources/config','tools','tests','docs/p0-enemy-difficulty','docs/p1-enemy-difficulty','docs/p2-enemy-formation','docs/p3-equipment'])scan(dir);
const configs={};for(const name of ['units','skills','battle','run','waves','equipment','enemy-difficulty','enemy-formation','enemy-roles','enemy-power','equipment-policy'])configs[name]=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config',name+'.json'),'utf8'));
const rules={};for(const name of ['EconomySystem','ShopConfig','LevelSystem','ShopSystem','CardPool'])rules[name]=fs.readFileSync(path.join(root,'assets/scripts/core',name+'.ts'),'utf8');
fs.writeFileSync(path.join(out,'frozen.json'),JSON.stringify({schema:'p4-baseline-v1',configs,rules,hashes},null,2)+'\n');
console.log('Frozen P4 baseline:',Object.keys(hashes).length,'files; all difficulty/equipment/model/economy/shop values unchanged');
