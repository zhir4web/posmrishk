/**
 * Sargalu Chicken POS - Critical Fixes Test Suite
 * Tests for:
 * 1. inventory_cross_day
 * 2. batch_cost_linking
 * 3. inventory_validation
 * 4. baghdad_business_dates
 * 5. strict negative rejection (no silent conversion)
 * 6. XSS protection
 */

const assert = require('assert');

// Mock localStorage for Node.js environment
const store = {};
global.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

// Load db.js
require('../js/db.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [تێپەڕی]: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [شکستی هێنا]: ${name}`);
    console.error(`     هەڵە: ${err.message}`);
    throw err;
  }
}

console.log('================================================================');
console.log('       دەستپێکردنی پشکنینی کێشە چارەنووسسازەکان (Critical Fixes)      ');
console.log('================================================================\n');

// ---------------- 1. BAGHDAD TIMEZONE TESTS ----------------
console.log('١. پشکنینی کات و بەرواری عێراق و بەغدا (Asia/Baghdad Timezone):');

test('بەرواری بەغدا بۆ 2026-08-30T22:30:00.000Z بە درووستی دەبێتە 2026-08-31', () => {
  const ts = '2026-08-30T22:30:00.000Z'; // 01:30 AM in Baghdad (UTC+3)
  const baghdadDate = global.getBaghdadDate(ts);
  assert.strictEqual(baghdadDate, '2026-08-31', `Expected 2026-08-31 but got ${baghdadDate}`);
});

test('مانگی بەغدا بۆ 2026-08-31T21:30:00.000Z دەبێتە 2026-09', () => {
  const ts = '2026-08-31T21:30:00.000Z'; // 00:30 AM Sept 1 in Baghdad
  const baghdadMonth = global.getBaghdadMonth(ts);
  assert.strictEqual(baghdadMonth, '2026-09', `Expected 2026-09 but got ${baghdadMonth}`);
});

test('فلتەرکردنی فرۆشتن بەپێی بەرواری بەغدا نەک UTC', () => {
  global.db.clearAllData();
  const ts1 = '2026-08-30T22:30:00.000Z'; // Aug 31 Baghdad
  const ts2 = '2026-08-30T20:30:00.000Z'; // Aug 30 Baghdad (23:30)

  // Create batch on Aug 30
  const batch = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    date: '2026-08-30',
    cages_count: 5,
    total_chickens: 50,
    total_weight_kg: 100,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  global.db.saveSale({
    timestamp: ts1,
    batch_id: batch.batch_id,
    item_type: 'مریشکی ناسک',
    chickens_count: 1,
    weight_kg: 2.0,
    is_cleaned: true
  });

  global.db.saveSale({
    timestamp: ts2,
    batch_id: batch.batch_id,
    item_type: 'مریشکی ناسک',
    chickens_count: 1,
    weight_kg: 2.0,
    is_cleaned: true
  });

  const salesAug31 = global.db.getSalesByDate('2026-08-31');
  const salesAug30 = global.db.getSalesByDate('2026-08-30');

  assert.strictEqual(salesAug31.length, 1, 'Aug 31 must have exactly 1 sale');
  assert.strictEqual(salesAug30.length, 1, 'Aug 30 must have exactly 1 sale');
  assert.ok(salesAug31[0].receipt_no.startsWith('20260831-'), 'Receipt number must use Baghdad date prefix 20260831');
});

// ---------------- 2. CROSS-DAY INVENTORY & CLOSING STOCK TESTS ----------------
console.log('\n٢. پشکنینی مانەوەی مەخزەن لە نێوان ڕۆژەکاندا (Cross-Day Stock Tracking):');

test('باری ٢٠ کگم لە 2026-08-30 دروست دەکرێت، ٢ کگم لە 2026-08-31 دەفرۆشرێت -> مەخزەنی ماوە دەبێت ١٨ کگم بێت', () => {
  global.db.clearAllData();

  const batch = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    date: '2026-08-30',
    cages_count: 1,
    total_chickens: 10,
    total_weight_kg: 20.0,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  // Sell 2 kg on 2026-08-31
  global.db.saveSale({
    timestamp: '2026-08-31T10:00:00.000Z',
    batch_id: batch.batch_id,
    item_type: 'مریشکی ناسک',
    chickens_count: 1,
    weight_kg: 2.0,
    is_cleaned: false
  });

  // Check batch stock
  const stock = global.db.getBatchStock(batch.batch_id, '2026-08-31');
  assert.strictEqual(stock.remaining_weight, 18.0, `Expected 18.0 kg remaining but got ${stock.remaining_weight}`);
  assert.strictEqual(stock.remaining_count, 9, `Expected 9 chickens remaining but got ${stock.remaining_count}`);

  // Check Daily report for 2026-08-31
  const reportAug31 = global.db.getDailyReport('2026-08-31');
  // Day activity: received on that day is 0 kg, sold is 2 kg
  assert.strictEqual(reportAug31.stock.received_weight, 0, 'Received weight on Aug 31 must be 0 kg');
  assert.strictEqual(reportAug31.stock.sold_weight, 2.0, 'Sold weight on Aug 31 must be 2 kg');
  // Closing stock at end of Aug 31 must be 18 kg
  assert.strictEqual(reportAug31.stock.remaining_weight, 18.0, 'Closing stock on Aug 31 must be 18 kg');
});

