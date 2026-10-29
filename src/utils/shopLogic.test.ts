import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAJ_HARVESTER_SHOP_INFO,
  buildCustomerLedgerSheetData,
  calculateBillTotals,
  executeAtomicBillTransaction,
  filterAndSearchParts,
  formatBillInvoiceNumber,
  formatBillPartName,
  formatDateDotDisplay,
  formatDateShortDisplay,
  formatDateTimeDisplay,
  generateAllDuesCsv,
  generateAllDuesXlsxBuffer,
  generateCsvBackup,
  generateCustomerLedgerCsv,
  generateInitialShopState,
  generateSalesCsv,
  generateSeedParts,
  generateXlsxBufferFromCsv,
  extractShopPartsFromAoA,
  importPartsFromCsv,
  inspectXlsxWorkbook,
  isOriginalPart,
  paginateBillItemsForPrint,
  paginateParts,
  parseDuesFromXlsxBuffer,
  importDuesRecords,
  isCustomerPhoneMissing,
  getDuplicateCustomerAnalysis,
  getDuplicatePartNumberSet,
  normalizePartNumberForDupCheck,
  updateCustomerDueDetails,
  deleteCustomerDueRecord,
  parseXlsxBufferToCsv,
  recordDuePayment,
  deleteBillTransaction,
  detectPartSet,
  getDuplicatePartKeySet,
  getPartDuplicateKey,
} from './shopLogic.ts';
import * as XLSX from 'xlsx';

test('formatDateTimeDisplay and formatDateShortDisplay produce deterministic IST output across SSR and client', () => {
  assert.equal(formatDateTimeDisplay('2026-10-18T06:00:00.000Z'), '18 Oct 2026, 11:30 AM');
  assert.equal(formatDateShortDisplay('2026-10-18T06:00:00.000Z'), '18 Oct 2026');
  assert.equal(TAJ_HARVESTER_SHOP_INFO.name, 'TAJ HARVESTER');
  assert.equal(TAJ_HARVESTER_SHOP_INFO.address, 'Jayer, Pandua, Hooghly');
  assert.equal(TAJ_HARVESTER_SHOP_INFO.phone, '7872339053 / 8337803644');
});

test('formatBillInvoiceNumber advances the middle segment every 100 final numbers', () => {
  assert.equal(formatBillInvoiceNumber(8901), 'INV-85-8901');
  assert.equal(formatBillInvoiceNumber(9000), 'INV-85-9000');
  assert.equal(formatBillInvoiceNumber(9001), 'INV-86-9001');
  assert.equal(formatBillInvoiceNumber(9101), 'INV-87-9101');
});

test('paginateBillItemsForPrint splits a 30-item customer bill into 3 pages with accurate page subtotals', () => {
  const parts = generateSeedParts(40);
  const thirtyItems = parts.slice(0, 30).map((p, idx) => {
    const qty = (idx % 3) + 1;
    const disc = idx % 5 === 0 ? 50 : 0;
    return {
      partId: p.id,
      partSet: p.partSet,
      partNumber: p.partNumber,
      nameModel: p.nameModel,
      unitPrice: p.price,
      quantity: qty,
      discount: disc,
      lineTotal: p.price * qty - disc,
    };
  });

  const pages = paginateBillItemsForPrint(thirtyItems, 12);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].pageNumber, 1);
  assert.equal(pages[0].totalPages, 3);
  assert.equal(pages[0].items.length, 12);
  assert.equal(pages[0].startIndex, 0);

  assert.equal(pages[1].pageNumber, 2);
  assert.equal(pages[1].items.length, 12);
  assert.equal(pages[1].startIndex, 12);

  assert.equal(pages[2].pageNumber, 3);
  assert.equal(pages[2].items.length, 6);
  assert.equal(pages[2].startIndex, 24);

  const sumPageNet = pages.reduce((s, pg) => s + pg.pageNetTotal, 0);
  const fullTotals = calculateBillTotals(thirtyItems, 0, 5000);
  assert.equal(sumPageNet, fullTotals.netTotal);
});

test('generateSeedParts creates 1,040 brand/local parts plus 10 "others" items with no part number (Nut Bolt, Washer, Gum, Spray, etc.)', () => {
  const parts = generateSeedParts(1040);
  assert.equal(parts.length, 1050);

  const kubotaCount = parts.filter((p) => p.partSet === 'kubota').length;
  const yanmarCount = parts.filter((p) => p.partSet === 'yanmar').length;
  const gmCount = parts.filter((p) => p.partSet === 'gm').length;
  const localCount = parts.filter((p) => p.partSet === 'local').length;
  const othersParts = parts.filter((p) => p.partSet === 'others');

  assert.equal(kubotaCount, 260);
  assert.equal(yanmarCount, 260);
  assert.equal(gmCount, 260);
  assert.equal(localCount, 260);
  assert.equal(othersParts.length, 10);
  assert.equal(othersParts.every((p) => p.partNumber === '--'), true);
  assert.equal(detectPartSet('BR-0001', 'Bearing 6204'), 'bearings');
  assert.equal(detectPartSet('6204', 'SKF Bearing 6204'), 'bearings');
});

