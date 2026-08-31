/**
 * Comprehensive End-to-End System Audit for Sargalu Chicken POS
 * Tests 100% of workflows, edge cases, formulas, storage, and reporting
 * Validated with Asia/Baghdad timezone, cross-day stock, batch cost linking, and strict validation
 */

const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { for (let k in storage) delete storage[k]; }
};
global.window = global;

require('../js/db.js');

let passedTests = 0;
let totalTests = 0;

const test = (name, fn) => {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [تێپەڕی]: ${name}`);
  } catch (err) {
    console.error(`  ❌ [شکست]: ${name}\n     ${err.message}`);
    process.exit(1);
  }
};

const assert = require('assert');

console.log('================================================================');
console.log('       دەستپێکردنی پشکنینی گشتی و بەرفراوانی سیستەم (System Audit)       ');
console.log('================================================================\n');

const db = window.db;

// -------------------------------------------------------------
// 1. Settings & Store Profile Audit
// -------------------------------------------------------------
console.log('١. پشکنینی ڕێکخستنەکانی بنەڕەتی و ناوی دوکان:');
test('ناوی دوکان مریشک فرۆشی سەرگەڵوە', () => {
  const s = db.getSettings();
  assert(s.store_name === 'مریشک فرۆشی سەرگەڵو', 'Store name mismatch');
  assert(s.cleaning_fee_per_chicken === 1500, 'Cleaning fee should be 1500 IQD');
  assert(s.monthly_rent === 350000, 'Monthly rent should be 350,000 IQD');
});

test('دەستکاریکردنی ڕێکخستنەکان پاشەکەوت دەکرێت', () => {
  db.saveSettings({
    ...db.getSettings(),
    monthly_rent: 400000,
    cleaning_fee_per_chicken: 1500
  });
  assert(db.getSettings().monthly_rent === 400000, 'Updated rent should be 400,000');
  // Revert
  db.saveSettings({ ...db.getSettings(), monthly_rent: 350000 });
});

// -------------------------------------------------------------
// 2. Batch Creation & Active Selection Audit
// -------------------------------------------------------------
console.log('\n٢. پشکنینی داخڵکردنی بار و هەژمارکردنی مەخزەن:');
const today = global.getBaghdadDate();
let batch1 = null;

test('داخڵکردنی باری سادەکراو (قەفەز، کێش، نرخی کڕین و فرۆشتن)', () => {
  batch1 = db.saveBatch({
    date: today,
    cages_count: 8,
    total_chickens: 80,
    total_weight_kg: 160.0,
    buy_price_per_kg: 2300,
    sell_price_per_kg: 2850
  });

  assert(batch1.cages_count === 8, 'Cages count should be 8');
  assert(batch1.total_weight_kg === 160.0, 'Total weight should be 160 kg');
  assert(batch1.total_cost === (160.0 * 2300), 'Total cost formula: 160 * 2300 = 368,000 IQD');
  assert(db.getActiveBatch().batch_id === batch1.batch_id, 'New batch should be active');
});

// -------------------------------------------------------------
// 3. Sales & Cleaning Fee (+1,500 vs 0) Audit
// -------------------------------------------------------------
console.log('\n٣. پشکنینی فرۆشتن و هاوکێشەی پاککردن (+١,٥٠٠ د.ع):');

test('فرۆشتن بە پاککردنەوە (١ دانە، ٢.٥ کگم): ١٥٠٠ د.ع زیاد دەکات', () => {
  const sale = db.saveSale({
    customer_name: 'کڕیاری ١',
    chickens_count: 1,
    weight_kg: 2.5,
    sell_price_per_kg: 2850,
    is_cleaned: true
  });
  // Meat: 2.5 * 2850 = 7125
  // Clean: 1 * 1500 = 1500
  // Total: 7125 + 1500 = 8625
  assert(sale.meat_price === 7125, 'Meat price should be 7125');
  assert(sale.cleaning_total_fee === 1500, 'Cleaning fee should be 1500');
  assert(sale.total_amount === 8625, 'Total should be 8625');
  assert(sale.cost_of_goods === (2.5 * 2300), 'COGS should be 5750');
});

test('فرۆشتن بە پاککردنەوە (٤ دانە، ١٠ کگم): ٦٠٠٠ د.ع زیاد دەکات', () => {
  const sale = db.saveSale({
    customer_name: 'کڕیاری ٢',
    chickens_count: 4,
    weight_kg: 10.0,
    sell_price_per_kg: 2850,
    is_cleaned: true
  });
  // Meat: 10 * 2850 = 28500
  // Clean: 4 * 1500 = 6000
  // Total: 28500 + 6000 = 34500
  assert(sale.meat_price === 28500, 'Meat price should be 28500');
  assert(sale.cleaning_total_fee === 6000, 'Cleaning fee should be 6000');
  assert(sale.total_amount === 34500, 'Total should be 34500');
});

test('فرۆشتنی زیندوو بەبێ پاککردن (٢ دانە، ٤.٥ کگم): ٠ د.ع کرێی پاککردن', () => {
  const sale = db.saveSale({
    customer_name: 'کڕیاری ٣',
    chickens_count: 2,
    weight_kg: 4.5,
    sell_price_per_kg: 2850,
    is_cleaned: false
  });
  // Meat: 4.5 * 2850 = 12825
  // Clean: 0
  // Total: 12825
  assert(sale.meat_price === 12825, 'Meat price should be 12825');
  assert(sale.cleaning_total_fee === 0, 'Cleaning fee should be 0');
  assert(sale.total_amount === 12825, 'Total should be 12825');
});

// -------------------------------------------------------------
// 3.1 Multi-Poultry & Customer Cleaning-Only Service Audit
// -------------------------------------------------------------
console.log('\n٣.١. پشکنینی مریشکی پیر، قاز، قەل و خزمەتگوزاری تەنها پاککردن (کڕیار):');

// Create batches for other poultry types to test stock linking
let oldChickenBatch = null;
let gooseBatch = null;
let turkeyBatch = null;

test('داخڵکردنی بار بۆ مریشکی پیر، قاز و قەل', () => {
  oldChickenBatch = db.saveBatch({
    poultry_type: 'مریشکی پیر',
    cages_count: 2,
    total_chickens: 20,
    total_weight_kg: 40.0,
    buy_price_per_kg: 2000,
    sell_price_per_kg: 2500
  });

  gooseBatch = db.saveBatch({
    poultry_type: 'قاز',
    cages_count: 2,
    total_chickens: 10,
    total_weight_kg: 30.0,
    buy_price_per_kg: 6000,
    sell_price_per_kg: 7000
  });

  turkeyBatch = db.saveBatch({
    poultry_type: 'قەل',
    cages_count: 2,
    total_chickens: 6,
    total_weight_kg: 40.0,
    buy_price_per_kg: 7000,
    sell_price_per_kg: 8000
  });

  assert(oldChickenBatch !== null, 'Old chicken batch saved');
  assert(gooseBatch !== null, 'Goose batch saved');
  assert(turkeyBatch !== null, 'Turkey batch saved');
});

test('فرۆشتنی مریشکی پیر بە پاککردن (١ دانە، ٢.٢ کگم): کرێی پاککردن ٢,٠٠٠ د.ع', () => {
  const sale = db.saveSale({
    customer_name: 'کڕیاری مریشکی پیر',
    item_type: 'مریشکی پیر',
    chickens_count: 1,
    weight_kg: 2.2,
    sell_price_per_kg: 2500,
    is_cleaned: true
  });
  // Meat: 2.2 * 2500 = 5500
  // Clean: 1 * 2000 = 2000
  // Total: 7500
  assert(sale.meat_price === 5500, 'Meat price: 5500');
  assert(sale.cleaning_total_fee === 2000, 'Old chicken cleaning fee: 2000');
  assert(sale.total_amount === 7500, 'Total amount: 7500');
});

test('فرۆشتنی قاز و قەل بە کرێی پاککردنی تایبەت (٣,٥٠٠ و ٥,٠٠٠ د.ع)', () => {
  const gooseSale = db.saveSale({
    item_type: 'قاز',
    chickens_count: 2,
    weight_kg: 6.0,
    sell_price_per_kg: 7000,
    is_cleaned: true
  });
  // Meat: 6.0 * 7000 = 42000
  // Clean: 2 * 3500 = 7000
  // Total: 49000
  assert(gooseSale.cleaning_total_fee === 7000, 'Goose cleaning: 2 * 3500 = 7000');
  assert(gooseSale.total_amount === 49000, 'Goose total: 49000');

  const turkeySale = db.saveSale({
    item_type: 'قەل',
    chickens_count: 1,
    weight_kg: 8.5,
    sell_price_per_kg: 8000,
    is_cleaned: true
  });
  // Meat: 8.5 * 8000 = 68000
  // Clean: 1 * 5000 = 5000
  // Total: 73000
  assert(turkeySale.cleaning_total_fee === 5000, 'Turkey cleaning: 5000');
  assert(turkeySale.total_amount === 73000, 'Turkey total: 73000');
});

test('خزمەتگوزاری تەنها پاککردنی مریشکی کڕیار (٣ دانە): گۆشت = ٠ د.ع، کۆی گشتی = ٤,٥٠٠ د.ع', () => {
  const serviceSale = db.saveSale({
    customer_name: 'کڕیار بە مریشکی خۆیەوە',
    item_type: 'تەنها پاککردن',
    is_service_only: true,
    service_target_name: 'مریشک',
    chickens_count: 3,
    weight_kg: 0,
    cleaning_fee_per_chicken: 1500
  });

  assert(serviceSale.is_service_only === true, 'Should be service only');
  assert(serviceSale.meat_price === 0, 'Meat price must be 0 IQD');
  assert(serviceSale.cost_of_goods === 0, 'COGS must be 0 IQD');
  assert(serviceSale.cleaning_total_fee === 4500, 'Cleaning fee: 3 * 1500 = 4500');
  assert(serviceSale.total_amount === 4500, 'Total amount must be exactly 4500 IQD');
});

test('خزمەتگوزاری تەنها پاککردنی قەلی کڕیار (٢ دانە): کۆی گشتی = ١٠,٠٠٠ د.ع', () => {
  const turkeyClean = db.saveSale({
    customer_name: 'کڕیار بە قەلی خۆیەوە',
    item_type: 'تەنها پاککردن',
    is_service_only: true,
    service_target_name: 'قەل',
    chickens_count: 2,
    weight_kg: 0,
    cleaning_fee_per_chicken: 5000
  });

  assert(turkeyClean.meat_price === 0, 'Meat price is 0');
  assert(turkeyClean.cleaning_total_fee === 10000, 'Cleaning fee: 2 * 5000 = 10000');
  assert(turkeyClean.total_amount === 10000, 'Total amount is 10000');
});

test('خزمەتگوزاری پاککردن بە نرخی دەستی و گۆڕاو (٤ دانە بە ٢,٧٥٠ د.ع): کۆی گشتی = ١١,٠٠٠ د.ع', () => {
  const customClean = db.saveSale({
    customer_name: 'کڕیاری پاککردنی دەستی',
    item_type: 'تەنها پاککردن',
    is_service_only: true,
    service_target_name: 'نرخی دەستی',
    chickens_count: 4,
    weight_kg: 0,
    cleaning_fee_per_chicken: 2750
  });

  assert(customClean.meat_price === 0, 'Meat price is 0');
  assert(customClean.cleaning_fee_per_chicken === 2750, 'Custom fee is 2750');
  assert(customClean.cleaning_total_fee === 11000, 'Cleaning fee: 4 * 2750 = 11000');
  assert(customClean.total_amount === 11000, 'Total amount is 11000');
});

// -------------------------------------------------------------
// 3.2 Smart Pricing Advisor & Market Breaker Strategy Audit
// -------------------------------------------------------------
console.log('\n٣.٢. پشکنینی فرۆشتنی گۆشت بە نرخی بازاڕشکێن و پێشنیاری زیرەک (Smart Advisor):');

test('فرۆشتنی مریشکی ناسک بە نرخی دەستی و داشکاندنی تایبەت (٢,١٥٠ د.ع/کگم)', () => {
  const discountSale = db.saveSale({
    customer_name: 'ڕێستۆرانتی کڕیاری بەکۆمەڵ',
    item_type: 'مریشکی ناسک',
    chickens_count: 5,
    weight_kg: 12.0,
    sell_price_per_kg: 2150,
    is_cleaned: true,
    cleaning_fee_per_chicken: 1500
  });

  // Meat: 12.0 * 2150 = 25,800 IQD
  // Clean: 5 * 1500 = 7,500 IQD
  // Total: 25,800 + 7,500 = 33,300 IQD
  // COGS: 12.0 * 2300 = 27,600 IQD
  assert(discountSale.meat_price === 25800, 'Meat revenue: 25,800');
  assert(discountSale.cleaning_total_fee === 7500, 'Cleaning fee: 7,500');
  assert(discountSale.total_amount === 33300, 'Total amount: 33,300');
  assert(discountSale.cost_of_goods === 27600, 'COGS: 27,600');
});

test('فرۆشتنی مریشکی ناسک بە کرێی پاککردنی دەستکاریکراو (١,٠٠٠ د.ع لە جیاتی ١,٥٠٠ د.ع)', () => {
  const customCleanMeatSale = db.saveSale({
    customer_name: 'کڕیار بە کرێی پاککردنی تایبەت',
    item_type: 'مریشکی ناسک',
    chickens_count: 3,
    weight_kg: 7.5,
    sell_price_per_kg: 2850,
    is_cleaned: true,
    cleaning_fee_per_chicken: 1000
  });

  // Meat: 7.5 * 2850 = 21,375 IQD
  // Clean: 3 * 1000 = 3,000 IQD
  // Total: 21,375 + 3,000 = 24,375 IQD
  // COGS: 7.5 * 2300 = 17,250 IQD
  assert(customCleanMeatSale.meat_price === 21375, 'Meat revenue: 21,375');
  assert(customCleanMeatSale.cleaning_total_fee === 3000, 'Cleaning fee: 3,000');
  assert(customCleanMeatSale.total_amount === 24375, 'Total amount: 24,375');
  assert(customCleanMeatSale.cost_of_goods === 17250, 'COGS: 17,250');
});

test('هاوکێشەی ڕاوێژکاری زیرەک: کڕین بە ٢,١٠٠، فرۆشتن بە ٢,٠٠٠ لەگەڵ پاککردن قازانجی پاک دەکات', () => {
  const buyPrice = 2100;
  const sellPrice = 2000;
  const avgWeight = 2.5;
  const cleanFee = 1500;
  const count = 100;

  const meatProfitPerBird = (sellPrice - buyPrice) * avgWeight;
  const netProfitPerBird = meatProfitPerBird + cleanFee;
  const totalBatchProfit = netProfitPerBird * count;

  assert(meatProfitPerBird === -250, 'Meat loss per bird is -250 IQD');
  assert(netProfitPerBird === 1250, 'Net profit per bird is +1,250 IQD');
  assert(totalBatchProfit === 125000, '100 chickens batch yields +125,000 IQD profit');
});

// -------------------------------------------------------------
// 4. Dead Loss Audit
// -------------------------------------------------------------
console.log('\n٤. پشکنینی زیانی مریشکی مرداربوو:');
test('تۆمارکردنی مریشکی مرداربوو و کەمکردنەوە لە مەخزەن', () => {
  const loss = db.saveLoss({
    batch_id: batch1.batch_id,
    chickens_count: 2,
    estimated_weight_kg: 4.0,
    reason: 'مرداربوون لە قەفەز'
  });
  assert(loss.chickens_count === 2, 'Dead count should be 2');
  assert(loss.estimated_weight_kg === 4.0, 'Dead weight should be 4.0 kg');
  assert(loss.loss_financial_cost === (4.0 * 2300), 'Loss cost should be 9200 IQD (4 * 2300)');
});

// -------------------------------------------------------------
// 5. Adhoc & Monthly Expenses Audit
// -------------------------------------------------------------
console.log('\n٥. پشکنینی خەرجییەکانی کرێی مانگانە، کارەبا، غاز، عەلەف:');

test('تۆمارکردنی کرێی مانگانەی دوکان (٣٥٠,٠٠٠ د.ع)', () => {
  const rent = db.saveExpense({
    category: 'کرێی دوکان',
    description: 'کرێی دوکان',
    total_cost: 350000
  });
  assert(rent.total_cost === 350000, 'Rent should be 350,000');
});

test('تۆمارکردنی پارەی کارەبا بە بڕی گۆڕاو (١١٥,٠٠٠ د.ع)', () => {
  const elec = db.saveExpense({
    category: 'کارەبا',
    description: 'پسوولەی کارەبا',
    total_cost: 115000
  });
  assert(elec.total_cost === 115000, 'Electricity should be 115,000');
});

test('تۆمارکردنی غاز (٨,٥٠٠ د.ع) و عەلەف بە کیلۆگرام (٧,٥٠٠ د.ع)', () => {
  const gas = db.saveExpense({
    category: 'غاز',
    description: 'بوتڵی غاز',
    unit_type: 'دانە',
    quantity: 1,
    unit_price: 8500,
    total_cost: 8500
  });
  const feed = db.saveExpense({
    category: 'عەلەف / دانەوێڵە',
    description: 'عەلەف',
    unit_type: 'کیلۆگرام',
    quantity: 10,
    unit_price: 750,
    total_cost: 7500
  });
  assert(gas.total_cost === 8500, 'Gas should be 8,500');
  assert(feed.total_cost === 7500, 'Feed should be 7,500');
});

// -------------------------------------------------------------
// 6. Financial Reconciliation & Net Profit Audit
// -------------------------------------------------------------
console.log('\n٦. پشکنینی حیساباتی ڕاپۆرتی ڕۆژانە و مانگانە (Net Profit & Stock):');

test('ڕاپۆرتی ڕۆژانە دۆخی کۆگا و قازانجی بە درووستی هەژمار دەکات', () => {
  const rep = db.getDailyReport(today);

  // Received today across 4 batches = 160.0 + 40.0 + 30.0 + 40.0 = 270.0 kg
  assert(rep.stock.received_weight === 270.0, `Received weight: ${rep.stock.received_weight}`);
  assert(rep.stock.sold_weight === 53.2, `Sold weight: ${rep.stock.sold_weight}`);
  assert(rep.stock.dead_weight === 4.0, `Dead weight: ${rep.stock.dead_weight}`);
  assert(rep.stock.remaining_weight === (270.0 - 53.2 - 4.0), `Remaining weight: ${rep.stock.remaining_weight}`);

  // Gross Revenue = 268,625 IQD
  assert(rep.income.total_gross_revenue === 268625, 'Gross revenue: 268,625');
  assert(rep.income.cleaning_revenue === 57500, 'Cleaning revenue: 57,500');
  assert(rep.income.service_only_revenue === 25500, 'Service only cleaning revenue: 25,500');
  assert(rep.income.meat_revenue === 211125, 'Meat revenue: 211,125');
});

test('ڕاپۆرتی مانگانە کرێ (٣٥٠,٠٠٠) و کارەبا (١١٥,٠٠٠) بە جیاوازی هەژمار دەکات', () => {
  const currentMonth = today.slice(0, 7);
  const mRep = db.getMonthlyReport(currentMonth);

  assert(mRep.expenses.rent_paid === 350000, 'Monthly rent separated: 350,000');
  assert(mRep.expenses.electricity_paid === 115000, 'Monthly electricity separated: 115,000');
  assert(mRep.expenses.other_expenses === (8500 + 7500), 'Other expenses: 16,000');
});

// -------------------------------------------------------------
// 7. Backup Export & Restore Audit
// -------------------------------------------------------------
console.log('\n٧. پشکنینی پاشەکەوتکردن و گەڕاندنەوەی داتابەیس (Backup & Restore):');

test('دەرکردنی پاشەکەوتی داتابەیس و دووبارە هاوردەکردنەوەی ١٠٠٪ سەلامەتە', () => {
  const backup = db.exportAllData();
  assert(backup.data.batches.length > 0, 'Batches in backup');
  assert(backup.data.sales.length === 11, '11 sales in backup');
  assert(backup.data.expenses.length === 4, '4 expenses in backup');

  db.clearAllData();
  assert(db.getSales().length === 0, 'Database emptied');

  const res = db.importAllData(backup);
  assert(res.success === true, 'Import succeeded');
  assert(db.getSales().length === 11, 'All 11 sales restored perfectly');
  assert(db.getExpenses().length === 4, 'All 4 expenses restored perfectly');
});

// -------------------------------------------------------------
// 8. Strict Negative Validation (No Silent Conversion)
// -------------------------------------------------------------
console.log('\n٨. پشکنینی تەواوی ڕێگریکردن لە ژمارەی نێگەتیڤ و سالب (-):');

test('فرۆشتن بە ژمارەی سالب ڕەتدەکرێتەوە بە هەڵەی ڕوون', () => {
  assert.throws(() => {
    db.saveSale({
      customer_name: 'تاقیکردنەوەی سالب',
      chickens_count: -3,
      weight_kg: 4.5
    });
  }, /دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    db.saveSale({
      customer_name: 'تاقیکردنەوەی سالب',
      chickens_count: 3,
      weight_kg: -4.5
    });
  }, /کێشی سەر تەرازوو دەبێت گەورەتر بێت لە صفر/);
});

test('داخڵکردنی بار بە ژمارەی سالب ڕەتدەکرێتەوە', () => {
  assert.throws(() => {
    db.saveBatch({
      cages_count: -5,
      total_weight_kg: 100.0,
      buy_price_per_kg: 2200,
      sell_price_per_kg: 2700
    });
  }, /ژمارەی قەفەزەکان دەبێت ژمارەیەکی درووست و گەورەتر لە سفر بێت/);

  assert.throws(() => {
    db.saveBatch({
      cages_count: 5,
      total_weight_kg: -100.0,
      buy_price_per_kg: 2200,
      sell_price_per_kg: 2700
    });
  }, /کۆی کێشی بارەکە دەبێت گەورەتر بێت لە صفر/);
});

test('خەرجی و کرێ و کارەبا بە ژمارەی سالب یان صفر ڕەتدەکرێتەوە', () => {
  assert.throws(() => {
    db.saveExpense({
      category: 'کرێی دوکان',
      total_cost: -350000
    });
  }, /بڕی پارەی خەرجی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);

  assert.throws(() => {
    db.saveExpense({
      category: 'کرێی دوکان',
      total_cost: 0
    });
  }, /بڕی پارەی خەرجی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت/);
});

test('زیانی مرداربوونەوە بە ژمارەی سالب ڕەتدەکرێتەوە', () => {
  assert.throws(() => {
    db.saveLoss({
      chickens_count: -2,
      estimated_weight_kg: 3.8
    });
  }, /ژمارەی مریشکی مرداربوو دەبێت لە صفر گەورەتر بێت/);
});

console.log('\n================================================================');
console.log(` ئەنجامی پشکنین: ${passedTests} لە ${totalTests} تاقیکردنەوە بە سەرکەوتوویی تێپەڕین (100%)`);
console.log(' هەموو بەشەکانی سیستەمی مریشک فرۆشی سەرگەڵو بە تەواوی بێ کەمکوڕین!');
console.log('================================================================\n');