test('تۆمارکردنی زیانی مرداربوونەوە لە بەرواری دواتر لە هەمان بار کەم دەکرێتەوە', () => {
  const batches = global.db.getBatches();
  const batchId = batches[0].batch_id;

  // Record 1 kg loss on 2026-09-01
  global.db.saveLoss({
    timestamp: '2026-09-01T12:00:00.000Z',
    batch_id: batchId,
    chickens_count: 1,
    estimated_weight_kg: 1.0,
    reason: 'مرداربوونەوە لە قەفەز'
  });

  const stockSept01 = global.db.getBatchStock(batchId, '2026-09-01');
  assert.strictEqual(stockSept01.remaining_weight, 17.0, `Expected 17.0 kg remaining after loss but got ${stockSept01.remaining_weight}`);
  assert.strictEqual(stockSept01.remaining_count, 8, `Expected 8 chickens remaining but got ${stockSept01.remaining_count}`);
});

// ---------------- 3. BATCH COST LINKING & COGS TESTS ----------------
console.log('\n٣. پشکنینی پەیوەندی باری تێچوو و هەژمارکردنی COGS (Batch Cost Linking):');

test('فرۆشتنی بەستراوە بە باری A (تێچوو ١,٠٠٠) لە کاتێکدا باری B (تێچوو ٣,٠٠٠) کارایە، دەبێت تێچووی ١,٠٠٠ بەکاربێنێت', () => {
  global.db.clearAllData();

  const batchA = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    date: '2026-08-25',
    cages_count: 2,
    total_chickens: 20,
    total_weight_kg: 50.0,
    buy_price_per_kg: 1000,
    sell_price_per_kg: 2000
  });

  const batchB = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    date: '2026-08-30',
    cages_count: 2,
    total_chickens: 20,
    total_weight_kg: 50.0,
    buy_price_per_kg: 3000,
    sell_price_per_kg: 4000
  });

  // Batch B is active
  global.db.setActiveBatch(batchB.batch_id);

  // Save sale explicitly linked to batch A (5 kg)
  const sale = global.db.saveSale({
    batch_id: batchA.batch_id,
    item_type: 'مریشکی ناسک',
    chickens_count: 2,
    weight_kg: 5.0,
    sell_price_per_kg: 2000,
    is_cleaned: false
  });

  assert.strictEqual(sale.buy_price_per_kg, 1000, 'Sale must adopt Batch A buy price (1000)');
  assert.strictEqual(sale.cost_of_goods, 5000, 'COGS must be 5 kg * 1000 = 5000 IQD');
});

test('ڕەتکردنەوەی فرۆشتن بە IDـی باری نەبوو', () => {
  assert.throws(() => {
    global.db.saveSale({
      batch_id: 'non_existent_batch_id_999',
      item_type: 'مریشکی ناسک',
      chickens_count: 1,
      weight_kg: 2.0
    });
  }, /بوونی نییە لە مەخزەن/, 'Must throw error when batch_id does not exist');
});

test('ڕەتکردنەوەی فرۆشتنی جۆری پەلەوەر کە لەگەڵ باری دیاریکراو یەک ناگرێتەوە', () => {
  const batches = global.db.getBatches();
  const chickenBatchId = batches[0].batch_id; // poultry_type is 'مریشکی ناسک'

  assert.throws(() => {
    global.db.saveSale({
      batch_id: chickenBatchId,
      item_type: 'قاز', // Mismatched type
      chickens_count: 1,
      weight_kg: 3.0
    });
  }, /یەک ناگرێتەوە/, 'Must throw error when poultry type does not match batch type');
});

// ---------------- 4. INVENTORY VALIDATION & OVERSOLD SHORTAGE TESTS ----------------
console.log('\n٤. پشکنینی ڕێگری لە فرۆشتنی زیاتر لە مەخزەن (Inventory Validation):');

