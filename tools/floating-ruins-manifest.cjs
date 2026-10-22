require('tsx/cjs');
const fs = require('node:fs');
const { BoardProjectionAdapter } = require('../assets/scripts/view/BoardProjectionAdapter.ts');
const battle = require('../assets/resources/config/battle.json');
const adapter = new BoardProjectionAdapter(battle.boardWidth, battle.boardHeight, 48);
fs.writeFileSync('art-source/floating-ruins-p0/board-layout.json', JSON.stringify(adapter.manifest(), null, 2));
console.log(`Wrote ${adapter.geometry.cells.length} cells from production BoardGeometry`);