test('isOriginalPart and formatBillPartName append (org) strictly to kubota, yanmar, and gm parts', () => {
  assert.equal(isOriginalPart('kubota'), true);
  assert.equal(isOriginalPart('yanmar'), true);
  assert.equal(isOriginalPart('gm'), true);
  assert.equal(isOriginalPart('local'), false);
  assert.equal(isOriginalPart('bearings'), false);
  assert.equal(isOriginalPart('others'), false);

  assert.equal(
    formatBillPartName('Kubota DC-68G - Combine Blade', 'kubota'),
    'Kubota DC-68G - Combine Blade (org)'
  );
  assert.equal(
    formatBillPartName('Yanmar AW70G - Hydraulic Pump', 'yanmar'),
    'Yanmar AW70G - Hydraulic Pump (org)'
  );
  assert.equal(
    formatBillPartName('GM Combine 900 - Clutch Plate', 'gm'),
    'GM Combine 900 - Clutch Plate (org)'
  );
  assert.equal(
    formatBillPartName('Local Mahindra 575 - Tie Rod', 'local'),
    'Local Mahindra 575 - Tie Rod'
  );
  assert.equal(
    formatBillPartName('High Tensile Nut Bolt Set', 'others', 'N/A'),
    'High Tensile Nut Bolt Set'
  );
});

test('filterAndSearchParts and paginateParts filter by PartSet and search query', () => {
  const parts = generateSeedParts(1040);
  const kubotaOnly = filterAndSearchParts(parts, '', 'ALL', 'kubota');
  assert.equal(kubotaOnly.length, 260);

  const othersOnly = filterAndSearchParts(parts, '', 'ALL', 'others');
  assert.equal(othersOnly.length, 10);

  const page1 = paginateParts(kubotaOnly, 1, 40);
  assert.equal(page1.items.length, 40);
  assert.equal(page1.hasMore, true);
});

test('calculateBillTotals and executeAtomicBillTransaction support per-part percentage discounts (e.g. 10%), single price edits, others parts, and deduct stock', () => {
  const state = generateInitialShopState();
  const partA = state.parts[0]; // Kubota original part
  const partB = state.parts[1]; // Yanmar original part
  const partOthers = state.parts.find((p) => p.partSet === 'others')!;
  const initialStockA = partA.stockQty;
  const initialStockB = partB.stockQty;
  const initialStockOthers = partOthers.stockQty;

  // Apply 10% discount on partA, edit partB single price at checkout, and include an 'others' part
  const editedPriceB = partB.price + 50;
  const grossA = partA.price * 2;
  const expectedDiscountA = Math.round((grossA * 10) / 100);
  const { nextState, createdBill } = executeAtomicBillTransaction(state, {
    customerName: 'Gurpreet Singh',
    customerPhone: '9876543210',
    customerVillage: 'Moga Road, Ludhiana',
    items: [
      { partId: partA.id, quantity: 2, discountPercent: 10 },
      { partId: partB.id, quantity: 1, discountPercent: 0, unitPrice: editedPriceB },
      { partId: partOthers.id, quantity: 3, discountPercent: 0 },
    ],
    paidAmount: 200,
    paymentMode: 'UPI',
    createdBy: 'tajharvester000',
  });

  const updatedPartA = nextState.parts.find((p) => p.id === partA.id)!;
  const updatedPartB = nextState.parts.find((p) => p.id === partB.id)!;
  const updatedPartOthers = nextState.parts.find((p) => p.id === partOthers.id)!;
  assert.equal(updatedPartA.stockQty, initialStockA - 2);
  assert.equal(updatedPartB.stockQty, initialStockB - 1);
  assert.equal(updatedPartB.price, editedPriceB);
  assert.equal(updatedPartOthers.stockQty, initialStockOthers - 3);

  assert.equal(createdBill.items.length, 3);
  assert.equal(createdBill.items[0].discountPercent, 10);
  assert.equal(createdBill.items[0].discount, expectedDiscountA);
  assert.equal(createdBill.items[0].lineTotal, grossA - expectedDiscountA);
  assert.equal(createdBill.items[1].unitPrice, editedPriceB);
  assert.equal(createdBill.items[2].partNumber, '--');

  const expectedSubtotal = grossA + editedPriceB + partOthers.price * 3;
  assert.equal(createdBill.subtotal, expectedSubtotal);
  assert.equal(createdBill.discountAmount, expectedDiscountA);
  assert.equal(createdBill.netTotal, expectedSubtotal - expectedDiscountA);
  assert.equal(createdBill.paidAmount, 200);
  assert.equal(createdBill.dueAmount, expectedSubtotal - expectedDiscountA - 200);
  assert.equal(createdBill.paymentMode, 'UPI');

  const tots = calculateBillTotals(createdBill.items, 0, 200);
  assert.equal(tots.discountAmount, expectedDiscountA);
  assert.equal(tots.netTotal, expectedSubtotal - expectedDiscountA);
});

