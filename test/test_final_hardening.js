/**
 * Sargalu Chicken POS - Final Security & Data Integrity Hardening Test Suite
 * Exhaustive regression tests verifying all mandatory fixes:
 * 1. block_deletion_of_batches_with_history (P0)
 * 2. remove_all_silent_negative_to_positive_conversion (P0)
 * 3. strict_settings_validation (P0)
 * 4. strict_expense_unit_price_validation (P0)
 * 5. eliminate_inline_event_handler_xss (P0)
 * 6. complete_backup_validation (P1)
 * 7. receipt_number_parser_hardening (P1)
 */

const assert = require('assert');

// Mock localStorage in Node
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { for (let k in storage) delete storage[k]; }
};
global.window = global;

// Load db.js
require('../js/db.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  // Reset storage state before each test scenario for deterministic isolation
  global.db.clearAllData();
  try {
    fn();
    console.log(`  ✅ [تێپەڕی]: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [شکست]: ${name}`);
    console.error(`     هەڵە: ${err.message}`);
    throw err;
  }
}

console.log('================================================================');
console.log('    دەستپێکردنی پشکنینی توندی ئاسایش و ڕاستیی داتا (Final Hardening)   ');
console.log('================================================================\n');

// ---------------- 1. BLOCK DELETION OF BATCHES WITH HISTORY ----------------
console.log('١. پشکنینی پاراستنی بار لە سڕینەوە لە کاتی هەبوونی فرۆشتن یان زیان:');

test('بارێک کە فرۆشتنی پێوە بەسترابێتەوە ناتوانرێت بسڕدرێتەوە و هەڵە دەدات', () => {
  const batch = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    cages_count: 5,
    total_chickens: 50,
    total_weight_kg: 100,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  const sale = global.db.saveSale({
    batch_id: batch.batch_id,
    item_type: 'مریشکی ناسک',
    chickens_count: 1,
    weight_kg: 2.0
  });

  assert.throws(() => {
    global.db.deleteBatch(batch.batch_id);
  }, /ناتوانرێت ئەم بارە بسڕدرێتەوە/, 'Must block batch deletion when linked sales exist');

  // Verify batch and sale are completely preserved
  assert.strictEqual(global.db.getBatches().length, 1, 'Batch must remain in storage');
  assert.strictEqual(global.db.getSales().length, 1, 'Sale must remain in storage');
});

test('بارێک کە زیانی مرداربوونەوەی پێوە بەسترابێتەوە ناتوانرێت بسڕدرێتەوە', () => {
  const batch = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    cages_count: 5,
    total_chickens: 50,
    total_weight_kg: 100,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  const loss = global.db.saveLoss({
    batch_id: batch.batch_id,
    chickens_count: 2,
    estimated_weight_kg: 4.0
  });

  assert.throws(() => {
    global.db.deleteBatch(batch.batch_id);
  }, /ناتوانرێت ئەم بارە بسڕدرێتەوە/, 'Must block batch deletion when linked losses exist');

  assert.strictEqual(global.db.getBatches().length, 1, 'Batch must remain');
  assert.strictEqual(global.db.getLosses().length, 1, 'Loss must remain');
});

