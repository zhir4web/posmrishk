/**
 * Automated Verification Script for Sargalu Chicken POS
 * Tests Cleaning Fee toggle, Monthly Rent (350,000 IQD), Variable Electricity, and Monthly Financial Reports
 */

// Mock localStorage & window in Node
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { for (let k in storage) delete storage[k]; }
};
global.window = global;

// Load db.js logic
require('../js/db.js');

const assert = (condition, message) => {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
};

console.log('--- دەستپێکردنی تاقیکردنەوەی سیستەمی پاککردن، کرێی مانگانە و کارەبا ---');

// 1. Initial State & Settings Test
const db = window.db;
const settings = db.getSettings();
assert(settings.store_name === 'مریشک فرۆشی سەرگەڵو', 'Store name is correctly initialized');
assert(settings.cleaning_fee_per_chicken === 1500, 'Default cleaning fee is 1500 IQD');
assert(settings.monthly_rent === 350000, 'Default monthly rent is 350,000 IQD');

// 2. Batch Creation Test
const today = global.getBaghdadDate();
const currentMonth = global.getBaghdadMonth();

const newBatch = db.saveBatch({
  date: today,
  cages_count: 5,
  total_weight_kg: 100.0,
  buy_price_per_kg: 2200,
  sell_price_per_kg: 2800
});

assert(newBatch.total_cost === 220000, 'Batch cost is 220,000 IQD (100 * 2200)');

// 3. Cleaning Fee Toggle Test (پاککردن / بێ پاککردن)
// Test A: 3 Chickens, 6.0 kg, Cleaned = (6 * 2800) + (3 * 1500) = 16,800 + 4,500 = 21,300 IQD
const saleCleaned = db.saveSale({
  customer_name: 'کڕیار بە پاککردنەوە',
  chickens_count: 3,
  weight_kg: 6.0,
  sell_price_per_kg: 2800,
  is_cleaned: true
});

assert(saleCleaned.cleaning_total_fee === 4500, 'Cleaned sale has 4,500 IQD cleaning fee (3 * 1500)');
assert(saleCleaned.meat_price === 16800, 'Meat price is 16,800 IQD');
assert(saleCleaned.total_amount === 21300, 'Grand total is 21,300 IQD');

// Test B: 3 Chickens, 6.0 kg, UNCLEANED (زیندوو) = (6 * 2800) + 0 = 16,800 IQD
const saleUncleaned = db.saveSale({
  customer_name: 'کڕیار بەبێ پاککردن',
  chickens_count: 3,
  weight_kg: 6.0,
  sell_price_per_kg: 2800,
  is_cleaned: false
});

assert(saleUncleaned.cleaning_total_fee === 0, 'Uncleaned sale has 0 IQD cleaning fee');
assert(saleUncleaned.meat_price === 16800, 'Meat price is 16,800 IQD');
assert(saleUncleaned.total_amount === 16800, 'Grand total is 16,800 IQD without cleaning fee');

// 4. Monthly Expenses (کرێی دوکان و کارەبا)
// Rent: 350,000 IQD
const expRent = db.saveExpense({
  category: 'کرێی دوکان',
  description: 'کرێی مانگانەی دوکان',
  unit_type: 'مانگ',
  quantity: 1,
  unit_price: 350000,
  total_cost: 350000
});

assert(expRent.category === 'کرێی دوکان', 'Rent category verified');
assert(expRent.total_cost === 350000, 'Rent amount is 350,000 IQD');

// Electricity (Variable): 120,000 IQD
const expElec = db.saveExpense({
  category: 'کارەبا',
  description: 'پارەی کارەبای موەلیدە و نیشتمانی ئەم مانگە',
  unit_type: 'پسوولە',
  quantity: 1,
  unit_price: 120000,
  total_cost: 120000
});

assert(expElec.category === 'کارەبا', 'Electricity category verified');
assert(expElec.total_cost === 120000, 'Variable electricity amount is 120,000 IQD');

// Adhoc gas: 8,500 IQD
const expGas = db.saveExpense({
  category: 'غاز',
  description: 'بوتڵی غاز',
  unit_type: 'دانە',
  quantity: 1,
  unit_price: 8500,
  total_cost: 8500
});

// 5. Monthly Financial Report Verification
const monthlyRep = db.getMonthlyReport(currentMonth);

assert(monthlyRep.income.meat_revenue === (16800 + 16800), 'Total monthly meat revenue: 33,600 IQD');
assert(monthlyRep.income.cleaning_revenue === 4500, 'Total monthly cleaning revenue: 4,500 IQD');
assert(monthlyRep.income.total_gross_revenue === 38100, 'Total monthly gross revenue: 38,100 IQD');

assert(monthlyRep.expenses.rent_paid === 350000, 'Monthly rent separated: 350,000 IQD');
assert(monthlyRep.expenses.electricity_paid === 120000, 'Monthly electricity separated: 120,000 IQD');
assert(monthlyRep.expenses.other_expenses === 8500, 'Other daily expenses: 8,500 IQD');

// Cost of sold goods: (6.0 + 6.0) * 2200 = 26,400 IQD
assert(monthlyRep.expenses.cost_of_sold_goods === 26400, 'Cost of sold goods: 26,400 IQD');

// Total Costs = 26,400 (COGS) + 350,000 (Rent) + 120,000 (Elec) + 8,500 (Gas) = 504,900 IQD
const expectedTotalCosts = 26400 + 350000 + 120000 + 8500;
assert(monthlyRep.expenses.total_costs === expectedTotalCosts, `Total monthly costs: ${expectedTotalCosts} IQD`);

// Net Profit = 38,100 - 504,900 = -466,800 IQD
assert(monthlyRep.profit.net_profit === (38100 - expectedTotalCosts), 'Net monthly profit formula is 100% exact');

console.log('\n🎉 هەموو تاقیکردنەوەکان بە سەرکەوتوویی تێپەڕین! سیستەمی پاککردن، کرێی مانگانە و کارەبا بە تەواوی ئامادەن.');