test('recordDuePayment and deleteBillTransaction maintain transaction and due balance accuracy', () => {
  const state = generateInitialShopState();
  const activeDue = state.dues[0];
  const initialBalance = activeDue.balanceDue;
  assert.equal(activeDue.totalBilled - activeDue.totalPaid, initialBalance);

  const { nextState, updatedDue } = recordDuePayment(
    state,
    activeDue.id,
    500,
    'CASH',
    'Cash installment',
    'tajharvester000'
  );
  assert.equal(updatedDue.balanceDue, initialBalance - 500);
  assert.equal(updatedDue.totalBilled - updatedDue.totalPaid, updatedDue.balanceDue);

  // Deleting a partially paid bill restores stock and removes the bill and due record.
  const billWithDue = nextState.bills[0];
  const item = billWithDue.items[0];
  const stockBeforeVoid = nextState.parts.find((p) => p.id === item.partId)!.stockQty;

  const afterDelete = deleteBillTransaction(nextState, billWithDue.id, 'tajharvester000');
  const stockAfterDelete = afterDelete.parts.find((p) => p.id === item.partId)!.stockQty;
  assert.equal(stockAfterDelete, stockBeforeVoid + item.quantity);
  assert.equal(afterDelete.bills.some((bill) => bill.id === billWithDue.id), false);
  assert.equal(afterDelete.dues.some((due) => due.id === activeDue.id), false);
});

test('generateCsvBackup exports 4 separate CSVs (kubota, yanmar, gm, local) with 5 columns and importPartsFromCsv restores', () => {
  const state = generateInitialShopState();

  const kubotaCsv = generateCsvBackup(state.parts, 'kubota');
  const lines = kubotaCsv.split('\n');
  assert.equal(lines[0], 'Part Number,Part Name,Rack No,Count,Selling Price');
  assert.equal(lines.length, 261); // 1 header + 260 kubota parts

  const customCsv = [
    'Part Number,Part Name,Rack No,Count,Selling Price',
    'KB-9999,Kubota DC-68G - Special Auger Gear,Rack K-12,25,3450',
  ].join('\n');

  const imported = importPartsFromCsv(state, customCsv, 'tajharvester000');
  assert.equal(imported.addedCount, 1);
  const added = imported.nextState.parts.find((p) => p.partNumber === 'KB-9999')!;
  assert.equal(added.partSet, 'kubota');
  assert.equal(added.stockQty, 25);
  assert.equal(added.price, 3450);
});

test('multi-staff & owner concurrency: failed bill, duplicate void, or overpayment leaves state 100% untouched for safe redo', () => {
  const initialState = generateInitialShopState();
  const part1 = initialState.parts.find((p) => p.stockQty >= 5)!;
  const part2 = initialState.parts.find((p) => p.id !== part1.id && p.stockQty >= 5)!;

  // Staff 1 sells almost all of part2 so only 1 unit remains
  const { nextState: stateAfterStaff1, createdBill: staff1Bill } = executeAtomicBillTransaction(
    initialState,
    {
      customerName: 'Ramesh Mondal',
      customerPhone: '9832110022',
      customerVillage: 'Pandua, Hooghly',
      items: [{ partId: part2.id, quantity: part2.stockQty - 1, discount: 0 }],
      discountAmount: 0,
      paidAmount: 0,
      paymentMode: 'CASH',
      createdBy: 'staff_rahul',
    }
  );
  assert.equal(staff1Bill.invoiceNumber, 'INV-85-8901');

  const snapshotJson = JSON.stringify(stateAfterStaff1);

  // Staff 2 simultaneously tries to bill 2 units of part1 (valid) AND 3 units of part2 (now insufficient stock!)
  assert.throws(
    () =>
      executeAtomicBillTransaction(stateAfterStaff1, {
        customerName: 'Suresh Das',
        customerPhone: '9832998877',
        customerVillage: 'Jayer, Hooghly',
        items: [
          { partId: part1.id, quantity: 2, discount: 0 },
          { partId: part2.id, quantity: 3, discount: 0 },
        ],
        discountAmount: 0,
        paidAmount: 500,
        paymentMode: 'UPI',
        createdBy: 'staff_amit',
      }),
    /Insufficient stock/
  );

  // Verify ZERO partial changes occurred (part1 was NOT decremented, bills & dues untouched)
  assert.equal(JSON.stringify(stateAfterStaff1), snapshotJson);

  // Staff 2 can now immediately redo the bill with valid quantity (1 unit of part2)
  const { nextState: stateAfterRedo, createdBill: staff2Bill } = executeAtomicBillTransaction(stateAfterStaff1, {
    customerName: 'Suresh Das',
    customerPhone: '9832998877',
    customerVillage: 'Jayer, Hooghly',
    items: [
      { partId: part1.id, quantity: 2, discount: 0 },
      { partId: part2.id, quantity: 1, discount: 0 },
    ],
    discountAmount: 0,
    paidAmount: 500,
    paymentMode: 'UPI',
    createdBy: 'staff_amit',
  });
  assert.equal(staff2Bill.invoiceNumber, 'INV-85-8902');
  assert.equal(
    stateAfterRedo.parts.find((p) => p.id === part1.id)!.stockQty,
    part1.stockQty - 2
  );
  assert.equal(stateAfterRedo.parts.find((p) => p.id === part2.id)!.stockQty, 0);

  // Verify deleting the same bill twice fails cleanly without double-restoring stock
  const afterFirstDelete = deleteBillTransaction(stateAfterRedo, staff1Bill.id, 'tajharvester000');
  const deleteSnapshot = JSON.stringify(afterFirstDelete);
  assert.throws(
    () =>
      deleteBillTransaction(afterFirstDelete, staff1Bill.id, 'tajharvester000'),
    /Bill not found/
  );
  assert.equal(JSON.stringify(afterFirstDelete), deleteSnapshot);

  const { createdBill: reusedInvoiceBill } = executeAtomicBillTransaction(afterFirstDelete, {
    customerName: 'New Customer',
    customerPhone: '9832000000',
    customerVillage: 'Pandua',
    items: [{ partId: part2.id, quantity: 1, discount: 0 }],
    discountAmount: 0,
    paidAmount: 0,
    paymentMode: 'CASH',
    createdBy: 'tajharvester000',
  });
  assert.equal(reusedInvoiceBill.invoiceNumber, 'INV-85-8901');
});

