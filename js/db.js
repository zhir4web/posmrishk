/**
 * Sargalu Chicken POS - Database Engine
 * Storage Engine: LocalStorage with reactive state updates & JSON backup/restore
 * Strict Data Integrity, Asia/Baghdad Timezone, Batch Cost Linking, Cross-Day Stock, XSS Safety
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

// ---------------- TIMEZONE & DATE HELPERS (Asia/Baghdad) ----------------

/**
 * Returns YYYY-MM-DD in Asia/Baghdad timezone
 */
function getBaghdadDate(dateOrTimestamp = new Date()) {
  if (!dateOrTimestamp) dateOrTimestamp = new Date();
  const d = typeof dateOrTimestamp === 'string' || typeof dateOrTimestamp === 'number'
    ? new Date(dateOrTimestamp)
    : dateOrTimestamp;

  if (isNaN(d.getTime())) return '';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Baghdad',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(d);
    const getPart = type => parts.find(p => p.type === type)?.value;
    const yyyy = getPart('year');
    const mm = getPart('month');
    const dd = getPart('day');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    // Fallback if Intl formatToParts fails
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Returns YYYY-MM in Asia/Baghdad timezone
 */
function getBaghdadMonth(dateOrTimestamp = new Date()) {
  const dateStr = getBaghdadDate(dateOrTimestamp);
  return dateStr ? dateStr.slice(0, 7) : '';
}

/**
 * Returns formatted HH:MM time in Asia/Baghdad
 */
function getBaghdadTime(dateOrTimestamp = new Date()) {
  if (!dateOrTimestamp) dateOrTimestamp = new Date();
  const d = typeof dateOrTimestamp === 'string' || typeof dateOrTimestamp === 'number'
    ? new Date(dateOrTimestamp)
    : dateOrTimestamp;

  if (isNaN(d.getTime())) return '';

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Baghdad',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(d);
  } catch (e) {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
}

/**
 * Reusable HTML escaping to prevent XSS in template literals
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
    if (!settings || typeof settings !== 'object') {
      throw new Error('ڕێکخستنەکان نادرووستن');
    }

    const clean = {
      ...settings,
      cleaning_fee_per_chicken: Math.max(0, Number(settings.cleaning_fee_per_chicken) || 1500),
      cleaning_fee_old_chicken: Math.max(0, Number(settings.cleaning_fee_old_chicken) || 2000),
      cleaning_fee_goose: Math.max(0, Number(settings.cleaning_fee_goose) || 3500),
      cleaning_fee_turkey: Math.max(0, Number(settings.cleaning_fee_turkey) || 5000),
      monthly_rent: Math.max(0, Number(settings.monthly_rent) || 350000),
      default_sell_price_per_kg: Math.max(0, Number(settings.default_sell_price_per_kg) || 2750),
      default_buy_price_per_kg: Math.max(0, Number(settings.default_buy_price_per_kg) || 2250)
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
    if (!id) return null;
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
        const sorted = [...typeBatches].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
        return sorted[0];
      }
    }

    if (activeId) {
      const found = batches.find(b => b.batch_id === activeId);
      if (found) return found;
    }
    // Return latest batch by date if exists
    if (batches.length > 0) {
      const sorted = [...batches].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
      return sorted[0];
    }
    return null;
  }

  setActiveBatch(batchId) {
    localStorage.setItem(DB_KEYS.ACTIVE_BATCH_ID, batchId);
    this.notify('active_batch_changed', batchId);
  }

  saveBatch(batchData) {
    if (!batchData || typeof batchData !== 'object') {
      throw new Error('داتای بار نادرووستە');
    }

    const batches = this.getBatches();
    let batch = { ...batchData };

    const rawCages = parseInt(batch.cages_count, 10);
    const rawWeight = Number(batch.total_weight_kg);
    const rawBuyPrice = Number(batch.buy_price_per_kg);
    const rawSellPrice = Number(batch.sell_price_per_kg);
    const rawChickens = batch.total_chickens !== undefined ? parseInt(batch.total_chickens, 10) : null;

    if (isNaN(rawCages) || rawCages <= 0) {
      throw new Error('ژمارەی قەفەزەکان دەبێت ژمارەیەکی درووست و گەورەتر لە سفر بێت');
    }
    if (isNaN(rawWeight) || rawWeight <= 0) {
      throw new Error('کۆی کێشی بارەکە دەبێت گەورەتر بێت لە صفر');
    }
    if (isNaN(rawBuyPrice) || rawBuyPrice <= 0 || isNaN(rawSellPrice) || rawSellPrice <= 0) {
      throw new Error('نرخی کڕین و فرۆشتنی ١ کیلۆگرام دەبێت گەورەتر بێت لە صفر');
    }
    if (rawChickens !== null && (isNaN(rawChickens) || rawChickens <= 0)) {
      throw new Error('کۆی ژمارەی مریشکەکان دەبێت گەورەتر بێت لە صفر');
    }

    if (!batch.batch_id) {
      batch.batch_id = this.generateId('batch');
      batch.created_at = new Date().toISOString();
    } else {
      batch.updated_at = new Date().toISOString();
    }

    const poultryType = batch.poultry_type || 'مریشکی ناسک';
    const totalChickens = rawChickens || Math.max(1, rawCages * 25);
    const avgWeightPerBird = +(rawWeight / totalChickens).toFixed(2);
    const batchDate = batch.date ? getBaghdadDate(batch.date) : getBaghdadDate();

    batch.poultry_type = poultryType;
    batch.date = batchDate;
    batch.cages_count = rawCages;
    batch.total_chickens = totalChickens;
    batch.total_weight_kg = rawWeight;
    batch.avg_weight_per_bird = avgWeightPerBird;
    batch.buy_price_per_kg = rawBuyPrice;
    batch.sell_price_per_kg = rawSellPrice;
    batch.total_cost = Math.round(rawWeight * rawBuyPrice);

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

  // ---------------- BATCH INVENTORY TRACKING (Cross-Day) ----------------

  /**
   * Calculates stock metrics for a specific batch up to a specified Baghdad date (inclusive).
   * If upToDate is null, calculates up to the latest transaction.
   */
  getBatchStock(batchId, upToDate = null) {
    const batch = this.getBatchById(batchId);
    if (!batch) return null;

    const receivedWeight = Number(batch.total_weight_kg) || 0;
    const receivedCount = Number(batch.total_chickens) || (Number(batch.cages_count) * 25) || 0;

    let sales = this.getSales().filter(s => s.batch_id === batchId && !s.is_service_only);
    let losses = this.getLosses().filter(l => l.batch_id === batchId);

    if (upToDate) {
      sales = sales.filter(s => getBaghdadDate(s.timestamp) <= upToDate);
      losses = losses.filter(l => getBaghdadDate(l.timestamp) <= upToDate);
    }

    const soldWeight = sales.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
    const soldCount = sales.reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0);
    const deadWeight = losses.reduce((sum, l) => sum + (Number(l.estimated_weight_kg) || 0), 0);
    const deadCount = losses.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);

    const remainingWeight = Number((receivedWeight - soldWeight - deadWeight).toFixed(2));
    const remainingCount = receivedCount - soldCount - deadCount;

    return {
      batch_id: batch.batch_id,
      poultry_type: batch.poultry_type || 'مریشکی ناسک',
      batch_date: batch.date || getBaghdadDate(batch.created_at),
      buy_price_per_kg: batch.buy_price_per_kg,
      sell_price_per_kg: batch.sell_price_per_kg,
      received_weight: receivedWeight,
      received_count: receivedCount,
      sold_weight: Number(soldWeight.toFixed(2)),
      sold_count: soldCount,
      dead_weight: Number(deadWeight.toFixed(2)),
      dead_count: deadCount,
      remaining_weight: remainingWeight,
      remaining_count: remainingCount,
      is_oversold: remainingWeight < 0 || remainingCount < 0
    };
  }

  /**
   * Calculates total closing inventory across all batches created on or before upToDate.
   * Exposes any shortfall without forcing balance to zero.
   */
  getClosingInventory(upToDate = null) {
    const targetDate = upToDate || getBaghdadDate();
    const batches = this.getBatches().filter(b => (b.date || getBaghdadDate(b.created_at)) <= targetDate);

    let totalReceivedWeight = 0;
    let totalReceivedCount = 0;
    let totalSoldWeight = 0;
    let totalSoldCount = 0;
    let totalDeadWeight = 0;
    let totalDeadCount = 0;
    let totalRemainingWeight = 0;
    let totalRemainingCount = 0;

    const batchesDetail = batches.map(b => {
      const stock = this.getBatchStock(b.batch_id, targetDate);
      totalReceivedWeight += stock.received_weight;
      totalReceivedCount += stock.received_count;
      totalSoldWeight += stock.sold_weight;
      totalSoldCount += stock.sold_count;
      totalDeadWeight += stock.dead_weight;
      totalDeadCount += stock.dead_count;
      totalRemainingWeight += stock.remaining_weight;
      totalRemainingCount += stock.remaining_count;
      return stock;
    });

    return {
      up_to_date: targetDate,
      total_received_weight: Number(totalReceivedWeight.toFixed(2)),
      total_received_count: totalReceivedCount,
      total_sold_weight: Number(totalSoldWeight.toFixed(2)),
      total_sold_count: totalSoldCount,
      total_dead_weight: Number(totalDeadWeight.toFixed(2)),
      total_dead_count: totalDeadCount,
      total_remaining_weight: Number(totalRemainingWeight.toFixed(2)),
      total_remaining_count: totalRemainingCount,
      is_oversold: totalRemainingWeight < 0 || totalRemainingCount < 0,
      batches: batchesDetail
    };
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
    const targetDate = dateStr || getBaghdadDate();
    const sales = this.getSales();
    return sales.filter(s => getBaghdadDate(s.timestamp) === targetDate);
  }

  saveSale(saleData) {
    if (!saleData || typeof saleData !== 'object') {
      throw new Error('داتای فرۆشتن نادرووستە');
    }

    const settings = this.getSettings();
    const itemType = saleData.item_type || 'مریشکی ناسک';
    const isServiceOnly = Boolean(saleData.is_service_only);

    const rawCount = parseInt(saleData.chickens_count, 10);
    const rawWeight = Number(saleData.weight_kg);
    const rawSellPrice = saleData.sell_price_per_kg !== undefined ? Number(saleData.sell_price_per_kg) : null;
    const rawCleanFee = saleData.cleaning_fee_per_chicken !== undefined ? Number(saleData.cleaning_fee_per_chicken) : null;

    // Strict validation: Reject negative or non-positive values
    if (isNaN(rawCount) || rawCount <= 0) {
      throw new Error('ژمارەی دانە دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت');
    }
    if (!isServiceOnly && (isNaN(rawWeight) || rawWeight <= 0)) {
      throw new Error('کێشی سەر تەرازوو دەبێت گەورەتر بێت لە صفر');
    }
    if (rawSellPrice !== null && (isNaN(rawSellPrice) || rawSellPrice < 0)) {
      throw new Error('نرخی فرۆشتن ناتوانێت سالب بێت');
    }
    if (rawCleanFee !== null && (isNaN(rawCleanFee) || rawCleanFee < 0)) {
      throw new Error('کرێی پاککردن ناتوانێت سالب بێت');
    }

    let resolvedBatch = null;

    if (!isServiceOnly) {
      // 1. Resolve source batch
      if (saleData.batch_id) {
        resolvedBatch = this.getBatchById(saleData.batch_id);
        if (!resolvedBatch) {
          throw new Error(`باری دیاریکراو بە ناسنامەی (${saleData.batch_id}) بوونی نییە لە مەخزەن`);
        }
        if (resolvedBatch.poultry_type && resolvedBatch.poultry_type !== itemType) {
          throw new Error(`جۆری باری دیاریکراو (${resolvedBatch.poultry_type}) لەگەڵ جۆری فرۆشراو (${itemType}) یەک ناگرێتەوە`);
        }
      } else {
        resolvedBatch = this.getActiveBatch(itemType);
        if (!resolvedBatch) {
          throw new Error(`هیچ بارێکی کارا بۆ (${itemType}) لە مەخزەن نییە. تکایە سەرەتا باری نوێ داخڵ بکە`);
        }
      }

      // 2. Strict Inventory Validation against batch stock
      const stock = this.getBatchStock(resolvedBatch.batch_id);
      if (rawWeight > stock.remaining_weight) {
        throw new Error(`کێشی داواکراو (${rawWeight} کگم) زیاترە لە کێشی بەردەست لەم بارەدا (${stock.remaining_weight} کگم)`);
      }
      if (resolvedBatch.total_chickens && rawCount > stock.remaining_count) {
        throw new Error(`ژمارەی داواکراو (${rawCount} دانە) زیاترە لە ژمارەی بەردەست لەم بارەدا (${stock.remaining_count} دانە)`);
      }
    }

    const chickensCount = rawCount;
    const weightKg = isServiceOnly ? 0 : rawWeight;
    const sellPrice = isServiceOnly 
      ? 0 
      : (rawSellPrice !== null && rawSellPrice > 0 ? rawSellPrice : (resolvedBatch ? resolvedBatch.sell_price_per_kg : settings.default_sell_price_per_kg));
    const isCleaned = isServiceOnly ? true : Boolean(saleData.is_cleaned);

    // Cleaning fee determination
    let defaultFee = settings.cleaning_fee_per_chicken || 1500;
    if (itemType === 'مریشکی پیر' || saleData.service_target_name === 'مریشکی پیر') defaultFee = settings.cleaning_fee_old_chicken || 2000;
    else if (itemType === 'قاز' || saleData.service_target_name === 'قاز') defaultFee = settings.cleaning_fee_goose || 3500;
    else if (itemType === 'قەل' || saleData.service_target_name === 'قەل') defaultFee = settings.cleaning_fee_turkey || 5000;

    const cleaningFee = rawCleanFee !== null ? rawCleanFee : defaultFee;
    const meatPrice = isServiceOnly ? 0 : Math.round(weightKg * sellPrice);
    const cleaningTotal = isCleaned ? (chickensCount * cleaningFee) : 0;
    const totalAmount = meatPrice + cleaningTotal;
    const buyPrice = resolvedBatch ? resolvedBatch.buy_price_per_kg : (isServiceOnly ? 0 : settings.default_buy_price_per_kg);
    const costOfGoods = resolvedBatch && !isServiceOnly ? Math.round(weightKg * resolvedBatch.buy_price_per_kg) : 0;

    const sales = this.getSales();
    const timestamp = saleData.timestamp || new Date().toISOString();

    const sale = {
      sale_id: saleData.sale_id || this.generateId('sale'),
      receipt_no: saleData.receipt_no || this.generateReceiptNumber(timestamp),
      timestamp: timestamp,
      item_type: itemType,
      is_service_only: isServiceOnly,
      service_target_name: saleData.service_target_name || (isServiceOnly ? 'پەلەوەری کڕیار' : itemType),
      batch_id: resolvedBatch ? resolvedBatch.batch_id : null,
      customer_name: (saleData.customer_name || '').trim(),
      chickens_count: chickensCount,
      weight_kg: weightKg,
      sell_price_per_kg: sellPrice,
      buy_price_per_kg: buyPrice,
      is_cleaned: isCleaned,
      cleaning_fee_per_chicken: cleaningFee,
      meat_price: meatPrice,
      cleaning_total_fee: cleaningTotal,
      total_amount: totalAmount,
      cost_of_goods: costOfGoods
    };

    sales.unshift(sale);
    localStorage.setItem(DB_KEYS.SALES, JSON.stringify(sales));
    this.notify('sales_updated', sales);
    return sale;
  }

  generateReceiptNumber(timestamp = null) {
    const baghdadDate = getBaghdadDate(timestamp || new Date());
    const datePrefix = baghdadDate.replace(/-/g, '');
    const salesToday = this.getSalesByDate(baghdadDate);
    const nextSeq = String(salesToday.length + 1).padStart(3, '0');
    return `${datePrefix}-${nextSeq}`;
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
    const targetDate = dateStr || getBaghdadDate();
    const losses = this.getLosses();
    return losses.filter(l => getBaghdadDate(l.timestamp) === targetDate);
  }

  saveLoss(lossData) {
    if (!lossData || typeof lossData !== 'object') {
      throw new Error('داتای زیان نادرووستە');
    }

    const rawCount = parseInt(lossData.chickens_count, 10);
    const rawWeight = lossData.estimated_weight_kg !== undefined ? Number(lossData.estimated_weight_kg) : null;

    if (isNaN(rawCount) || rawCount <= 0) {
      throw new Error('ژمارەی مریشکی مرداربوو دەبێت لە صفر گەورەتر بێت');
    }
    if (rawWeight !== null && (isNaN(rawWeight) || rawWeight < 0)) {
      throw new Error('کێشی مرداربوو ناتوانێت سالب بێت');
    }

    // Resolve source batch
    let resolvedBatch = null;
    if (lossData.batch_id) {
      resolvedBatch = this.getBatchById(lossData.batch_id);
      if (!resolvedBatch) {
        throw new Error(`باری دیاریکراو بە ناسنامەی (${lossData.batch_id}) بوونی نییە`);
      }
    } else {
      resolvedBatch = this.getActiveBatch();
    }

    const avgWeight = resolvedBatch && resolvedBatch.avg_weight_per_bird > 0
      ? resolvedBatch.avg_weight_per_bird
      : (resolvedBatch && resolvedBatch.average_weight_per_chicken > 0 ? resolvedBatch.average_weight_per_chicken : 1.9);

    const weight = rawWeight !== null && rawWeight > 0 ? rawWeight : Number((rawCount * avgWeight).toFixed(2));

    // Strict Inventory Validation for Loss
    if (resolvedBatch) {
      const stock = this.getBatchStock(resolvedBatch.batch_id);
      if (weight > stock.remaining_weight) {
        throw new Error(`کێشی زیان (${weight} کگم) زیاترە لە کێشی بەردەست لەم بارەدا (${stock.remaining_weight} کگم)`);
      }
      if (resolvedBatch.total_chickens && rawCount > stock.remaining_count) {
        throw new Error(`ژمارەی زیان (${rawCount} دانە) زیاترە لە ژمارەی بەردەست لەم بارەدا (${stock.remaining_count} دانە)`);
      }
    }

    const buyPrice = resolvedBatch ? resolvedBatch.buy_price_per_kg : this.getSettings().default_buy_price_per_kg;
    const lossCost = Math.round(weight * buyPrice);

    const losses = this.getLosses();
    const loss = {
      loss_id: lossData.loss_id || this.generateId('loss'),
      timestamp: lossData.timestamp || new Date().toISOString(),
      batch_id: resolvedBatch ? resolvedBatch.batch_id : null,
      chickens_count: rawCount,
      estimated_weight_kg: weight,
      reason: (lossData.reason || 'مرداربوونەوە لە قەفەز').trim(),
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
    const targetDate = dateStr || getBaghdadDate();
    const expenses = this.getExpenses();
    return expenses.filter(e => getBaghdadDate(e.timestamp) === targetDate);
  }

  saveExpense(expenseData) {
    if (!expenseData || typeof expenseData !== 'object') {
      throw new Error('داتای خەرجی نادرووستە');
    }

    const rawTotal = Number(expenseData.total_cost);
    const rawQty = expenseData.quantity !== undefined ? Number(expenseData.quantity) : 1;

    if (isNaN(rawTotal) || rawTotal <= 0) {
      throw new Error('بڕی پارەی خەرجی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت');
    }
    if (isNaN(rawQty) || rawQty <= 0) {
      throw new Error('بڕی خەرجی دەبێت لە صفر گەورەتر بێت');
    }

    const expenses = this.getExpenses();
    const qty = rawQty;
    const totalCost = rawTotal;
    const unitPrice = Math.max(0, Number(expenseData.unit_price) || Math.round(totalCost / qty));

    const expense = {
      expense_id: expenseData.expense_id || this.generateId('exp'),
      timestamp: expenseData.timestamp || new Date().toISOString(),
      category: (expenseData.category || 'خەرجی تر').trim(),
      description: (expenseData.description || expenseData.category || 'خەرجی گشتی').trim(),
      unit_type: (expenseData.unit_type || 'بڕی پارە').trim(),
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
    const dateStr = targetDateStr ? getBaghdadDate(targetDateStr) : getBaghdadDate();

    // 1. Day's Transaction Activity
    const batchesReceivedToday = this.getBatches().filter(b => (b.date || getBaghdadDate(b.created_at)) === dateStr);
    const salesToday = this.getSalesByDate(dateStr);
    const lossesToday = this.getLossesByDate(dateStr);
    const expensesToday = this.getExpensesByDate(dateStr);

    const receivedCages = batchesReceivedToday.reduce((sum, b) => sum + (Number(b.cages_count) || (b.cages_detail ? b.cages_detail.length : 1)), 0);
    const receivedWeight = batchesReceivedToday.reduce((sum, b) => sum + (Number(b.total_weight_kg) || 0), 0);
    const receivedCount = batchesReceivedToday.reduce((sum, b) => sum + (Number(b.total_chickens) || (Number(b.cages_count) * 25) || 0), 0);
    const receivedCost = batchesReceivedToday.reduce((sum, b) => sum + (Number(b.total_cost) || (Number(b.total_weight_kg) * Number(b.buy_price_per_kg)) || 0), 0);

    const soldCount = salesToday.reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0);
    const soldWeight = salesToday.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
    const meatRevenue = salesToday.reduce((sum, s) => sum + (Number(s.meat_price) || 0), 0);
    const cleaningRevenue = salesToday.reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0);
    const totalGrossRevenue = salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const totalCleanedChickens = salesToday.reduce((sum, s) => sum + (s.is_cleaned ? Number(s.chickens_count) : 0), 0);
    const costOfSoldGoods = salesToday.reduce((sum, s) => sum + (Number(s.cost_of_goods) || 0), 0);

    const deadCount = lossesToday.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);
    const deadWeight = lossesToday.reduce((sum, l) => sum + (Number(l.estimated_weight_kg) || 0), 0);
    const deadLossCost = lossesToday.reduce((sum, l) => sum + (Number(l.loss_financial_cost) || 0), 0);

    const adhocExpenses = expensesToday.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);

    // 2. Closing Inventory at end of dateStr across ALL batches
    const closingStock = this.getClosingInventory(dateStr);

    // Financial breakdown
    const totalCosts = costOfSoldGoods + adhocExpenses + deadLossCost;
    const netProfit = totalGrossRevenue - totalCosts;
    const meatProfit = meatRevenue - costOfSoldGoods;

    return {
      date: dateStr,
      stock: {
        // Day's receipt activity
        received_cages: receivedCages,
        received_count: receivedCount,
        received_weight: Number(receivedWeight.toFixed(2)),
        total_batch_cost: receivedCost,
        // Day's deduction activity
        sold_count: soldCount,
        sold_weight: Number(soldWeight.toFixed(2)),
        dead_count: deadCount,
        dead_weight: Number(deadWeight.toFixed(2)),
        // True closing inventory balance at the end of dateStr
        remaining_weight: closingStock.total_remaining_weight,
        remaining_count: closingStock.total_remaining_count,
        is_oversold: closingStock.is_oversold,
        closing_batches: closingStock.batches
      },
      income: {
        meat_revenue: meatRevenue,
        cleaning_revenue: cleaningRevenue,
        service_only_revenue: salesToday.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
        store_cleaning_revenue: salesToday.filter(s => !s.is_service_only).reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0),
        total_gross_revenue: totalGrossRevenue,
        cleaned_chickens_count: totalCleanedChickens,
        service_only_count: salesToday.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0),
        transactions_count: salesToday.length
      },
      expenses: {
        cost_of_sold_goods: costOfSoldGoods,
        adhoc_expenses: adhocExpenses,
        dead_loss_cost: deadLossCost,
        total_costs: totalCosts
      },
      profit: {
        net_profit: netProfit,
        meat_profit: meatProfit,
        is_profitable: netProfit >= 0
      },
      raw_data: {
        batches: batchesReceivedToday,
        sales: salesToday,
        losses: lossesToday,
        expenses: expensesToday
      }
    };
  }

  // ---------------- MONTHLY FINANCIAL REPORT (ڕاپۆرتی مانگانە) ----------------
  getMonthlyReport(targetMonthStr) {
    const monthStr = targetMonthStr ? targetMonthStr.slice(0, 7) : getBaghdadMonth();

    // 1. Activity during month
    const batchesReceived = this.getBatches().filter(b => getBaghdadMonth(b.date || b.created_at) === monthStr);
    const salesMonth = this.getSales().filter(s => getBaghdadMonth(s.timestamp) === monthStr);
    const lossesMonth = this.getLosses().filter(l => getBaghdadMonth(l.timestamp) === monthStr);
    const expensesMonth = this.getExpenses().filter(e => getBaghdadMonth(e.timestamp) === monthStr);

    const receivedCages = batchesReceived.reduce((sum, b) => sum + (Number(b.cages_count) || (b.cages_detail ? b.cages_detail.length : 1)), 0);
    const receivedWeight = batchesReceived.reduce((sum, b) => sum + (Number(b.total_weight_kg) || 0), 0);
    const receivedCount = batchesReceived.reduce((sum, b) => sum + (Number(b.total_chickens) || (Number(b.cages_count) * 25) || 0), 0);
    const receivedCost = batchesReceived.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0);

    const soldCount = salesMonth.reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0);
    const soldWeight = salesMonth.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
    const meatRevenue = salesMonth.reduce((sum, s) => sum + (Number(s.meat_price) || 0), 0);
    const cleaningRevenue = salesMonth.reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0);
    const totalGrossRevenue = salesMonth.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const totalCleanedChickens = salesMonth.reduce((sum, s) => sum + (s.is_cleaned ? Number(s.chickens_count) : 0), 0);
    const costOfSoldGoods = salesMonth.reduce((sum, s) => sum + (Number(s.cost_of_goods) || 0), 0);

    const deadCount = lossesMonth.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);
    const deadWeight = lossesMonth.reduce((sum, l) => sum + (Number(l.estimated_weight_kg) || 0), 0);
    const deadLossCost = lossesMonth.reduce((sum, l) => sum + (Number(l.loss_financial_cost) || 0), 0);

    // Monthly categorized expenses (کرێی دوکان, کارەبا, تر)
    const rentExpenses = expensesMonth.filter(e => e.category === 'کرێی دوکان' || (e.category && e.category.includes('کرێ')));
    const electricityExpenses = expensesMonth.filter(e => e.category === 'کارەبا' || (e.category && e.category.includes('کارەبا')));
    const otherExpenses = expensesMonth.filter(e => !rentExpenses.includes(e) && !electricityExpenses.includes(e));

    const totalRentPaid = rentExpenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);
    const totalElectricityPaid = electricityExpenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);
    const totalOtherExpenses = otherExpenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);
    const totalAdhocExpenses = expensesMonth.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);

    // Calculate closing date of this month (e.g. 2026-08-31)
    const [yearNum, monthNum] = monthStr.split('-').map(Number);
    const lastDayNum = new Date(yearNum, monthNum, 0).getDate();
    const lastDayOfMonth = `${monthStr}-${String(lastDayNum).padStart(2, '0')}`;
    const closingStock = this.getClosingInventory(lastDayOfMonth);

    const totalCosts = costOfSoldGoods + totalAdhocExpenses + deadLossCost;
    const netProfit = totalGrossRevenue - totalCosts;
    const meatProfit = meatRevenue - costOfSoldGoods;

    return {
      month: monthStr,
      stock: {
        received_cages: receivedCages,
        received_count: receivedCount,
        received_weight: Number(receivedWeight.toFixed(2)),
        total_batch_cost: receivedCost,
        sold_count: soldCount,
        sold_weight: Number(soldWeight.toFixed(2)),
        dead_count: deadCount,
        dead_weight: Number(deadWeight.toFixed(2)),
        remaining_weight: closingStock.total_remaining_weight,
        remaining_count: closingStock.total_remaining_count,
        is_oversold: closingStock.is_oversold
      },
      income: {
        meat_revenue: meatRevenue,
        cleaning_revenue: cleaningRevenue,
        service_only_revenue: salesMonth.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
        store_cleaning_revenue: salesMonth.filter(s => !s.is_service_only).reduce((sum, s) => sum + (Number(s.cleaning_total_fee) || 0), 0),
        total_gross_revenue: totalGrossRevenue,
        cleaned_chickens_count: totalCleanedChickens,
        service_only_count: salesMonth.filter(s => s.is_service_only).reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0),
        transactions_count: salesMonth.length
      },
      expenses: {
        cost_of_sold_goods: costOfSoldGoods,
        rent_paid: totalRentPaid,
        electricity_paid: totalElectricityPaid,
        other_expenses: totalOtherExpenses,
        total_expenses: totalAdhocExpenses,
        dead_loss_cost: deadLossCost,
        total_costs: totalCosts
      },
      profit: {
        net_profit: netProfit,
        meat_profit: meatProfit,
        is_profitable: netProfit >= 0
      },
      raw_data: {
        batches: batchesReceived,
        sales: salesMonth,
        losses: lossesMonth,
        expenses: expensesMonth
      }
    };
  }

  // ---------------- BACKUP & SEED DATA ----------------
  exportAllData() {
    return {
      version: '2.0',
      exported_at: new Date().toISOString(),
      timezone: 'Asia/Baghdad',
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
    const today = getBaghdadDate();
    
    // Demo batch
    const sampleBatch = {
      batch_id: 'batch_demo_01',
      poultry_type: 'مریشکی ناسک',
      date: today,
      cages_count: 8,
      total_chickens: 80,
      total_weight_kg: 168.5,
      avg_weight_per_bird: 2.11,
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
        item_type: 'مریشکی ناسک',
        is_service_only: false,
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
        item_type: 'مریشکی ناسک',
        is_service_only: false,
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
        item_type: 'مریشکی ناسک',
        is_service_only: false,
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
        item_type: 'مریشکی ناسک',
        is_service_only: false,
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

// Export singleton & helpers to global scope
const rootContext = typeof window !== 'undefined' ? window : global;
rootContext.Database = Database;
rootContext.getBaghdadDate = getBaghdadDate;
rootContext.getBaghdadMonth = getBaghdadMonth;
rootContext.getBaghdadTime = getBaghdadTime;
rootContext.escapeHtml = escapeHtml;
rootContext.db = new Database();
