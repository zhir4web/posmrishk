/**
 * Sargalu Chicken POS - Database Engine
 * Storage Engine: LocalStorage with reactive state updates & JSON backup/restore
 */

const DB_KEYS = {
  BATCHES: 'sargalu_batches',
  SALES: 'sargalu_sales',
  LOSSES: 'sargalu_losses',
  EXPENSES: 'sargalu_expenses',
  SETTINGS: 'sargalu_settings',
  ACTIVE_BATCH_ID: 'sargalu_active_batch_id'
};

const DEFAULT_SETTINGS = {
  store_name: 'مریشک فرۆشی سەرگەڵو',
  phone: '٠٧٧٠ ١٢٣ ٤٥٦٧',
  address: 'سلێمانی - سەرگەڵو',
  receipt_header: 'مریشک فرۆشی سەرگەڵو',
  receipt_footer: 'سوپاس بۆ سەردانەکەتان - بەخێربێنەوە',
  cleaning_fee_per_chicken: 1500, // مریشکی ناسک
  cleaning_fee_old_chicken: 2000, // مریشکی پیر
  cleaning_fee_goose: 3500,       // قاز
  cleaning_fee_turkey: 5000,      // قەل
  monthly_rent: 350000,
  default_sell_price_per_kg: 2750,
  default_buy_price_per_kg: 2250,
  enable_sound: true,
  enable_haptics: true,
  auto_print_receipt: true,
  printer_width: '80mm', // '80mm' or '58mm'
  currency_symbol: 'د.ع'
};

class Database {
  constructor() {
    this.listeners = [];
    this.init();
  }