test('buildCustomerLedgerSheetData, generateCustomerLedgerCsv, generateAllDuesCsv, and generateSalesCsv produce accurate Excel-style output', () => {
  const initialState = generateInitialShopState();
  const firstDue = initialState.dues[0];

  assert.equal(formatDateDotDisplay('2026-10-18T09:15:00.000Z'), '18.10.2026');

  // Before any receipt voucher payment
  const initialSheet = buildCustomerLedgerSheetData(firstDue, initialState.bills);
  assert.equal(initialSheet.billRows.length, 1);
  assert.equal(initialSheet.billRows[0].billNo, 'INV-2026-1001');
  assert.equal(initialSheet.billRows[0].date, '18.10.2026');
  assert.equal(initialSheet.billRows[0].dueAmount, firstDue.balanceDue);
  assert.equal(initialSheet.receiptRows.length, 0);
  assert.equal(initialSheet.totalBillDue, firstDue.balanceDue);
  assert.equal(initialSheet.totalReceiptPaid, 0);
  assert.equal(initialSheet.remainingBalance, firstDue.balanceDue);

  // Record a subsequent receipt voucher payment of Rs. 1,200
  const { nextState, updatedDue } = recordDuePayment(
    initialState,
    firstDue.id,
    1200,
    'UPI',
    'Voucher #108',
    'tajharvester000',
    '2026-10-20T10:00:00.000Z'
  );

  const afterSheet = buildCustomerLedgerSheetData(updatedDue, nextState.bills);
  assert.equal(afterSheet.billRows.length, 1);
  assert.equal(afterSheet.totalBillDue, firstDue.balanceDue);
  assert.equal(afterSheet.receiptRows.length, 1);
  assert.equal(afterSheet.receiptRows[0].date, '20.10.2026');
  assert.equal(afterSheet.receiptRows[0].paidAmount, 1200);
  assert.equal(afterSheet.totalReceiptPaid, 1200);
  assert.equal(afterSheet.remainingBalance, firstDue.balanceDue - 1200);

  // Verify single-customer side-by-side Excel CSV
  const customerCsv = generateCustomerLedgerCsv(updatedDue, nextState.bills);
  const csvLines = customerCsv.split('\n');
  assert.equal(
    csvLines[1],
    'BILL NO,DATE,DUE AMOUNT,,DATE,RECEIPT VOUCHER NO,PAID AMOUNT,,TOTAL AMOUNT PAID / NET DUE'
  );
  assert.equal(csvLines[2].includes('INV-2026-1001,18.10.2026,'), true);
  assert.equal(csvLines[2].includes('RV-01 (UPI) · Voucher #108,1200'), true);
  assert.equal(
    csvLines[csvLines.length - 1],
    `,TOTAL,${firstDue.balanceDue},,,TOTAL,1200,,${firstDue.balanceDue - 1200}`
  );

  // Verify All Dues CSV and Sales CSV
  const allDuesCsv = generateAllDuesCsv(nextState.dues, nextState.bills);
  assert.equal(allDuesCsv.split('\n').length, nextState.dues.length + 1);
  assert.equal(allDuesCsv.includes('Balwinder Singh Sandhu'), true);

  const salesCsv = generateSalesCsv(nextState.bills);
  assert.equal(salesCsv.split('\n').length, nextState.bills.length + 1);
  assert.equal(salesCsv.includes('INV-2026-1001'), true);
  assert.equal(salesCsv.includes('Invoice Number,Date,Customer Name'), true);
});

