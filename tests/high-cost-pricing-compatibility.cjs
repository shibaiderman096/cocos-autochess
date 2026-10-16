// Keep historical captures immutable; permit only the explicitly requested price correction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function assertPricingCorrection() {
  const frozen = require('../docs/p4-balance/baseline/frozen.json');
  const oldRow = '1: 1, 2: 2, 3: 3, 4: 5, 5: 8,';
  assert.equal(frozen.rules.ShopConfig.split(oldRow).length - 1, 2);
  const expected = frozen.rules.ShopConfig.replaceAll(oldRow, '1: 1, 2: 2, 3: 3, 4: 4, 5: 5,');
  const actual = fs.readFileSync(path.join(__dirname, '../assets/scripts/core/ShopConfig.ts'), 'utf8');
  assert.equal(actual.replace(/\r\n/g, '\n'), expected.replace(/\r\n/g, '\n'),
    'Only the authorized buy/sell base prices may differ from the historical shop rules');
}
module.exports = { assertPricingCorrection };