test('باری بەکارنەهاتوو (بەبێ فرۆشتن و زیان) بە سەرکەوتوویی دەسڕدرێتەوە', () => {
  const batch1 = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    cages_count: 2,
    total_weight_kg: 40,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  const batch2 = global.db.saveBatch({
    poultry_type: 'مریشکی ناسک',
    cages_count: 3,
    total_weight_kg: 60,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  assert.strictEqual(global.db.getBatches().length, 2);

  // Delete batch2 (which was active)
  global.db.deleteBatch(batch2.batch_id);

  const remaining = global.db.getBatches();
  assert.strictEqual(remaining.length, 1, 'One batch should remain');
  assert.strictEqual(remaining[0].batch_id, batch1.batch_id);

  // Active batch must safely point to batch1, not batch2
  assert.strictEqual(global.db.getActiveBatch().batch_id, batch1.batch_id);
});

// ---------------- 2. REMOVE ALL SILENT NEGATIVE-TO-POSITIVE CONVERSIONS ----------------
console.log('\n٢. پشکنینی نەهێشتنی گۆڕینی بێدەنگی ژمارەی سالب (Strict Negative Rejection):');

test('saveBatch گشت ژمارە نێگەتیڤ و صفرەکان بۆ نرخ ڕەتدەکاتەوە', () => {
  assert.throws(() => {
    global.db.saveBatch({ cages_count: -1, total_weight_kg: 50, buy_price_per_kg: 2000, sell_price_per_kg: 2500 });
  }, /ژمارەی قەفەزەکان دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveBatch({ cages_count: 2, total_weight_kg: -50, buy_price_per_kg: 2000, sell_price_per_kg: 2500 });
  }, /کۆی کێشی بارەکە دەبێت گەورەتر بێت لە صفر/);

  assert.throws(() => {
    global.db.saveBatch({ cages_count: 2, total_weight_kg: 50, buy_price_per_kg: -2000, sell_price_per_kg: 2500 });
  }, /نرخی کڕین دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveBatch({ cages_count: 2, total_weight_kg: 50, buy_price_per_kg: 0, sell_price_per_kg: 2500 });
  }, /نرخی کڕین دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/, 'saveBatch must reject buy_price_per_kg: 0');

  assert.throws(() => {
    global.db.saveBatch({ cages_count: 2, total_weight_kg: 50, buy_price_per_kg: 2000, sell_price_per_kg: -2500 });
  }, /نرخی فرۆشتن دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveBatch({ cages_count: 2, total_weight_kg: 50, buy_price_per_kg: 2000, sell_price_per_kg: 0 });
  }, /نرخی فرۆشتن دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/, 'saveBatch must reject sell_price_per_kg: 0');
});

test('saveSale گشت ژمارە نێگەتیڤ و صفرەکان بۆ فرۆشتنی ئاسایی ڕەتدەکاتەوە بەڵام تەنها پاککردن قبوڵ دەکات', () => {
  const batch = global.db.saveBatch({ cages_count: 2, total_weight_kg: 50, buy_price_per_kg: 2000, sell_price_per_kg: 2500 });

  assert.throws(() => {
    global.db.saveSale({ batch_id: batch.batch_id, chickens_count: -2, weight_kg: 4.0 });
  }, /ژمارەی دانە دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveSale({ batch_id: batch.batch_id, chickens_count: 2, weight_kg: -4.0 });
  }, /کێشی سەر تەرازوو دەبێت گەورەتر بێت لە صفر/);

  assert.throws(() => {
    global.db.saveSale({ batch_id: batch.batch_id, chickens_count: 2, weight_kg: 4.0, sell_price_per_kg: -2500 });
  }, /نرخی فرۆشتن دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveSale({ batch_id: batch.batch_id, chickens_count: 2, weight_kg: 4.0, sell_price_per_kg: 0 });
  }, /نرخی فرۆشتن دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/, 'saveSale must reject sell_price_per_kg: 0 for normal sales');

  assert.throws(() => {
    global.db.saveSale({ batch_id: batch.batch_id, chickens_count: 2, weight_kg: 4.0, cleaning_fee_per_chicken: -1500 });
  }, /کرێی پاککردن ناتوانێت سالب بێت/);

  // Cleaning-only service sale with sell_price_per_kg: 0 must succeed
  const serviceSale = global.db.saveSale({
    item_type: 'تەنها پاککردن',
    is_service_only: true,
    chickens_count: 3,
    sell_price_per_kg: 0,
    cleaning_fee_per_chicken: 1500
  });
  assert.strictEqual(serviceSale.is_service_only, true);
  assert.strictEqual(serviceSale.sell_price_per_kg, 0);
  assert.strictEqual(serviceSale.total_amount, 4500);
});