test('generateXlsxBufferFromCsv, generateAllDuesXlsxBuffer, and parseXlsxBufferToCsv generate valid native Excel (.xlsx) workbooks and round-trip parts restore', () => {
  const initialState = generateInitialShopState();
  const kubotaCsv = generateCsvBackup(initialState.parts, 'kubota');

  // Generate .xlsx binary buffer from Kubota CSV
  const kubotaXlsx = generateXlsxBufferFromCsv(kubotaCsv, 'Kubota_Parts');
  assert.equal(kubotaXlsx instanceof Uint8Array, true);
  assert.equal(kubotaXlsx.byteLength > 1000, true);
  // ZIP/XLSX magic header PK (0x50, 0x4B)
  assert.equal(kubotaXlsx[0], 0x50);
  assert.equal(kubotaXlsx[1], 0x4b);

  // Round-trip parse .xlsx buffer back to CSV and import
  const parsedCsv = parseXlsxBufferToCsv(kubotaXlsx);
  const parsedLines = parsedCsv.split('\n');
  assert.equal(parsedLines[0], 'Part Number,Part Name,Rack No,Count,Selling Price');
  assert.equal(parsedLines.length, 261);

  // Generate multi-sheet All Customer Dues .xlsx workbook
  const allDuesXlsx = generateAllDuesXlsxBuffer(initialState.dues, initialState.bills);
  assert.equal(allDuesXlsx instanceof Uint8Array, true);
  assert.equal(allDuesXlsx[0], 0x50);
  assert.equal(allDuesXlsx[1], 0x4b);
  assert.equal(allDuesXlsx.byteLength > 1500, true);
});