test('باری ١٠ کگم ناتوانێت فرۆشتنی ١٢ کگم قبوڵ بکات و هەڵە دەدات', () => {
  global.db.clearAllData();

  const batch = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    date: '2026-08-30',
    cages_count: 1,
    total_chickens: 5,
    total_weight_kg: 10.0,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  assert.throws(() => {
    global.db.saveSale({
      batch_id: batch.batch_id,
      item_type: 'مریشکی ناسک',
      chickens_count: 1,
      weight_kg: 12.0
    });
  }, /زیاترە لە کێشی بەردەست/, 'Must reject 12 kg sale from 10 kg batch');
});

test('فرۆشتنی ٨ کگم بە دوایدا داوای ٣ کگم زیان لە باری ١٠ کگم، دەبێت زیانەکە ڕەتبکرێتەوە', () => {
  const batches = global.db.getBatches();
  const batchId = batches[0].batch_id;

  // Sell 8 kg
  global.db.saveSale({
    batch_id: batchId,
    item_type: 'مریشکی ناسک',
    chickens_count: 3,
    weight_kg: 8.0,
    is_cleaned: false
  });

  // Now attempt to record 3 kg loss (only 2 kg remaining)
  assert.throws(() => {
    global.db.saveLoss({
      batch_id: batchId,
      chickens_count: 1,
      estimated_weight_kg: 3.0
    });
  }, /زیاترە لە کێشی بەردەست/, 'Must reject 3 kg loss when only 2 kg remain');
});

test('تەنها پاککردنی کڕیار (Service Only) بەبێ بار کار دەکات و دەستکاری مەخزەن ناکات', () => {
  global.db.clearAllData();

  const serviceSale = global.db.saveSale({
    item_type: 'تەنها پاککردن',
    is_service_only: true,
    service_target_name: 'مریشک',
    chickens_count: 4,
    cleaning_fee_per_chicken: 1500
  });

  assert.strictEqual(serviceSale.total_amount, 6000, 'Service sale total must be 4 * 1500 = 6000');
  assert.strictEqual(serviceSale.weight_kg, 0, 'Service sale weight must be 0');
  assert.strictEqual(serviceSale.cost_of_goods, 0, 'Service COGS must be 0');

  const closingStock = global.db.getClosingInventory();
  assert.strictEqual(closingStock.total_remaining_weight, 0, 'Closing stock remains untouched');
});

// ---------------- 5. STRICT INPUT VALIDATION (NO SILENT NEGATIVE CONVERSION) ----------------
console.log('\n٥. پشکنینی ڕەتکردنەوەی ژمارە نێگەتیڤەکان (Strict Validation without Math.abs):');

test('ڕەتکردنەوەی ژمارەی سالب لە فرۆشتن', () => {
  assert.throws(() => {
    global.db.saveSale({
      chickens_count: -2,
      weight_kg: 5.0
    });
  }, /دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveSale({
      chickens_count: 2,
      weight_kg: -4.5
    });
  }, /کێشی سەر تەرازوو دەبێت گەورەتر بێت لە صفر/);
});

test('ڕەتکردنەوەی ژمارەی سالب لە داخڵکردنی بار', () => {
  assert.throws(() => {
    global.db.saveBatch({
      cages_count: -1,
      total_weight_kg: 50,
      buy_price_per_kg: 2000,
      sell_price_per_kg: 2500
    });
  }, /ژمارەی قەفەزەکان دەبێت ژمارەیەکی درووست و گەورەتر لە سفر بێت/);

  assert.throws(() => {
    global.db.saveBatch({
      cages_count: 2,
      total_weight_kg: -50,
      buy_price_per_kg: 2000,
      sell_price_per_kg: 2500
    });
  }, /کۆی کێشی بارەکە دەبێت گەورەتر بێت لە صفر/);
});

test('ڕەتکردنەوەی خەرجی بە بڕی سالب یان صفر', () => {
  assert.throws(() => {
    global.db.saveExpense({
      category: 'غاز',
      total_cost: -5000
    });
  }, /بڕی پارەی خەرجی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveExpense({
      category: 'غاز',
      total_cost: 0
    });
  }, /بڕی پارەی خەرجی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);
});

// ---------------- 6. XSS PREVENTION HELPER TESTS ----------------
console.log('\n٦. پشکنینی پاککردنەوە و پاراستن لە هێرشی XSS:');

test('escapeHtml کارەکتەرە مەترسیدارەکانی تەگ دەگۆڕێت بۆ Entity', () => {
  const dirty = '<script>alert("XSS & Injection")</script>';
  const clean = global.escapeHtml(dirty);
  assert.strictEqual(clean, '&lt;script&gt;alert(&quot;XSS &amp; Injection&quot;)&lt;/script&gt;');
});

console.log('\n================================================================');
console.log(` ئەنجامی پشکنینی تایبەت: ${passedTests} لە ${totalTests} تاقیکردنەوە بە سەرکەوتوویی تێپەڕین (100%)`);
console.log('================================================================\n');