test('saveLoss گشت ژمارە نێگەتیڤەکان ڕەتدەکاتەوە', () => {
  const batch = global.db.saveBatch({ cages_count: 2, total_weight_kg: 50, buy_price_per_kg: 2000, sell_price_per_kg: 2500 });

  assert.throws(() => {
    global.db.saveLoss({ batch_id: batch.batch_id, chickens_count: -1, estimated_weight_kg: 2.0 });
  }, /ژمارەی مریشکی مرداربوو دەبێت لە صفر گەورەتر بێت/);

  assert.throws(() => {
    global.db.saveLoss({ batch_id: batch.batch_id, chickens_count: 1, estimated_weight_kg: -2.0 });
  }, /کێشی زیان ناتوانێت سالب بێت/);
});

test('saveExpense گشت ژمارە نێگەتیڤەکان ڕەتدەکاتەوە', () => {
  assert.throws(() => {
    global.db.saveExpense({ total_cost: -5000, quantity: 1 });
  }, /بڕی پارەی خەرجی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveExpense({ total_cost: 5000, quantity: -1 });
  }, /بڕی \(چەندێتی\) خەرجی دەبێت گەورەتر بێت لە صفر/);
});

// ---------------- 3. STRICT SETTINGS VALIDATION ----------------
console.log('\n٣. پشکنینی ورد و تۆکمەی ڕێکخستنەکان (Strict Settings Validation):');

test('saveSettings بە نرخی سالب یان نادرووست شکست دەهێنێت و داتای پێشوو دەپارێزێت', () => {
  const originalSettings = global.db.getSettings();
  const prevRent = originalSettings.monthly_rent;

  assert.throws(() => {
    global.db.saveSettings({ monthly_rent: -1 });
  }, /کرێی مانگانەی دوکان دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.strictEqual(global.db.getSettings().monthly_rent, prevRent, 'Monthly rent must remain unchanged after error');

  assert.throws(() => {
    global.db.saveSettings({ default_sell_price_per_kg: 0 });
  }, /نرخی فرۆشتنی بنەڕەتی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveSettings({ default_buy_price_per_kg: Infinity });
  }, /نرخی کڕینی بنەڕەتی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    global.db.saveSettings({ default_sell_price_per_kg: NaN });
  });

  // Cleaning fee can be 0 (for free service) but cannot be negative
  const updatedZeroFee = global.db.saveSettings({ cleaning_fee_per_chicken: 0 });
  assert.strictEqual(updatedZeroFee.cleaning_fee_per_chicken, 0, '0 IQD cleaning fee is supported for free service');

  assert.throws(() => {
    global.db.saveSettings({ cleaning_fee_per_chicken: -500 });
  }, /کرێی پاککردنی مریشک دەبێت ژمارەیەکی درووست و صفر یان گەورەتر بێت/);
});

// ---------------- 4. STRICT EXPENSE UNIT PRICE VALIDATION ----------------
console.log('\n٤. پشکنینی وردی نرخی تاکی خەرجی (Expense Unit Price Validation):');

test('saveExpense لە کاتی دیاریکردنی نرخی سالب یان صفر هەڵە دەدات', () => {
  assert.throws(() => {
    global.db.saveExpense({ total_cost: 10000, quantity: 2, unit_price: -9 });
  }, /نرخی تاک ناتوانێت سالب یان صفر بێت/);

  assert.throws(() => {
    global.db.saveExpense({ total_cost: 10000, quantity: 2, unit_price: 0 });
  }, /نرخی تاک ناتوانێت سالب یان صفر بێت/);

  assert.throws(() => {
    global.db.saveExpense({ total_cost: 10000, quantity: 2, unit_price: Infinity });
  });

  assert.throws(() => {
    global.db.saveExpense({ total_cost: 10000, quantity: 2, unit_price: NaN });
  });

  // When unit_price is omitted, it is automatically derived as Math.round(total / qty)
  const exp = global.db.saveExpense({ total_cost: 10000, quantity: 2 });
  assert.strictEqual(exp.unit_price, 5000, 'Derived unit price must be 5,000 IQD');
  assert.strictEqual(exp.total_cost, 10000);
});