test('extractShopPartsFromAoA, inspectXlsxWorkbook, and importPartsFromCsv handle all 4 real shop Excel formats (-- for missing description, Count = 0, decimal rates, ignored extra columns)', () => {
  // 1. TAJ HARVESTER sheet (merged empty columns D-E & G-J, decimal prices 115.5, 21.72, 683.86)
  const tajHarvesterAoA = [
    ['TAJ HARVESTER', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', ''],
    ['SL NO', 'PART NO', 'DESCRIPTION', '', '', 'SELLING RATE', '', '', '', '', 'POSITION'],
    [1, '1E6680-73040', 'STOPPER CHAFF DISCHARGE', '', '', 115.5, '', '', '', '', 'A1'],
    [2, '1E8550-84550', 'BUSH H S T ARM', '', '', 160, '', '', '', '', 'A1'],
    [13, '24311-000180', 'O RING P18', '', '', 21.72, '', '', '', '', 'A3'],
    [14, '1E8550-56330', 'BOLT ROUND HEAD 10*40', '', '', 683.86, '', '', '', '', 'A4'],
  ];
  const tajExtracted = extractShopPartsFromAoA(tajHarvesterAoA, {
    sheetName: 'YANMAR+KUBOTA',
    forceZeroCount: true,
  });
  assert.equal(tajExtracted.isShopFormat, true);
  assert.equal(tajExtracted.rows.length, 4);
  assert.equal(tajExtracted.rows[0].partNumber, '1E6680-73040');
  assert.equal(tajExtracted.rows[0].nameModel, 'STOPPER CHAFF DISCHARGE');
  assert.equal(tajExtracted.rows[0].price, 115.5);
  assert.equal(tajExtracted.rows[0].rackLocation, 'A1');
  assert.equal(tajExtracted.rows[0].stockQty, 0);
  assert.equal(tajExtracted.rows[2].price, 21.72);
  assert.equal(tajExtracted.rows[3].price, 683.86);

  // 2. YANMAR ORGINAL sheet (empty col A, headers SL.NO | PART NO | DESCRIPTION | RATE | POS | QTY on row 4, QTY ignored -> Count = 0)
  const yanmarOriginalAoA = [
    ['', 'YANMAR ORGINAL', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['', 'SL.NO', 'PART NO', 'DESCRIPTION', 'RATE', 'POS', 'QTY'],
    ['', 1, '1E8550-66320', 'CONVEYOR ASSY GRAIN', 4916, 'F6', 12],
    ['', 2, '1E8550-92620', 'COVER THRESHING R', 2848, 'OUT SIDE', 5],
  ];
  const yanmarExtracted = extractShopPartsFromAoA(yanmarOriginalAoA, {
    sheetName: 'Sheet1',
    forceZeroCount: true,
  });
  assert.equal(yanmarExtracted.detectedSet, 'yanmar');
  assert.equal(yanmarExtracted.rows.length, 2);
  assert.equal(yanmarExtracted.rows[0].stockQty, 0); // QTY 12 ignored -> 0
  assert.equal(yanmarExtracted.rows[1].rackLocation, 'OUT SIDE');

  // 3. KUBOTA ORIGINAL sheet (empty cols A-B, no rate column, missing DESCRIPTION -> '--', OPENING QTY & MATERIALS BALANCE #VALUE! ignored)
  const kubotaOriginalAoA = [
    ['', '', 'KUBOTA ORIGINAL', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    [
      '',
      '',
      'SR. NO.',
      'PART NO.',
      'DESCRIPTION',
      'POSITION',
      'OPENING QTY',
      'MATERIALS IN',
      'MATERIALS OUT',
      'MATERIALS BALANCE',
    ],
    ['', '', 1, '5T078-55515', '', 'K-B-7', 16, 40, '', 56],
    ['', '', 2, '5T057-42542', '', 'K-A-2', 20, '', '', '#VALUE!'],
    ['', '', 16, '5H601-41690', 'GUIDE', 'K-A-4', 50, '', '', 50],
  ];
  const kubotaExtracted = extractShopPartsFromAoA(kubotaOriginalAoA, {
    sheetName: 'KUBOTA ORIGINAL',
    forceZeroCount: true,
  });
  assert.equal(kubotaExtracted.detectedSet, 'kubota');
  assert.equal(kubotaExtracted.rows.length, 3);
  assert.equal(kubotaExtracted.rows[0].partNumber, '5T078-55515');
  assert.equal(kubotaExtracted.rows[0].nameModel, '--');
  assert.equal(kubotaExtracted.rows[0].rackLocation, 'K-B-7');
  assert.equal(kubotaExtracted.rows[0].stockQty, 0);
  assert.equal(kubotaExtracted.rows[0].price, 0);
  assert.equal(kubotaExtracted.rows[1].nameModel, '--');
  assert.equal(kubotaExtracted.rows[2].nameModel, 'GUIDE');

  // 4. Multi-tab workbook GAM.xlsx (KUBOTA ORIGINAL SAPRE, HISAB skipped, Sheet1 with GAM parts & multiline description)
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kubotaOriginalAoA), 'KUBOTA ORIGINAL SAPRE');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['CUSTOMER HISAB', 'AMOUNT'],
      ['Ramesh', 5000],
    ]),
    'HISAB'
  );
  const gamAoA = [
    ['GAM', '', '', '', ''],
    ['', '', '', '', ''],
    ['SL NO', 'PART NO', 'DESCRIPTION', 'SELLING RATE', 'POSITION'],
    [1, 'W1.8-33-06-04-00A', 'SHOE SIEVE CRANK', 4000, 'GAM'],
    [20, 'WD-88-01-49-00', 'Belt, 2SB Type,\nUpper Shaft, Gearbox', 1900, 'GAM'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gamAoA), 'Sheet1');
  const gamBuffer = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

  const inspected = inspectXlsxWorkbook(gamBuffer, 'GAM.xlsx', true);
  assert.equal(inspected.sheets[inspected.preferredSheetIndex].sheetName, 'Sheet1');
  const gamSheet = inspected.sheets.find((s) => s.sheetName === 'Sheet1')!;
  assert.equal(gamSheet.detectedSet, 'gm');
  assert.equal(gamSheet.rowCount, 2);
  const kubotaSheet = inspected.sheets.find((s) => s.sheetName === 'KUBOTA ORIGINAL SAPRE')!;

  // Import into shop state with replaceTargetSet = true & forceZeroCount = true
  const state = generateInitialShopState();
  const importedKubota = importPartsFromCsv(
    state,
    kubotaSheet.csvText,
    'tajharvester000',
    undefined,
    'kubota',
    { forceZeroCount: true, replaceTargetSet: true }
  );
  const kubotaPartsAfter = importedKubota.nextState.parts.filter((p) => p.partSet === 'kubota');
  assert.equal(kubotaPartsAfter.length, 3);
  assert.equal(kubotaPartsAfter[0].partNumber, '5T078-55515');
  assert.equal(kubotaPartsAfter[0].nameModel, '--');
  assert.equal(kubotaPartsAfter[0].stockQty, 0);
  assert.equal(kubotaPartsAfter[0].price, 0);
  assert.equal(kubotaPartsAfter[2].partNumber, '5H601-41690');
  assert.equal(kubotaPartsAfter[2].nameModel, 'GUIDE');

  // Verify 100% of Excel rows (including duplicate PART NO 52200-23142, numeric PART NO 7121, blank PART NO, and blank DESCRIPTION)
  // are placed directly into the selected dataset ('local') without dropping or splitting any row
  const mixedShopCsv = [
    'SL NO,PART NO,DESCRIPTION,SELLING RATE,POSITION',
    '1,1E6680-73040,"SLEEVE, 35X45X17",80,A1',
    '2,7121,"SENSOR, VOLUME 1.14K",3950,A6',
    '3,52200-23142,"SEAL,OIL",126,B2',
    '4,52200-23142,"SEAL,OIL (GOOD QUALITY)",200,B2',
    '5,,BOLT SEMS,70,C1',
    '6,,,4180,D TOP',
  ].join('\n');
  const replacedLocal = importPartsFromCsv(
    importedKubota.nextState,
    mixedShopCsv,
    'tajharvester000',
    undefined,
    'local',
    { forceZeroCount: true, replaceTargetSet: true }
  );
  const localPartsAfter = replacedLocal.nextState.parts.filter((p) => p.partSet === 'local');
  assert.equal(localPartsAfter.length, 6);
  assert.equal(localPartsAfter[0].partNumber, '1E6680-73040');
  assert.equal(localPartsAfter[1].partNumber, '7121');
  assert.equal(localPartsAfter[1].nameModel, 'SENSOR, VOLUME 1.14K');
  assert.equal(localPartsAfter[2].partNumber, '52200-23142');
  assert.equal(localPartsAfter[2].nameModel, 'SEAL,OIL');
  assert.equal(localPartsAfter[3].partNumber, '52200-23142');
  assert.equal(localPartsAfter[3].nameModel, 'SEAL,OIL (GOOD QUALITY)');
  assert.equal(localPartsAfter[4].partNumber, '--');
  assert.equal(localPartsAfter[4].nameModel, 'BOLT SEMS');
  assert.equal(localPartsAfter[5].partNumber, '--');
  assert.equal(localPartsAfter[5].nameModel, '--');
  assert.equal(localPartsAfter[5].rackLocation, 'D TOP');
  assert.equal(localPartsAfter[5].price, 4180);
});