  init() {
    if (!localStorage.getItem(DB_KEYS.SETTINGS)) {
      this.saveSettings(DEFAULT_SETTINGS);
    }
    if (!localStorage.getItem(DB_KEYS.BATCHES)) {
      localStorage.setItem(DB_KEYS.BATCHES, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_KEYS.SALES)) {
      localStorage.setItem(DB_KEYS.SALES, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_KEYS.LOSSES)) {
      localStorage.setItem(DB_KEYS.LOSSES, JSON.stringify([]));
    }
    if (!localStorage.getItem(DB_KEYS.EXPENSES)) {
      localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify([]));
    }
  }

  // Subscribe to changes
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify(event, data) {
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (err) {
        console.error('Listener error:', err);
      }
    });
  }

  // UUID generator
  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // Settings
  getSettings() {
    try {
      const data = localStorage.getItem(DB_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings) {
    const clean = {
      ...settings,
      cleaning_fee_per_chicken: Math.max(0, Math.abs(Number(settings.cleaning_fee_per_chicken) || 1500)),
      cleaning_fee_old_chicken: Math.max(0, Math.abs(Number(settings.cleaning_fee_old_chicken) || 2000)),
      cleaning_fee_goose: Math.max(0, Math.abs(Number(settings.cleaning_fee_goose) || 3500)),
      cleaning_fee_turkey: Math.max(0, Math.abs(Number(settings.cleaning_fee_turkey) || 5000)),
      monthly_rent: Math.max(0, Math.abs(Number(settings.monthly_rent) || 350000)),
      default_sell_price_per_kg: Math.max(0, Math.abs(Number(settings.default_sell_price_per_kg) || 2750)),
      default_buy_price_per_kg: Math.max(0, Math.abs(Number(settings.default_buy_price_per_kg) || 2250))
    };
    localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(clean));
    this.notify('settings_updated', clean);
    return clean;
  }

  // ---------------- BATCHES (باری مەخزەن) ----------------
  getBatches() {
    try {
      const data = localStorage.getItem(DB_KEYS.BATCHES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  getBatchById(id) {
    const batches = this.getBatches();
    return batches.find(b => b.batch_id === id) || null;
  }

  getActiveBatch(poultryType = null) {
    const activeId = localStorage.getItem(DB_KEYS.ACTIVE_BATCH_ID);
    const batches = this.getBatches();
    
    if (poultryType) {
      const typeBatches = batches.filter(b => (b.poultry_type || 'مریشکی ناسک') === poultryType);
      if (typeBatches.length > 0) {
        const foundActive = typeBatches.find(b => b.batch_id === activeId);
        if (foundActive) return foundActive;
        const sorted = [...typeBatches].sort((a, b) => new Date(b.date) - new Date(a.date));
        return sorted[0];
      }
    }

    if (activeId) {
      const found = batches.find(b => b.batch_id === activeId);
      if (found) return found;
    }
    // Return latest batch by date if exists
    if (batches.length > 0) {
      const sorted = [...batches].sort((a, b) => new Date(b.date) - new Date(a.date));
      return sorted[0];
    }
    return null;
  }

  setActiveBatch(batchId) {
    localStorage.setItem(DB_KEYS.ACTIVE_BATCH_ID, batchId);
    this.notify('active_batch_changed', batchId);
  }

  saveBatch(batchData) {
    const batches = this.getBatches();
    let batch = { ...batchData };

    if (!batch.batch_id) {
      batch.batch_id = this.generateId('batch');
      batch.created_at = new Date().toISOString();
    } else {
      batch.updated_at = new Date().toISOString();
    }

    // Auto-calculate formulas for simplified batch (Strictly non-negative)
    const cagesCount = Math.max(1, Math.abs(parseInt(batch.cages_count, 10) || 1));
    const weightKg = Math.max(0, Math.abs(Number(batch.total_weight_kg) || 0));
    const buyPrice = Math.max(0, Math.abs(Number(batch.buy_price_per_kg) || 0));
    const sellPrice = Math.max(0, Math.abs(Number(batch.sell_price_per_kg) || 0));
    const poultryType = batch.poultry_type || 'مریشکی ناسک';

    batch.poultry_type = poultryType;
    batch.cages_count = cagesCount;
    batch.total_weight_kg = weightKg;
    batch.buy_price_per_kg = buyPrice;
    batch.sell_price_per_kg = sellPrice;
    batch.total_cost = weightKg * buyPrice;

    const existingIndex = batches.findIndex(b => b.batch_id === batch.batch_id);
    if (existingIndex >= 0) {
      batches[existingIndex] = batch;
    } else {
      batches.unshift(batch);
    }

    localStorage.setItem(DB_KEYS.BATCHES, JSON.stringify(batches));
    this.setActiveBatch(batch.batch_id);
    this.notify('batches_updated', batches);
    return batch;
  }

  deleteBatch(batchId) {
    let batches = this.getBatches();
    batches = batches.filter(b => b.batch_id !== batchId);
    localStorage.setItem(DB_KEYS.BATCHES, JSON.stringify(batches));
    
    const activeId = localStorage.getItem(DB_KEYS.ACTIVE_BATCH_ID);
    if (activeId === batchId) {
      const nextBatch = batches[0];
      if (nextBatch) {
        this.setActiveBatch(nextBatch.batch_id);
      } else {
        localStorage.removeItem(DB_KEYS.ACTIVE_BATCH_ID);
        this.notify('active_batch_changed', null);
      }
    }
    this.notify('batches_updated', batches);
  }

  // ---------------- SALES (فرۆشتن) ----------------
  getSales() {
    try {
      const data = localStorage.getItem(DB_KEYS.SALES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  getSalesByDate(dateStr) {
    const sales = this.getSales();
    return sales.filter(s => s.timestamp.startsWith(dateStr));
  }

  saveSale(saleData) {
    const sales = this.getSales();
    const settings = this.getSettings();
    const itemType = saleData.item_type || 'مریشکی ناسک';
    const isServiceOnly = Boolean(saleData.is_service_only);
    const activeBatch = isServiceOnly ? null : this.getActiveBatch(itemType);

    const chickensCount = Math.max(1, Math.abs(parseInt(saleData.chickens_count, 10) || 1));
    const weightKg = isServiceOnly ? 0 : Math.max(0, Math.abs(Number(saleData.weight_kg) || 0));
    const sellPrice = isServiceOnly ? 0 : Math.max(0, Math.abs(Number(saleData.sell_price_per_kg) || (activeBatch ? activeBatch.sell_price_per_kg : settings.default_sell_price_per_kg)));
    const isCleaned = isServiceOnly ? true : Boolean(saleData.is_cleaned);
    
    // Cleaning fee calculation
    let defaultFee = settings.cleaning_fee_per_chicken || 1500;
    if (itemType === 'مریشکی پیر' || saleData.service_target_name === 'مریشکی پیر') defaultFee = settings.cleaning_fee_old_chicken || 2000;
    else if (itemType === 'قاز' || saleData.service_target_name === 'قاز') defaultFee = settings.cleaning_fee_goose || 3500;
    else if (itemType === 'قەل' || saleData.service_target_name === 'قەل') defaultFee = settings.cleaning_fee_turkey || 5000;

    const cleaningFee = Math.max(0, Math.abs(Number(saleData.cleaning_fee_per_chicken ?? defaultFee) || 0));

    const meatPrice = isServiceOnly ? 0 : Math.round(weightKg * sellPrice);
    const cleaningTotal = isCleaned ? (chickensCount * cleaningFee) : 0;
    const totalAmount = meatPrice + cleaningTotal;

    const sale = {
      sale_id: saleData.sale_id || this.generateId('sale'),
      receipt_no: saleData.receipt_no || this.generateReceiptNumber(),
      timestamp: saleData.timestamp || new Date().toISOString(),
      item_type: itemType,
      is_service_only: isServiceOnly,
      service_target_name: saleData.service_target_name || (isServiceOnly ? 'پەلەوەری کڕیار' : itemType),
      batch_id: saleData.batch_id || (activeBatch ? activeBatch.batch_id : null),
      customer_name: (saleData.customer_name || '').trim(),
      chickens_count: chickensCount,
      weight_kg: weightKg,
      sell_price_per_kg: sellPrice,
      buy_price_per_kg: activeBatch ? activeBatch.buy_price_per_kg : (isServiceOnly ? 0 : settings.default_buy_price_per_kg),
      is_cleaned: isCleaned,
      cleaning_fee_per_chicken: cleaningFee,
      meat_price: meatPrice,
      cleaning_total_fee: cleaningTotal,
      total_amount: totalAmount,
      cost_of_goods: activeBatch && !isServiceOnly ? Math.round(weightKg * activeBatch.buy_price_per_kg) : 0
    };

    sales.unshift(sale);
    localStorage.setItem(DB_KEYS.SALES, JSON.stringify(sales));
    this.notify('sales_updated', sales);
    return sale;
  }

  generateReceiptNumber() {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const salesToday = this.getSalesByDate(new Date().toISOString().slice(0, 10));
    const nextSeq = String(salesToday.length + 1).padStart(3, '0');
    return `${today}-${nextSeq}`;
  }

  deleteSale(saleId) {
    let sales = this.getSales();
    sales = sales.filter(s => s.sale_id !== saleId);
    localStorage.setItem(DB_KEYS.SALES, JSON.stringify(sales));
    this.notify('sales_updated', sales);
  }

  // ---------------- DEAD LOSSES (مرداربوونەوە و زیان) ----------------
  getLosses() {
    try {
      const data = localStorage.getItem(DB_KEYS.LOSSES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  getLossesByDate(dateStr) {
    const losses = this.getLosses();
    return losses.filter(l => l.timestamp.startsWith(dateStr));
  }

  saveLoss(lossData) {
    const losses = this.getLosses();
    const activeBatch = this.getActiveBatch();
    const settings = this.getSettings();

    const count = Math.max(1, Math.abs(parseInt(lossData.chickens_count, 10) || 1));
    const avgWeight = activeBatch && activeBatch.average_weight_per_chicken > 0 
      ? activeBatch.average_weight_per_chicken 
      : 1.9;
    
    const weight = Math.max(0, Math.abs(Number(lossData.estimated_weight_kg) || Number((count * avgWeight).toFixed(2))));
    const buyPrice = Math.max(0, Math.abs(Number(lossData.buy_price_per_kg || (activeBatch ? activeBatch.buy_price_per_kg : settings.default_buy_price_per_kg))));
    const lossCost = Math.round(weight * buyPrice);

    const loss = {
      loss_id: lossData.loss_id || this.generateId('loss'),
      timestamp: lossData.timestamp || new Date().toISOString(),
      batch_id: lossData.batch_id || (activeBatch ? activeBatch.batch_id : null),
      chickens_count: count,
      estimated_weight_kg: weight,
      reason: lossData.reason || 'مرداربوونەوە لە قەفەز / هۆکاری نەزانراو',
      buy_price_per_kg: buyPrice,
      loss_financial_cost: lossCost
    };

    losses.unshift(loss);
    localStorage.setItem(DB_KEYS.LOSSES, JSON.stringify(losses));
    this.notify('losses_updated', losses);
    return loss;
  }

  deleteLoss(lossId) {
    let losses = this.getLosses();
    losses = losses.filter(l => l.loss_id !== lossId);
    localStorage.setItem(DB_KEYS.LOSSES, JSON.stringify(losses));
    this.notify('losses_updated', losses);
  }

  // ---------------- EXPENSES (خەرجییە کاتییەکان) ----------------
  getExpenses() {
    try {
      const data = localStorage.getItem(DB_KEYS.EXPENSES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  getExpensesByDate(dateStr) {
    const expenses = this.getExpenses();
    return expenses.filter(e => e.timestamp.startsWith(dateStr));
  }

  saveExpense(expenseData) {
    const expenses = this.getExpenses();
    const qty = Math.max(0.01, Math.abs(Number(expenseData.quantity) || 1));
    const unitPrice = Math.max(0, Math.abs(Number(expenseData.unit_price) || 0));
    const totalCost = Math.max(0, Math.abs(Number(expenseData.total_cost) || (qty * unitPrice)));

    const expense = {
      expense_id: expenseData.expense_id || this.generateId('exp'),
      timestamp: expenseData.timestamp || new Date().toISOString(),
      category: expenseData.category || 'خەرجی تر',
      description: expenseData.description || '',
      unit_type: expenseData.unit_type || 'بڕی پارە',
      quantity: qty,
      unit_price: unitPrice,
      total_cost: totalCost
    };

    expenses.unshift(expense);
    localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify(expenses));
    this.notify('expenses_updated', expenses);
    return expense;
  }

  deleteExpense(expenseId) {
    let expenses = this.getExpenses();
    expenses = expenses.filter(e => e.expense_id !== expenseId);
    localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify(expenses));
    this.notify('expenses_updated', expenses);
  }

  // ---------------- DAILY CALCULATIONS & FINANCIAL REPORT ----------------
  getDailyReport(targetDateStr) {
    const dateStr = targetDateStr || new Date().toISOString().slice(0, 10);
    const batches = this.getBatches().filter(b => b.date === dateStr);
    const sales = this.getSalesByDate(dateStr);
    const losses = this.getLossesByDate(dateStr);
    const expenses = this.getExpensesByDate(dateStr);

    // Active or today's batch metrics
    const totalReceivedCages = batches.reduce((sum, b) => sum + (Number(b.cages_count) || (b.cages_detail ? b.cages_detail.length : 1)), 0);
    const totalReceivedWeight = batches.reduce((sum, b) => sum + (Number(b.total_weight_kg) || 0), 0);
    const totalBatchCost = batches.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0);

    // Sales metrics
    const totalSoldChickens = sales.reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0);
    const totalSoldWeight = sales.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
    const totalMeatRevenue = sales.reduce((sum, s) => sum + (Number(s.meat_price) || 0), 0);
    const totalCleaningRevenue = sales.reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0);
    const totalGrossRevenue = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const totalCleanedChickens = sales.reduce((sum, s) => sum + (s.is_cleaned ? Number(s.chickens_count) : 0), 0);
    
    // Cost of goods sold (COGS)
    const totalCostOfSoldGoods = sales.reduce((sum, s) => sum + (Number(s.cost_of_goods) || 0), 0);

    // Dead loss metrics
    const totalDeadChickens = losses.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);
    const totalDeadWeight = losses.reduce((sum, l) => sum + (Number(l.estimated_weight_kg) || 0), 0);
    const totalDeadLossCost = losses.reduce((sum, l) => sum + (Number(l.loss_financial_cost) || 0), 0);

    // Ad-hoc expenses
    const totalAdhocExpenses = expenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);

    // Stock Remaining Weight (بۆ سبەی)
    const remainingWeight = Math.max(0, totalReceivedWeight - totalSoldWeight - totalDeadWeight);

    // Financial breakdown
    const totalCosts = totalCostOfSoldGoods + totalAdhocExpenses + totalDeadLossCost;
    const netProfit = totalGrossRevenue - totalCosts;
    const meatProfit = totalMeatRevenue - totalCostOfSoldGoods;

    return {
      date: dateStr,
      stock: {
        received_cages: totalReceivedCages,
        received_count: totalReceivedCages,
        received_weight: Number(totalReceivedWeight.toFixed(2)),
        total_batch_cost: totalBatchCost,
        sold_count: totalSoldChickens,
        sold_weight: Number(totalSoldWeight.toFixed(2)),
        dead_count: totalDeadChickens,
        dead_weight: Number(totalDeadWeight.toFixed(2)),
        remaining_weight: Number(remainingWeight.toFixed(2))
      },
      income: {
        meat_revenue: totalMeatRevenue,
        cleaning_revenue: totalCleaningRevenue,
        service_only_revenue: sales.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
        store_cleaning_revenue: sales.filter(s => !s.is_service_only).reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0),
        total_gross_revenue: totalGrossRevenue,
        cleaned_chickens_count: totalCleanedChickens,
        service_only_count: sales.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0),
        transactions_count: sales.length
      },
      expenses: {
        cost_of_sold_goods: totalCostOfSoldGoods,
        adhoc_expenses: totalAdhocExpenses,
        dead_loss_cost: totalDeadLossCost,
        total_costs: totalCosts
      },
      profit: {
        net_profit: netProfit,
        meat_profit: meatProfit,
        is_profitable: netProfit >= 0
      },
      raw_data: {
        batches,
        sales,
        losses,
        expenses
      }
    };
  }

  // ---------------- MONTHLY FINANCIAL REPORT (ڕاپۆرتی مانگانە) ----------------
  getMonthlyReport(targetMonthStr) {
    const monthStr = targetMonthStr || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const batches = this.getBatches().filter(b => b.date.startsWith(monthStr));
    const sales = this.getSales().filter(s => s.timestamp.startsWith(monthStr));
    const losses = this.getLosses().filter(l => l.timestamp.startsWith(monthStr));
    const expenses = this.getExpenses().filter(e => e.timestamp.startsWith(monthStr));

    const totalReceivedCages = batches.reduce((sum, b) => sum + (Number(b.cages_count) || (b.cages_detail ? b.cages_detail.length : 1)), 0);
    const totalReceivedWeight = batches.reduce((sum, b) => sum + (Number(b.total_weight_kg) || 0), 0);
    const totalBatchCost = batches.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0);

    const totalSoldChickens = sales.reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0);
    const totalSoldWeight = sales.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
    const totalMeatRevenue = sales.reduce((sum, s) => sum + (Number(s.meat_price) || 0), 0);
    const totalCleaningRevenue = sales.reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0);
    const totalGrossRevenue = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const totalCleanedChickens = sales.reduce((sum, s) => sum + (s.is_cleaned ? Number(s.chickens_count) : 0), 0);

    const totalCostOfSoldGoods = sales.reduce((sum, s) => sum + (Number(s.cost_of_goods) || 0), 0);

    const totalDeadChickens = losses.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);
    const totalDeadWeight = losses.reduce((sum, l) => sum + (Number(l.estimated_weight_kg) || 0), 0);
    const totalDeadLossCost = losses.reduce((sum, l) => sum + (Number(l.loss_financial_cost) || 0), 0);

    // Monthly categorized expenses (کرێی دوکان, کارەبا, تر)
    const rentExpenses = expenses.filter(e => e.category === 'کرێی دوکان' || (e.category && e.category.includes('کرێ')));
    const electricityExpenses = expenses.filter(e => e.category === 'کارەبا' || (e.category && e.category.includes('کارەبا')));
    const otherExpenses = expenses.filter(e => !rentExpenses.includes(e) && !electricityExpenses.includes(e));

    const totalRentPaid = rentExpenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);
    const totalElectricityPaid = electricityExpenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);
    const totalOtherExpenses = otherExpenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);
    const totalAdhocExpenses = expenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);

    const totalCosts = totalCostOfSoldGoods + totalAdhocExpenses + totalDeadLossCost;
    const netProfit = totalGrossRevenue - totalCosts;
    const meatProfit = totalMeatRevenue - totalCostOfSoldGoods;

    return {
      month: monthStr,
      stock: {
        received_cages: totalReceivedCages,
        received_weight: Number(totalReceivedWeight.toFixed(2)),
        total_batch_cost: totalBatchCost,
        sold_count: totalSoldChickens,
        sold_weight: Number(totalSoldWeight.toFixed(2)),
        dead_count: totalDeadChickens,
        dead_weight: Number(totalDeadWeight.toFixed(2)),
        remaining_weight: Math.max(0, Number((totalReceivedWeight - totalSoldWeight - totalDeadWeight).toFixed(2)))
      },
      income: {
        meat_revenue: totalMeatRevenue,
        cleaning_revenue: totalCleaningRevenue,
        service_only_revenue: sales.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
        store_cleaning_revenue: sales.filter(s => !s.is_service_only).reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0),
        total_gross_revenue: totalGrossRevenue,
        cleaned_chickens_count: totalCleanedChickens,
        service_only_count: sales.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0),
        transactions_count: sales.length
      },
      expenses: {
        cost_of_sold_goods: totalCostOfSoldGoods,
        rent_paid: totalRentPaid,
        electricity_paid: totalElectricityPaid,
        other_expenses: totalOtherExpenses,
        total_expenses: totalAdhocExpenses,
        dead_loss_cost: totalDeadLossCost,
        total_costs: totalCosts
      },
      profit: {
        net_profit: netProfit,
        meat_profit: meatProfit,
        is_profitable: netProfit >= 0
      },
      raw_data: {
        batches,
        sales,
        losses,
        expenses
      }
    };
  }

  // ---------------- BACKUP & SEED DATA ----------------
  exportAllData() {
    return {
      version: '1.0',
      exported_at: new Date().toISOString(),
      store: this.getSettings().store_name,
      data: {
        settings: this.getSettings(),
        batches: this.getBatches(),
        sales: this.getSales(),
        losses: this.getLosses(),
        expenses: this.getExpenses()
      }
    };
  }

  importAllData(jsonData) {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      const data = parsed.data || parsed;

      if (data.settings) localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(data.settings));
      if (data.batches) localStorage.setItem(DB_KEYS.BATCHES, JSON.stringify(data.batches));
      if (data.sales) localStorage.setItem(DB_KEYS.SALES, JSON.stringify(data.sales));
      if (data.losses) localStorage.setItem(DB_KEYS.LOSSES, JSON.stringify(data.losses));
      if (data.expenses) localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify(data.expenses));

      this.notify('all_data_restored', true);
      return { success: true };
    } catch (e) {
      console.error('Import error:', e);
      return { success: false, error: e.message };
    }
  }

  seedDemoData() {
    const today = new Date().toISOString().slice(0, 10);
    
    // Demo batch
    const sampleBatch = {
      batch_id: 'batch_demo_01',
      date: today,
      cages_count: 8,
      total_weight_kg: 168.5,
      buy_price_per_kg: 2300,
      sell_price_per_kg: 2850,
      total_cost: 387550,
      created_at: new Date(Date.now() - 3600000 * 8).toISOString()
    };

    // Demo sales
    const sampleSales = [
      {
        sale_id: 'sale_demo_01',
        receipt_no: `${today.replace(/-/g, '')}-001`,
        timestamp: new Date(Date.now() - 3600000 * 6).toISOString(),
        batch_id: sampleBatch.batch_id,
        customer_name: 'کاک کازم',
        chickens_count: 2,
        weight_kg: 4.15,
        sell_price_per_kg: 2850,
        buy_price_per_kg: 2300,
        is_cleaned: true,
        cleaning_fee_per_chicken: 1500,
        meat_price: 11828,
        cleaning_total_fee: 3000,
        total_amount: 14828,
        cost_of_goods: 9545
      },
      {
        sale_id: 'sale_demo_02',
        receipt_no: `${today.replace(/-/g, '')}-002`,
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        batch_id: sampleBatch.batch_id,
        customer_name: 'ڕێستۆرانتی خێزانی',
        chickens_count: 8,
        weight_kg: 16.20,
        sell_price_per_kg: 2850,
        buy_price_per_kg: 2300,
        is_cleaned: true,
        cleaning_fee_per_chicken: 1500,
        meat_price: 46170,
        cleaning_total_fee: 12000,
        total_amount: 58170,
        cost_of_goods: 37260
      },
      {
        sale_id: 'sale_demo_03',
        receipt_no: `${today.replace(/-/g, '')}-003`,
        timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
        batch_id: sampleBatch.batch_id,
        customer_name: '',
        chickens_count: 1,
        weight_kg: 2.05,
        sell_price_per_kg: 2850,
        buy_price_per_kg: 2300,
        is_cleaned: false,
        cleaning_fee_per_chicken: 1500,
        meat_price: 5843,
        cleaning_total_fee: 0,
        total_amount: 5843,
        cost_of_goods: 4715
      },
      {
        sale_id: 'sale_demo_04',
        receipt_no: `${today.replace(/-/g, '')}-004`,
        timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
        batch_id: sampleBatch.batch_id,
        customer_name: 'حاجی عوسمان',
        chickens_count: 3,
        weight_kg: 6.30,
        sell_price_per_kg: 2850,
        buy_price_per_kg: 2300,
        is_cleaned: true,
        cleaning_fee_per_chicken: 1500,
        meat_price: 17955,
        cleaning_total_fee: 4500,
        total_amount: 22455,
        cost_of_goods: 14490
      }
    ];

    // Demo losses
    const sampleLosses = [
      {
        loss_id: 'loss_demo_01',
        timestamp: new Date(Date.now() - 3600000 * 7).toISOString(),
        batch_id: sampleBatch.batch_id,
        chickens_count: 2,
        estimated_weight_kg: 4.02,
        reason: 'مرداربوونەوەی ڕێگا و بارکردن',
        buy_price_per_kg: 2300,
        loss_financial_cost: 9246
      }
    ];

    // Demo expenses
    const sampleExpenses = [
      {
        expense_id: 'exp_demo_01',
        timestamp: new Date(Date.now() - 3600000 * 6).toISOString(),
        category: 'غاز',
        description: 'گۆڕینی بوتڵی غازی ئاوی گەرم و پاککردن',
        unit_type: 'دانە (بوتڵ)',
        quantity: 1,
        unit_price: 8500,
        total_cost: 8500
      },
      {
        expense_id: 'exp_demo_02',
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        category: 'عەلاگە',
        description: 'عەلاگەی ڕەش و شەفاف بۆ بەستەبەندی',
        unit_type: 'کیلۆگرام',
        quantity: 3,
        unit_price: 2500,
        total_cost: 7500
      },
      {
        expense_id: 'exp_demo_03',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        category: 'عەلەف / دانەوێڵە',
        description: 'عەلەف / دانەوێڵەی مریشک',
        unit_type: 'کیلۆگرام',
        quantity: 10,
        unit_price: 750,
        total_cost: 7500
      },
      {
        expense_id: 'exp_demo_04',
        timestamp: new Date(Date.now() - 3600000 * 20).toISOString(),
        category: 'کرێی دوکان',
        description: 'کرێی مانگانەی دوکان',
        unit_type: 'مانگ',
        quantity: 1,
        unit_price: 350000,
        total_cost: 350000
      },
      {
        expense_id: 'exp_demo_05',
        timestamp: new Date(Date.now() - 3600000 * 15).toISOString(),
        category: 'کارەبا',
        description: 'پارەی کارەبای موەلیدە و نیشتمانی',
        unit_type: 'پسوولە',
        quantity: 1,
        unit_price: 110000,
        total_cost: 110000
      }
    ];

    localStorage.setItem(DB_KEYS.BATCHES, JSON.stringify([sampleBatch]));
    localStorage.setItem(DB_KEYS.SALES, JSON.stringify(sampleSales));
    localStorage.setItem(DB_KEYS.LOSSES, JSON.stringify(sampleLosses));
    localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify(sampleExpenses));
    this.setActiveBatch(sampleBatch.batch_id);

    this.notify('all_data_restored', true);
  }

  clearAllData() {
    localStorage.setItem(DB_KEYS.BATCHES, JSON.stringify([]));
    localStorage.setItem(DB_KEYS.SALES, JSON.stringify([]));
    localStorage.setItem(DB_KEYS.LOSSES, JSON.stringify([]));
    localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify([]));
    localStorage.removeItem(DB_KEYS.ACTIVE_BATCH_ID);
    this.notify('all_data_restored', true);
  }
}

// Export singleton
const rootContext = typeof window !== 'undefined' ? window : global;
rootContext.db = new Database();