// ---------------- 5. ELIMINATE INLINE EVENT HANDLER XSS & ID SAFETY ----------------
console.log('\n٥. پشکنینی ناسنامە سەلامەتەکان و نەهێشتنی هێرشی XSS (ID Sanitization & Safety):');

test('isSafeRecordId ناسنامە مەترسیدارەکان ڕەتدەکاتەوە', () => {
  assert.strictEqual(global.isSafeRecordId('batch_123_abc'), true);
  assert.strictEqual(global.isSafeRecordId('sale_2026-08-31'), true);
  assert.strictEqual(global.isSafeRecordId("x');alert(1);//"), false);
  assert.strictEqual(global.isSafeRecordId('<script>'), false);
  assert.strictEqual(global.isSafeRecordId('id with spaces'), false);
  assert.strictEqual(global.isSafeRecordId('id"quote'), false);
});

test('saveSale ناسنامەی مەترسیدار لە داتابەیس ڕەتدەکاتەوە', () => {
  assert.throws(() => {
    global.db.saveSale({
      sale_id: "x');alert(1);//",
      chickens_count: 1,
      weight_kg: 2.0
    });
  }, /ناسنامەی فرۆشتن نادرووستە/);
});

test('escapeHtml هەموو تاگە مەترسیدارەکان دەکاتە تێکستی ئاسایی', () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const clean = global.escapeHtml(malicious);
  assert.strictEqual(clean, '&lt;img src=x onerror=alert(1)&gt;');
  assert.ok(!clean.includes('<img'));
});

// ---------------- 6. COMPLETE TRANSACTIONAL BACKUP VALIDATION ----------------
console.log('\n٦. پشکنینی هاوردەکردنی تڕانزاکشن بە تەواوی ڕێساکانەوە (Complete Backup Validation):');

test('هاوردەکردنی JSON بە داتای کاتی نادرووست (timestamp) بە تەواوی ڕەتدەکرێتەوە', () => {
  const batch = global.db.saveBatch({ cages_count: 2, total_weight_kg: 40, buy_price_per_kg: 2000, sell_price_per_kg: 2500 });
  const countBefore = global.db.getBatches().length;

  const badBackup = {
    data: {
      sales: [{
        sale_id: 'sale_valid_01',
        timestamp: 'not-a-valid-date-string',
        chickens_count: 1,
        weight_kg: 2.0
      }]
    }
  };

  const res = global.db.importAllData(badBackup);
  assert.strictEqual(res.success, false, 'Import with invalid timestamp must fail');
  assert.strictEqual(global.db.getBatches().length, countBefore, 'Storage must not be modified');
});

test('هاوردەکردنی باکئەپ بە ناسنامەی مەترسیدار ڕەتدەکرێتەوە', () => {
  const countBefore = global.db.getBatches().length;

  const unsafeIdBackup = {
    data: {
      batches: [{
        batch_id: 'bad"id<script>',
        total_weight_kg: 50,
        cages_count: 2,
        buy_price_per_kg: 2000
      }]
    }
  };

  const res = global.db.importAllData(unsafeIdBackup);
  assert.strictEqual(res.success, false, 'Import with unsafe ID must fail');
  assert.strictEqual(global.db.getBatches().length, countBefore, 'Storage must remain untouched');
});

test('هاوردەکردنی باکئەپ بە ژمارەی Infinity یان NaN ڕەتدەکرێتەوە', () => {
  const badNumBackup = {
    data: {
      expenses: [{
        expense_id: 'exp_01',
        total_cost: 'Infinity',
        quantity: 1
      }]
    }
  };

  const res = global.db.importAllData(badNumBackup);
  assert.strictEqual(res.success, false);
});