test('paginateBillItemsForPrint splits a 35-item invoice across 3 A4 pages (15 + 15 + 5) and preserves every item and total', () => {
  const parts = generateSeedParts(60);
  const thirtyFiveItems = parts.slice(0, 35).map((p, idx) => {
    const qty = (idx % 4) + 1;
    const disc = idx % 7 === 0 ? 40 : 0;
    return {
      partId: p.id,
      partSet: p.partSet,
      partNumber: p.partNumber,
      nameModel: p.nameModel,
      unitPrice: p.price,
      quantity: qty,
      discount: disc,
      lineTotal: p.price * qty - disc,
    };
  });

  const pages = paginateBillItemsForPrint(thirtyFiveItems, 15);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].pageNumber, 1);
  assert.equal(pages[0].totalPages, 3);
  assert.equal(pages[0].items.length, 15);
  assert.equal(pages[1].pageNumber, 2);
  assert.equal(pages[1].items.length, 15);
  assert.equal(pages[2].pageNumber, 3);
  assert.equal(pages[2].items.length, 5);
  assert.equal(pages[2].startIndex, 30);

  // Also test Customer Credit Report Excel import (like Akash Mandi (6297131376).xlsx)
  const creditAoA = [
    ['', '', '', "CUSTOMER'S CREDIT REPORT", '', '', '', '', ''],
    ['BILL NO', 'DATE', 'DUE AMOUNT', '', 'DATE', 'RECEIPT VOUCHER NO', 'PAID AMOUNT', '', 'TOTAL AMOUNT PAID'],
    [13, '03.11.2025', 8620, '', '25.12.2025', 14, 5000, '', 3620],
    ['', 'TOTAL', 8620, '', '', 'TOTAL', 5000, '', ''],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(creditAoA), 'Sheet1');
  const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));

  const parsedDues = parseDuesFromXlsxBuffer(buf, 'Akash Mandi (6297131376).xlsx');
  assert.equal(parsedDues.length, 1);
  assert.equal(parsedDues[0].customerName, 'Akash Mandi');
  assert.equal(parsedDues[0].customerPhone, '6297131376');
  assert.equal(parsedDues[0].totalBilled, 8620);
  assert.equal(parsedDues[0].totalPaid, 5000);
  assert.equal(parsedDues[0].balanceDue, 3620);
  assert.equal(parsedDues[0].invoiceNumbers[0], '13');

  const initialState = generateInitialShopState();
  const afterImport = importDuesRecords(initialState, parsedDues, true, 'tajharvester000');
  assert.equal(afterImport.nextState.dues.length, 1);
  assert.equal(afterImport.nextState.dues[0].customerName, 'Akash Mandi');

  // Verify ledger sheet renders imported bill row and receipt row
  const ledger = buildCustomerLedgerSheetData(afterImport.nextState.dues[0], afterImport.nextState.bills);
  assert.equal(ledger.billRows.length, 1);
  assert.equal(ledger.billRows[0].billNo, '13');
  assert.equal(ledger.billRows[0].dueAmount, 8620);
  assert.equal(ledger.receiptRows.length, 1);
  assert.equal(ledger.receiptRows[0].paidAmount, 5000);
  assert.equal(ledger.remainingBalance, 3620);
});

