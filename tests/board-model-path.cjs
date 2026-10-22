// Historical boards are regression fixtures; only the current board is a runtime resource.
const path = require('node:path');
const fixtures = new Set(['floating-ruins-p0', 'floating-ruins-beauty-v1', 'floating-ruins-p1']);
module.exports = variant => {
  if (fixtures.has(variant)) return path.join(__dirname, 'fixtures/board-models', `${variant}.glb`);
  if (variant === 'floating-ruins-reference-v1') return path.join(__dirname, '../assets/resources/models', variant, `${variant}.glb`);
  throw new Error(`Unknown board model: ${variant}`);
};