test('هاوردەکردنی باکئەپ بە نرخی صفر بۆ بار یان فرۆشتنی ئاسایی بە ئەتۆمیک ڕەتدەکرێتەوە', () => {
  const countBefore = global.db.getBatches().length;

  const zeroBatchBackup = {
    data: {
      batches: [{
        batch_id: 'batch_01',
        total_weight_kg: 50,
        cages_count: 2,
        buy_price_per_kg: 0,
        sell_price_per_kg: 2500
      }]
    }
  };
  const res1 = global.db.importAllData(zeroBatchBackup);
  assert.strictEqual(res1.success, false, 'Import with buy_price_per_kg: 0 must fail');
  assert.strictEqual(global.db.getBatches().length, countBefore);

  const zeroSaleBackup = {
    data: {
      sales: [{
        sale_id: 'sale_01',
        chickens_count: 1,
        weight_kg: 2.0,
        sell_price_per_kg: 0,
        is_service_only: false
      }]
    }
  };
  const res2 = global.db.importAllData(zeroSaleBackup);
  assert.strictEqual(res2.success, false, 'Import normal sale with sell_price_per_kg: 0 must fail');

  // Service only with sell_price_per_kg: 0 must succeed
  const serviceSaleBackup = {
    data: {
      sales: [{
        sale_id: 'sale_service_01',
        chickens_count: 2,
        weight_kg: 0,
        sell_price_per_kg: 0,
        cleaning_fee_per_chicken: 1500,
        cleaning_total_fee: 3000,
        total_amount: 3000,
        is_service_only: true
      }]
    }
  };
  const res3 = global.db.importAllData(serviceSaleBackup);
  assert.strictEqual(res3.success, true, 'Import service-only sale with sell_price_per_kg: 0 must succeed');
});

test('هاوردەکردنی باکئەپی درووستی ئێستا و کۆن بە سەرکەوتوویی جێبەجێ دەبێت', () => {
  const batch = global.db.saveBatch({ cages_count: 2, total_weight_kg: 40, buy_price_per_kg: 2000, sell_price_per_kg: 2500 });
  const backup = global.db.exportAllData();

  global.db.clearAllData();
  assert.strictEqual(global.db.getBatches().length, 0);

  const res = global.db.importAllData(backup);
  assert.strictEqual(res.success, true);
  assert.strictEqual(global.db.getBatches().length, 1);
});

// ---------------- 7. RECEIPT NUMBER PARSER HARDENING ----------------
console.log('\n٧. پشکنینی توندی شیکەرەوەی ژمارەی وەسڵ (Receipt Parser Hardening):');

test('ژمارەی وەسڵی تێکچووی مێژوویی وەک 20260831-002abc زنجیرەکە تێک نادات', () => {
  const batch = global.db.saveBatch({ cages_count: 2, total_weight_kg: 40, buy_price_per_kg: 2000, sell_price_per_kg: 2500 });

  // Add a sale with malformed receipt_no
  global.db.saveSale({
    timestamp: '2026-08-31T10:00:00.000Z',
    receipt_no: '20260831-002abc', // Malformed suffix
    batch_id: batch.batch_id,
    chickens_count: 1,
    weight_kg: 2.0
  });

  // Generate next receipt number for 2026-08-31: should ignore 002abc safely and start at 001
  const nextRec = global.db.generateReceiptNumber('2026-08-31T11:00:00.000Z');
  assert.strictEqual(nextRec, '20260831-001', 'Must safely ignore malformed receipt number suffix');
});

console.log('\n================================================================');
console.log(` ئەنجامی پشکنینی ئاسایش و ڕاستیی داتا: ${passedTests} لە ${totalTests} تاقیکردنەوە بە سەرکەوتوویی تێپەڕین (100%)`);
console.log('================================================================\n');
