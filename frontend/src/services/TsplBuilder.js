'use strict';

/**
 * TSPL command builder for 76mm roll thermal labels.
 *
 * Paper width: 76mm
 * Printable width: 72mm
 * Left/right margins: 2mm each
 */

function safe(str, maxLen) {
  if (!str) return '';
  return String(str).substring(0, maxLen).replace(/"/g, "'");
}

/**
 * Build a 76mm x 24mm jewelry label with 72mm printable width.
 *
 * Layout:
 * - Shop name at top
 * - One row with Name, Purity, Gross Weight
 * - Barcode graphic
 * - Barcode text below
 *
 * @param {object} opts
 * @param {string} opts.itemName
 * @param {string} opts.itemNumber
 * @param {string} opts.purity
 * @param {number} opts.grossWeight
 * @param {number} opts.netWeight
 * @param {string} opts.barcode
 * @param {number} [opts.copies=1]
 * @returns {string}
 */
function buildJewelryLabel({ itemName, itemNumber, purity, grossWeight, netWeight, barcode, copies = 1 }) {
  const bc = safe(barcode || itemNumber, 24);
  const name = safe(itemName || itemNumber, 22);
  const pur = safe(purity, 10);
  const gw = grossWeight != null ? Number(grossWeight).toFixed(3) : '0.000';

  if (!bc) throw new Error('barcode value is required for TSPL label');

  const cmds = [
    'SIZE 76 mm,24 mm',
    'GAP 2 mm,0',
    'DIRECTION 0',
    'REFERENCE 16,0',
    'DENSITY 10',
    'SPEED 4',
    'CLS',
    'SET TEAR ON',
    `TEXT 150,4,"2",0,1,1,"SRI VAISHNAVI JEWELLERS"`,
    `TEXT 0,20,"2",0,1,1,"${name}"`,
    `TEXT 250,20,"2",0,1,1,"${pur}"`,
    `TEXT 430,20,"2",0,1,1,"${gw}g"`,
    `BARCODE 10,36,"128",52,1,0,2,2,"${bc}"`,
    `TEXT 138,102,"2",0,1,1,"${bc}"`,
    `PRINT ${copies},1`,
    '',
  ];

  return cmds.join('\r\n');
}

module.exports = { buildJewelryLabel };
