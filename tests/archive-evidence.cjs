// Historical experiments retain their own inputs. Live rules are intentionally allowed to evolve.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const cleanup=require('../docs/simulation-output-cleanup.json');
const deleted=new Set(cleanup.files.map(f=>f.path));
function assertArchivedEvidence(hashes){
 let retained=0,removed=0;
 for(const [file,expected] of Object.entries(hashes)){
  if(!file.startsWith('docs/'))continue;
  const absolute=path.resolve(root,file);
  assert.ok(absolute.startsWith(root+path.sep),'archive reference stays in project');
  if(deleted.has(file)){assert.ok(!fs.existsSync(absolute),`Deleted trace returned: ${file}`);removed++;continue;}
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),expected,file);retained++;
 }
 assert.ok(retained>0,'must check retained evidence, never silently skip the whole archive');
 return {retained,removed};
}
module.exports={assertArchivedEvidence};