test('getDuplicateCustomerAnalysis, isCustomerPhoneMissing, updateCustomerDueDetails, and deleteCustomerDueRecord handle duplicates, missing phones, and customer edits', () => {
  assert.equal(isCustomerPhoneMissing('—'), true);
  assert.equal(isCustomerPhoneMissing('N/A'), true);
  assert.equal(isCustomerPhoneMissing(''), true);
  assert.equal(isCustomerPhoneMissing('9766078960'), false);

  const state = generateInitialShopState();
  const sampleDues = [
    {
      ...state.dues[0],
      id: 'd-1',
      customerName: 'ABBAS SARBAMANGALA',
      customerPhone: '9766078960',
      customerVillage: 'Pandua',
    },
    {
      ...state.dues[0],
      id: 'd-2',
      customerName: 'ABBAS SARBAMANGALA - Copy - Copy',
      customerPhone: '—',
      customerVillage: 'Copy',
    },
    {
      ...state.dues[0],
      id: 'd-3',
      customerName: 'Ramesh Kumar',
      customerPhone: '9766078960',
      customerVillage: 'Hooghly',
    },
  ];

  const dupMap = getDuplicateCustomerAnalysis(sampleDues);
  assert.equal(dupMap.has('d-1'), true);
  assert.equal(dupMap.has('d-2'), true);
  assert.equal(dupMap.has('d-3'), true);
  assert.equal(dupMap.get('d-1')?.isDuplicateName, true);
  assert.equal(dupMap.get('d-1')?.isDuplicatePhone, true);

  const stateWithSamples = { ...state, dues: sampleDues };
  const { nextState, updatedDue } = updateCustomerDueDetails(stateWithSamples, 'd-2', {
    customerName: 'Abbas Dwarpara',
    customerPhone: '9832112233',
    customerVillage: 'Beleshwar',
  });
  assert.equal(updatedDue.customerName, 'Abbas Dwarpara');
  assert.equal(updatedDue.customerPhone, '9832112233');
  assert.equal(updatedDue.customerVillage, 'Beleshwar');

  const afterDelete = deleteCustomerDueRecord(nextState, 'd-3', 'tajharvester000');
  assert.equal(afterDelete.nextState.dues.length, 2);
});

test('getDuplicatePartNumberSet and filterAndSearchParts with DUPLICATE_PART_NO detect and group duplicate part numbers', () => {
  const state = generateInitialShopState();
  const basePart = state.parts[0];
  const partsWithDuplicates = [
    ...state.parts,
    {
      ...basePart,
      id: 'dup-part-1',
      partNumber: basePart.partNumber,
      nameModel: basePart.nameModel,
    },
    {
      ...basePart,
      id: 'others-no-code-1',
      partSet: 'others' as const,
      partNumber: 'N/A',
      nameModel: 'Loose Bolt',
    },
    {
      ...basePart,
      id: 'others-no-code-2',
      partSet: 'others' as const,
      partNumber: 'N/A',
      nameModel: 'Loose Nut',
    },
  ];

  assert.equal(normalizePartNumberForDupCheck('N/A', 'others'), '');
  assert.equal(getPartDuplicateKey({ ...basePart, nameModel: 'Different Description' }), `${basePart.partNumber}::different description`);
  assert.equal(getDuplicatePartKeySet(partsWithDuplicates, 'ALL').has(getPartDuplicateKey(basePart)), true);
  assert.equal(
    getDuplicatePartKeySet(partsWithDuplicates, 'ALL').has(
      getPartDuplicateKey({ ...basePart, nameModel: 'Different Description' })
    ),
    false
  );
  assert.equal(normalizePartNumberForDupCheck('--', 'kubota'), '');
  assert.equal(normalizePartNumberForDupCheck(' kb-0001 ', 'kubota'), 'KB-0001');

  const dupSet = getDuplicatePartNumberSet(partsWithDuplicates, 'ALL');
  assert.equal(dupSet.has(basePart.partNumber.toUpperCase()), true);
  assert.equal(dupSet.has('N/A'), false);

  const filteredDups = filterAndSearchParts(partsWithDuplicates, '', 'DUPLICATE_PART_NO', 'ALL');
  assert.equal(filteredDups.length, 2);
  assert.equal(filteredDups[0].partNumber, basePart.partNumber);
  assert.equal(filteredDups[1].partNumber, basePart.partNumber);
});
