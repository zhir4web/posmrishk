/**
 * Sargalu Chicken POS - Database Engine
 * Storage Engine: LocalStorage with reactive state updates & JSON backup/restore
 * Strict Data Integrity, Asia/Baghdad Timezone, Batch Cost Linking, Cross-Day Stock,
 * Receipt Sequence Persistence, Transactional Import Validation, XSS Safety
 */

const DB_KEYS = {
  BATCHES: 'sargalu_batches',
  SALES: 'sargalu_sales',
  LOSSES: 'sargalu_losses',
  EXPENSES: 'sargalu_expenses',
  SETTINGS: 'sargalu_settings',
  ACTIVE_BATCH_ID: 'sargalu_active_batch_id',
  RECEIPT_SEQUENCES: 'sargalu_pos_receipt_sequences'
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
    if (yyyy && mm && dd) {
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch (e) {
    console.error('Baghdad date formatting error:', e);
  }

  // Fallback if Intl fails
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const baghdadOffset = 3 * 3600000; // UTC+3
  const baghdadDate = new Date(utc + baghdadOffset);
  return baghdadDate.toISOString().slice(0, 10);
}

/**
 * Returns YYYY-MM in Asia/Baghdad timezone
 */
function getBaghdadMonth(dateOrTimestamp = new Date()) {
  const dateStr = getBaghdadDate(dateOrTimestamp);
  return dateStr ? dateStr.slice(0, 7) : '';
}

/**
 * Returns HH:MM in Asia/Baghdad timezone (24h format)
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
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * XSS HTML Escaping helper
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

// Expose helpers globally
if (typeof window !== 'undefined') {
  window.getBaghdadDate = getBaghdadDate;
  window.getBaghdadMonth = getBaghdadMonth;
  window.getBaghdadTime = getBaghdadTime;
  window.escapeHtml = escapeHtml;
} else if (typeof global !== 'undefined') {
  global.getBaghdadDate = getBaghdadDate;
  global.getBaghdadMonth = getBaghdadMonth;
  global.getBaghdadTime = getBaghdadTime;
  global.escapeHtml = escapeHtml;
}

// ---------------- DATABASE CLASS ----------------

class Database {
  constructor() {
    this.listeners = [];
    this.init();
  }

  init() {
    // Initialize default settings if not already present
    if (!localStorage.getItem(DB_KEYS.SETTINGS)) {
      this.saveSettings(DEFAULT_SETTINGS);
    }
  }

  // Subscribe to changes (Reactive updates)
  subscribe(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
    }
  }

  notify(event, data) {
    this.listeners.forEach(fn => {
      try {
        fn(event, data);
      } catch (e) {
        console.error('Error in db subscriber:', e);
      }
    });
  }

  // Generate unique IDs
  generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // ---------------- SETTINGS ----------------

  getSettings() {
    try {
      const data = localStorage.getItem(DB_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (e) {
      console.error('Error reading settings:', e);
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    
    // Strict sanitation of numeric fields
    if (updated.cleaning_fee_per_chicken !== undefined) updated.cleaning_fee_per_chicken = Math.max(0, Number(updated.cleaning_fee_per_chicken) || 0);
    if (updated.cleaning_fee_old_chicken !== undefined) updated.cleaning_fee_old_chicken = Math.max(0, Number(updated.cleaning_fee_old_chicken) || 0);
    if (updated.cleaning_fee_goose !== undefined) updated.cleaning_fee_goose = Math.max(0, Number(updated.cleaning_fee_goose) || 0);
    if (updated.cleaning_fee_turkey !== undefined) updated.cleaning_fee_turkey = Math.max(0, Number(updated.cleaning_fee_turkey) || 0);
    if (updated.monthly_rent !== undefined) updated.monthly_rent = Math.max(0, Number(updated.monthly_rent) || 0);
    if (updated.default_sell_price_per_kg !== undefined) updated.default_sell_price_per_kg = Math.max(0, Number(updated.default_sell_price_per_kg) || 0);
    if (updated.default_buy_price_per_kg !== undefined) updated.default_buy_price_per_kg = Math.max(0, Number(updated.default_buy_price_per_kg) || 0);

    localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(updated));
    this.notify('settings_updated', updated);
    return updated;
  }

  // ---------------- BATCHES (مەخزەن و بارەکان) ----------------

  getBatches() {
    try {
      const data = localStorage.getItem(DB_KEYS.BATCHES);
      const batches = data ? JSON.parse(data) : [];
      if (!Array.isArray(batches)) return [];
      
      // Normalize legacy batches
      return batches.map(b => {
        const totalWeight = Number(b.total_weight_kg) || 0;
        const totalCount = Number(b.total_chickens) || (Number(b.cages_count) * 25) || 0;
        const avg = (totalWeight > 0 && totalCount > 0)
          ? +(totalWeight / totalCount).toFixed(2)
          : (b.average_weight_per_chicken || b.avg_weight_per_bird || 1.9);
        
        return {
          ...b,
          average_weight_per_chicken: b.average_weight_per_chicken || avg,
          avg_weight_per_bird: b.avg_weight_per_bird || b.average_weight_per_chicken || avg
        };
      });
    } catch (e) {
      console.error('Error reading batches:', e);
      return [];
    }
  }

  getBatchById(batchId) {
    if (!batchId) return null;
    const batches = this.getBatches();
    return batches.find(b => b.batch_id === batchId) || null;
  }

  getActiveBatch(poultryType = null) {
    const batches = this.getBatches();
    if (batches.length === 0) return null;

    const activeId = localStorage.getItem(DB_KEYS.ACTIVE_BATCH_ID);
    if (activeId) {
      const found = batches.find(b => b.batch_id === activeId);
      if (found) {
        if (!poultryType || !found.poultry_type || found.poultry_type === poultryType) {
          return found;
        }
      }
    }

    // Fallback: Find latest batch matching poultryType or first batch
    if (poultryType) {
      const typeMatch = batches.find(b => (b.poultry_type || 'مریشکی ناسک') === poultryType);
      if (typeMatch) return typeMatch;
    }

    return batches[0] || null;
  }

  setActiveBatch(batchId) {
    localStorage.setItem(DB_KEYS.ACTIVE_BATCH_ID, batchId);
    this.notify('active_batch_changed', this.getBatchById(batchId));
  }

  saveBatch(batchData) {
    if (!batchData || typeof batchData !== 'object') {
      throw new Error('داتای بار نادرووستە');
    }

    const batches = this.getBatches();
    const batch = { ...batchData };
    if (!batch.batch_id) {
      batch.batch_id = this.generateId('batch');
      batch.created_at = new Date().toISOString();
    }

    const rawCages = parseInt(batch.cages_count, 10);
    const rawChickens = parseInt(batch.total_chickens, 10);
    const rawWeight = Number(batch.total_weight_kg);
    const rawBuyPrice = Number(batch.buy_price_per_kg);
    const rawSellPrice = Number(batch.sell_price_per_kg);

    // Strict validation: Reject negative or non-positive values
    if (isNaN(rawCages) || rawCages <= 0) {
      throw new Error('ژمارەی قەفەزەکان دەبێت ژمارەیەکی درووست و گەورەتر لە سفر بێت');
    }
    if (isNaN(rawWeight) || rawWeight <= 0) {
      throw new Error('کۆی کێشی بارەکە دەبێت گەورەتر بێت لە صفر');
    }
    if (isNaN(rawBuyPrice) || rawBuyPrice < 0) {
      throw new Error('نرخی کڕین ناتوانێت سالب بێت');
    }
    if (isNaN(rawSellPrice) || rawSellPrice < 0) {
      throw new Error('نرخی فرۆشتن ناتوانێت سالب بێت');
    }

    const poultryType = batch.poultry_type || 'مریشکی ناسک';
    const totalChickens = rawChickens > 0 ? rawChickens : Math.max(1, rawCages * 25);
    const avgWeight = (rawWeight > 0 && totalChickens > 0)
      ? +(rawWeight / totalChickens).toFixed(2)
      : (batch.average_weight_per_chicken !== undefined ? Number(batch.average_weight_per_chicken) : (batch.avg_weight_per_bird !== undefined ? Number(batch.avg_weight_per_bird) : 1.9));
    const batchDate = batch.date ? getBaghdadDate(batch.date) : getBaghdadDate();

    batch.poultry_type = poultryType;
    batch.date = batchDate;
    batch.cages_count = rawCages;
    batch.total_chickens = totalChickens;
    batch.total_weight_kg = rawWeight;
    batch.average_weight_per_chicken = avgWeight;
    batch.avg_weight_per_bird = avgWeight; // backward compatible alias
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

    // Exact remaining stock (do NOT mask with Math.max(0, ...) so deficits are visible)
    const remainingWeight = +(receivedWeight - soldWeight - deadWeight).toFixed(2);
    const remainingCount = receivedCount - soldCount - deadCount;

    return {
      batch_id: batchId,
      poultry_type: batch.poultry_type || 'مریشکی ناسک',
      batch_date: batch.date,
      received_weight: receivedWeight,
      received_count: receivedCount,
      sold_weight: +soldWeight.toFixed(2),
      sold_count: soldCount,
      dead_weight: +deadWeight.toFixed(2),
      dead_count: deadCount,
      remaining_weight: remainingWeight,
      remaining_count: remainingCount,
      is_depleted: remainingWeight <= 0,
      is_oversold: remainingWeight < 0
    };
  }

  /**
   * Calculates closing inventory available across all batches up to upToDate.
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

    const batchBreakdown = [];

    batches.forEach(b => {
      const stock = this.getBatchStock(b.batch_id, targetDate);
      if (stock) {
        totalReceivedWeight += stock.received_weight;
        totalReceivedCount += stock.received_count;
        totalSoldWeight += stock.sold_weight;
        totalSoldCount += stock.sold_count;
        totalDeadWeight += stock.dead_weight;
        totalDeadCount += stock.dead_count;
        totalRemainingWeight += stock.remaining_weight;
        totalRemainingCount += stock.remaining_count;
        batchBreakdown.push(stock);
      }
    });

    return {
      up_to_date: targetDate,
      total_received_weight: +totalReceivedWeight.toFixed(2),
      total_received_count: totalReceivedCount,
      total_sold_weight: +totalSoldWeight.toFixed(2),
      total_sold_count: totalSoldCount,
      total_dead_weight: +totalDeadWeight.toFixed(2),
      total_dead_count: totalDeadCount,
      total_remaining_weight: +totalRemainingWeight.toFixed(2),
      total_remaining_count: totalRemainingCount,
      has_shortfall: totalRemainingWeight < 0,
      batch_breakdown: batchBreakdown
    };
  }

  // ---------------- SALES (وەسڵ و فرۆشتنەکان) ----------------

  getSales() {
    try {
      const data = localStorage.getItem(DB_KEYS.SALES);
      const sales = data ? JSON.parse(data) : [];
      return Array.isArray(sales) ? sales : [];
    } catch (e) {
      console.error('Error reading sales:', e);
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
    
    // Read persistent sequence map
    let seqMap = {};
    try {
      seqMap = JSON.parse(localStorage.getItem(DB_KEYS.RECEIPT_SEQUENCES) || '{}') || {};
    } catch (e) {
      seqMap = {};
    }

    // Inspect all existing sales for this date or matching prefix
    const sales = this.getSales();
    let maxExistingSeq = 0;
    sales.forEach(s => {
      if (s.receipt_no && typeof s.receipt_no === 'string') {
        const parts = s.receipt_no.split('-');
        if (parts.length === 2 && parts[0] === datePrefix) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxExistingSeq) {
            maxExistingSeq = num;
          }
        }
      }
    });

    const trackedSeq = parseInt(seqMap[baghdadDate], 10) || 0;
    const currentMax = Math.max(maxExistingSeq, trackedSeq);
    const nextSeq = currentMax + 1;

    seqMap[baghdadDate] = nextSeq;
    try {
      localStorage.setItem(DB_KEYS.RECEIPT_SEQUENCES, JSON.stringify(seqMap));
    } catch (e) {}

    return `${datePrefix}-${String(nextSeq).padStart(3, '0')}`;
  }

  deleteSale(saleId) {
    let sales = this.getSales();
    sales = sales.filter(s => s.sale_id !== saleId);
    localStorage.setItem(DB_KEYS.SALES, JSON.stringify(sales));
    this.notify('sales_updated', sales);
  }

  // ---------------- LOSSES (مرداربوونەوە و لەدەستچوون) ----------------

  getLosses() {
    try {
      const data = localStorage.getItem(DB_KEYS.LOSSES);
      const losses = data ? JSON.parse(data) : [];
      return Array.isArray(losses) ? losses : [];
    } catch (e) {
      console.error('Error reading losses:', e);
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
    const rawWeight = lossData.estimated_weight_kg !== undefined ? Number(lossData.estimated_weight_kg) : 0;

    if (isNaN(rawCount) || rawCount <= 0) {
      throw new Error('ژمارەی مریشکی مرداربوو دەبێت لە صفر گەورەتر بێت');
    }
    if (isNaN(rawWeight) || rawWeight < 0) {
      throw new Error('کێشی زیان ناتوانێت سالب بێت');
    }

    // Resolve source batch
    let resolvedBatch = null;
    if (lossData.batch_id) {
      resolvedBatch = this.getBatchById(lossData.batch_id);
      if (!resolvedBatch) {
        throw new Error(`باری دیاریکراو بە ناسنامەی (${lossData.batch_id}) بوونی نییە لە مەخزەن`);
      }
    } else {
      resolvedBatch = this.getActiveBatch();
    }

    const settings = this.getSettings();
    const buyPrice = resolvedBatch ? resolvedBatch.buy_price_per_kg : settings.default_buy_price_per_kg;
    const avgWeight = resolvedBatch 
      ? (resolvedBatch.average_weight_per_chicken || resolvedBatch.avg_weight_per_bird || (resolvedBatch.total_weight_kg && resolvedBatch.total_chickens ? +(resolvedBatch.total_weight_kg / resolvedBatch.total_chickens).toFixed(2) : 1.9))
      : 1.9;

    const estimatedWeight = rawWeight > 0 ? rawWeight : +(rawCount * avgWeight).toFixed(2);

    // Enforce remaining stock validation if linked to batch
    if (resolvedBatch) {
      const stock = this.getBatchStock(resolvedBatch.batch_id);
      if (estimatedWeight > stock.remaining_weight) {
        throw new Error(`کێشی زیانی داواکراو (${estimatedWeight} کگم) زیاترە لە کێشی بەردەست لەم بارەدا (${stock.remaining_weight} کگم)`);
      }
      if (resolvedBatch.total_chickens && rawCount > stock.remaining_count) {
        throw new Error(`ژمارەی زیانی داواکراو (${rawCount} دانە) زیاترە لە ژمارەی بەردەست لەم بارەدا (${stock.remaining_count} دانە)`);
      }
    }

    const financialCost = Math.round(estimatedWeight * buyPrice);

    const losses = this.getLosses();
    const loss = {
      loss_id: lossData.loss_id || this.generateId('loss'),
      timestamp: lossData.timestamp || new Date().toISOString(),
      batch_id: resolvedBatch ? resolvedBatch.batch_id : null,
      chickens_count: rawCount,
      estimated_weight_kg: estimatedWeight,
      reason: (lossData.reason || 'مرداربوونەوە لە قەفەز').trim(),
      buy_price_per_kg: buyPrice,
      loss_financial_cost: financialCost
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

  // ---------------- EXPENSES (خەرجییە کاتی و مانگانەکان) ----------------

  getExpenses() {
    try {
      const data = localStorage.getItem(DB_KEYS.EXPENSES);
      const expenses = data ? JSON.parse(data) : [];
      return Array.isArray(expenses) ? expenses : [];
    } catch (e) {
      console.error('Error reading expenses:', e);
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
    const rawUnitPrice = expenseData.unit_price !== undefined ? Number(expenseData.unit_price) : null;

    if (isNaN(rawTotal) || rawTotal <= 0) {
      throw new Error('بڕی پارەی خەرجی دەبێت ژمارەیەکی درووست و گەورەتر لە صفر بێت');
    }
    if (isNaN(rawQty) || rawQty <= 0) {
      throw new Error('بڕی خەرجی دەبێت گەورەتر بێت لە صفر');
    }

    const totalCost = rawTotal;
    const quantity = rawQty;
    const unitPrice = rawUnitPrice !== null && rawUnitPrice > 0 ? rawUnitPrice : Math.round(totalCost / quantity);

    const expenses = this.getExpenses();
    const expense = {
      expense_id: expenseData.expense_id || this.generateId('exp'),
      timestamp: expenseData.timestamp || new Date().toISOString(),
      category: (expenseData.category || 'خەرجی تر').trim(),
      description: (expenseData.description || expenseData.category || 'خەرجی گشتی').trim(),
      unit_type: (expenseData.unit_type || 'دانە').trim(),
      quantity: quantity,
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

  // ---------------- FINANCIAL REPORTS (Daily & Monthly Net Profit) ----------------

  getDailyReport(dateStr) {
    const targetDate = dateStr ? getBaghdadDate(dateStr) : getBaghdadDate();

    // 1. Day's activity
    const batchesReceivedToday = this.getBatches().filter(b => (b.date || getBaghdadDate(b.created_at)) === targetDate);
    const salesToday = this.getSalesByDate(targetDate);
    const lossesToday = this.getLossesByDate(targetDate);
    const expensesToday = this.getExpensesByDate(targetDate);

    // Stock Activity on this day
    const receivedWeightToday = batchesReceivedToday.reduce((sum, b) => sum + (Number(b.total_weight_kg) || 0), 0);
    const receivedCagesToday = batchesReceivedToday.reduce((sum, b) => sum + (Number(b.cages_count) || 0), 0);
    const receivedChickensToday = batchesReceivedToday.reduce((sum, b) => sum + (Number(b.total_chickens) || (Number(b.cages_count) * 25) || 0), 0);

    const soldWeightToday = salesToday.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
    const soldChickensToday = salesToday.reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0);

    const deadWeightToday = lossesToday.reduce((sum, l) => sum + (Number(l.estimated_weight_kg) || 0), 0);
    const deadChickensToday = lossesToday.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);

    // 2. Closing Inventory available at end of targetDate across all active/past batches
    const closingInventory = this.getClosingInventory(targetDate);

    // Income breakdown
    let totalMeatRevenue = 0;
    let totalCleaningRevenue = 0;
    let storeCleaningRevenue = 0;
    let serviceOnlyRevenue = 0;
    let serviceOnlyCount = 0;
    let totalGrossRevenue = 0;
    let cleanedChickensCount = 0;

    salesToday.forEach(s => {
      totalMeatRevenue += Number(s.meat_price) || 0;
      totalCleaningRevenue += Number(s.cleaning_total_fee) || 0;
      totalGrossRevenue += Number(s.total_amount) || 0;

      if (s.is_service_only) {
        serviceOnlyRevenue += Number(s.cleaning_total_fee) || 0;
        serviceOnlyCount += Number(s.chickens_count) || 0;
      } else {
        storeCleaningRevenue += Number(s.cleaning_total_fee) || 0;
        if (s.is_cleaned) {
          cleanedChickensCount += Number(s.chickens_count) || 0;
        }
      }
    });

    // Expenses breakdown
    const costOfSoldGoods = salesToday.reduce((sum, s) => sum + (Number(s.cost_of_goods) || 0), 0);
    const adhocExpenses = expensesToday.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);
    const deadLossCost = lossesToday.reduce((sum, l) => sum + (Number(l.loss_financial_cost) || 0), 0);

    const totalCosts = costOfSoldGoods + adhocExpenses + deadLossCost;
    const netProfit = totalGrossRevenue - totalCosts;
    const meatProfit = totalMeatRevenue - costOfSoldGoods;

    return {
      date: targetDate,
      stock: {
        // Activity for today
        received_weight: +receivedWeightToday.toFixed(2),
        received_cages: receivedCagesToday,
        received_count: receivedChickensToday,
        sold_weight: +soldWeightToday.toFixed(2),
        sold_count: soldChickensToday,
        dead_weight: +deadWeightToday.toFixed(2),
        dead_count: deadChickensToday,
        // Cumulative closing balance at end of this day
        remaining_weight: closingInventory.total_remaining_weight,
        remaining_count: closingInventory.total_remaining_count,
        is_oversold: closingInventory.has_shortfall
      },
      income: {
        total_gross_revenue: totalGrossRevenue,
        meat_revenue: totalMeatRevenue,
        cleaning_revenue: totalCleaningRevenue,
        store_cleaning_revenue: storeCleaningRevenue,
        service_only_revenue: serviceOnlyRevenue,
        service_only_count: serviceOnlyCount,
        cleaned_chickens_count: cleanedChickensCount,
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
        cleaning_profit: totalCleaningRevenue,
        is_profitable: netProfit > 0
      },
      raw_data: {
        batches: batchesReceivedToday,
        sales: salesToday,
        losses: lossesToday,
        expenses: expensesToday,
        closing_inventory: closingInventory
      }
    };
  }

  getMonthlyReport(monthStr) {
    const targetMonth = monthStr ? monthStr.slice(0, 7) : getBaghdadMonth();

    // 1. Activity in targetMonth
    const batchesThisMonth = this.getBatches().filter(b => {
      const bMonth = (b.date || getBaghdadDate(b.created_at)).slice(0, 7);
      return bMonth === targetMonth;
    });

    const salesThisMonth = this.getSales().filter(s => getBaghdadMonth(s.timestamp) === targetMonth);
    const lossesThisMonth = this.getLosses().filter(l => getBaghdadMonth(l.timestamp) === targetMonth);
    const expensesThisMonth = this.getExpenses().filter(e => getBaghdadMonth(e.timestamp) === targetMonth);

    // Stock Activity in this month
    const receivedWeightMonth = batchesThisMonth.reduce((sum, b) => sum + (Number(b.total_weight_kg) || 0), 0);
    const receivedCagesMonth = batchesThisMonth.reduce((sum, b) => sum + (Number(b.cages_count) || 0), 0);
    const receivedChickensMonth = batchesThisMonth.reduce((sum, b) => sum + (Number(b.total_chickens) || (Number(b.cages_count) * 25) || 0), 0);

    const soldWeightMonth = salesThisMonth.reduce((sum, s) => sum + (Number(s.weight_kg) || 0), 0);
    const soldChickensMonth = salesThisMonth.reduce((sum, s) => sum + (Number(s.chickens_count) || 0), 0);

    const deadWeightMonth = lossesThisMonth.reduce((sum, l) => sum + (Number(l.estimated_weight_kg) || 0), 0);
    const deadChickensMonth = lossesThisMonth.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);

    // Determine end date of month for closing inventory
    const [year, month] = targetMonth.split('-').map(Number);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const monthEndDateStr = `${targetMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const closingInventory = this.getClosingInventory(monthEndDateStr);

    // Income breakdown
    let totalMeatRevenue = 0;
    let totalCleaningRevenue = 0;
    let storeCleaningRevenue = 0;
    let serviceOnlyRevenue = 0;
    let serviceOnlyCount = 0;
    let totalGrossRevenue = 0;
    let cleanedChickensCount = 0;

    salesThisMonth.forEach(s => {
      totalMeatRevenue += Number(s.meat_price) || 0;
      totalCleaningRevenue += Number(s.cleaning_total_fee) || 0;
      totalGrossRevenue += Number(s.total_amount) || 0;

      if (s.is_service_only) {
        serviceOnlyRevenue += Number(s.cleaning_total_fee) || 0;
        serviceOnlyCount += Number(s.chickens_count) || 0;
      } else {
        storeCleaningRevenue += Number(s.cleaning_total_fee) || 0;
        if (s.is_cleaned) {
          cleanedChickensCount += Number(s.chickens_count) || 0;
        }
      }
    });

    // Expenses breakdown
    const costOfSoldGoods = salesThisMonth.reduce((sum, s) => sum + (Number(s.cost_of_goods) || 0), 0);
    const deadLossCost = lossesThisMonth.reduce((sum, l) => sum + (Number(l.loss_financial_cost) || 0), 0);

    // Categorized expenses
    let rentPaid = 0;
    let electricityPaid = 0;
    let otherExpenses = 0;

    expensesThisMonth.forEach(e => {
      const cost = Number(e.total_cost) || 0;
      if (e.category === 'کرێی دوکان' || e.category === 'کرێی مانگانەی دوکان') {
        rentPaid += cost;
      } else if (e.category === 'کارەبا' || e.category === 'پارەی کارەبا (گۆڕاو)') {
        electricityPaid += cost;
      } else {
        otherExpenses += cost;
      }
    });

    const totalOperatingExpenses = rentPaid + electricityPaid + otherExpenses;
    const totalCosts = costOfSoldGoods + totalOperatingExpenses + deadLossCost;
    const netProfit = totalGrossRevenue - totalCosts;
    const meatProfit = totalMeatRevenue - costOfSoldGoods;

    return {
      month: targetMonth,
      stock: {
        received_weight: +receivedWeightMonth.toFixed(2),
        received_cages: receivedCagesMonth,
        received_count: receivedChickensMonth,
        sold_weight: +soldWeightMonth.toFixed(2),
        sold_count: soldChickensMonth,
        dead_weight: +deadWeightMonth.toFixed(2),
        dead_count: deadChickensMonth,
        remaining_weight: closingInventory.total_remaining_weight,
        remaining_count: closingInventory.total_remaining_count,
        is_oversold: closingInventory.has_shortfall
      },
      income: {
        total_gross_revenue: totalGrossRevenue,
        meat_revenue: totalMeatRevenue,
        cleaning_revenue: totalCleaningRevenue,
        store_cleaning_revenue: storeCleaningRevenue,
        service_only_revenue: serviceOnlyRevenue,
        service_only_count: serviceOnlyCount,
        cleaned_chickens_count: cleanedChickensCount,
        transactions_count: salesThisMonth.length
      },
      expenses: {
        cost_of_sold_goods: costOfSoldGoods,
        rent_paid: rentPaid,
        electricity_paid: electricityPaid,
        other_expenses: otherExpenses,
        total_operating_expenses: totalOperatingExpenses,
        dead_loss_cost: deadLossCost,
        total_costs: totalCosts
      },
      profit: {
        net_profit: netProfit,
        meat_profit: meatProfit,
        cleaning_profit: totalCleaningRevenue,
        is_profitable: netProfit > 0
      },
      raw_data: {
        batches: batchesThisMonth,
        sales: salesThisMonth,
        losses: lossesThisMonth,
        expenses: expensesThisMonth,
        closing_inventory: closingInventory
      }
    };
  }

  // ---------------- BACKUP & RESTORE (Transactional JSON) ----------------

  exportAllData() {
    let seqMap = {};
    try {
      seqMap = JSON.parse(localStorage.getItem(DB_KEYS.RECEIPT_SEQUENCES) || '{}') || {};
    } catch (e) {}

    return {
      version: '2.0.0',
      exported_at: new Date().toISOString(),
      timezone: 'Asia/Baghdad',
      store: this.getSettings().store_name,
      data: {
        settings: this.getSettings(),
        batches: this.getBatches(),
        sales: this.getSales(),
        losses: this.getLosses(),
        expenses: this.getExpenses(),
        receipt_sequences: seqMap
      }
    };
  }

  importAllData(jsonData) {
    try {
      const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: 'فایلی پاشەکەوت دەبێت فۆرماتی درووستی JSON بێت' };
      }

      const data = parsed.data || parsed;
      if (!data || typeof data !== 'object') {
        return { success: false, error: 'پێکهاتەی فایلی پاشەکەوت نادرووستە' };
      }

      // 1. Transactional Pre-Validation: Validate everything before writing to storage

      // Validate Settings if present
      if (data.settings !== undefined) {
        if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
          return { success: false, error: 'ڕێکخستنەکان لە فایلی هاوردەکراو دەبێت ئۆبجێکت بێت' };
        }
        const s = data.settings;
        if (s.cleaning_fee_per_chicken !== undefined && (isNaN(Number(s.cleaning_fee_per_chicken)) || Number(s.cleaning_fee_per_chicken) < 0)) {
          return { success: false, error: 'نرخی پاککردن ناتوانێت سالب بێت' };
        }
        if (s.monthly_rent !== undefined && (isNaN(Number(s.monthly_rent)) || Number(s.monthly_rent) < 0)) {
          return { success: false, error: 'کرێی مانگانە ناتوانێت سالب بێت' };
        }
      }

      // Validate Batches if present
      if (data.batches !== undefined) {
        if (!Array.isArray(data.batches)) {
          return { success: false, error: 'لیستی بارەکان دەبێت Array بێت' };
        }
        for (const b of data.batches) {
          if (!b || typeof b !== 'object') {
            return { success: false, error: 'تۆماری بار لە فایلی داتادا نادرووستە' };
          }
          if (b.total_weight_kg !== undefined && (isNaN(Number(b.total_weight_kg)) || Number(b.total_weight_kg) <= 0)) {
            return { success: false, error: 'کێشی بار دەبێت ژمارەیەکی درووست و گەورەتر بێت لە صفر' };
          }
          if (b.buy_price_per_kg !== undefined && (isNaN(Number(b.buy_price_per_kg)) || Number(b.buy_price_per_kg) < 0)) {
            return { success: false, error: 'نرخی کڕینی بار ناتوانێت سالب بێت' };
          }
        }
      }

      // Validate Sales if present
      if (data.sales !== undefined) {
        if (!Array.isArray(data.sales)) {
          return { success: false, error: 'لیستی فرۆشتنەکان دەبێت Array بێت' };
        }
        for (const s of data.sales) {
          if (!s || typeof s !== 'object') {
            return { success: false, error: 'تۆماری فرۆشتن نادرووستە' };
          }
          if (s.chickens_count !== undefined && (isNaN(Number(s.chickens_count)) || Number(s.chickens_count) <= 0)) {
            return { success: false, error: 'ژمارەی دانەی فرۆشراو دەبێت گەورەتر بێت لە صفر' };
          }
          if (s.weight_kg !== undefined && (isNaN(Number(s.weight_kg)) || Number(s.weight_kg) < 0)) {
            return { success: false, error: 'کێشی فرۆشراو ناتوانێت سالب بێت' };
          }
          if (s.total_amount !== undefined && (isNaN(Number(s.total_amount)) || Number(s.total_amount) < 0)) {
            return { success: false, error: 'کۆی پارەی فرۆشراو ناتوانێت سالب بێت' };
          }
        }
      }

      // Validate Losses if present
      if (data.losses !== undefined) {
        if (!Array.isArray(data.losses)) {
          return { success: false, error: 'لیستی زیانەکان دەبێت Array بێت' };
        }
        for (const l of data.losses) {
          if (!l || typeof l !== 'object') {
            return { success: false, error: 'تۆماری زیان نادرووستە' };
          }
          if (l.chickens_count !== undefined && (isNaN(Number(l.chickens_count)) || Number(l.chickens_count) <= 0)) {
            return { success: false, error: 'ژمارەی زیان دەبێت گەورەتر بێت لە صفر' };
          }
          if (l.estimated_weight_kg !== undefined && (isNaN(Number(l.estimated_weight_kg)) || Number(l.estimated_weight_kg) < 0)) {
            return { success: false, error: 'کێشی زیان ناتوانێت سالب بێت' };
          }
        }
      }

      // Validate Expenses if present
      if (data.expenses !== undefined) {
        if (!Array.isArray(data.expenses)) {
          return { success: false, error: 'لیستی خەرجییەکان دەبێت Array بێت' };
        }
        for (const e of data.expenses) {
          if (!e || typeof e !== 'object') {
            return { success: false, error: 'تۆماری خەرجی نادرووستە' };
          }
          if (e.total_cost !== undefined && (isNaN(Number(e.total_cost)) || Number(e.total_cost) <= 0)) {
            return { success: false, error: 'بڕی پارەی خەرجی دەبێت گەورەتر بێت لە صفر' };
          }
        }
      }

      // 2. Transactional Write: Only reached if ALL validations pass successfully
      if (data.settings) localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(data.settings));
      if (data.batches) localStorage.setItem(DB_KEYS.BATCHES, JSON.stringify(data.batches));
      if (data.sales) localStorage.setItem(DB_KEYS.SALES, JSON.stringify(data.sales));
      if (data.losses) localStorage.setItem(DB_KEYS.LOSSES, JSON.stringify(data.losses));
      if (data.expenses) localStorage.setItem(DB_KEYS.EXPENSES, JSON.stringify(data.expenses));
      if (data.receipt_sequences) localStorage.setItem(DB_KEYS.RECEIPT_SEQUENCES, JSON.stringify(data.receipt_sequences));

      this.notify('all_data_restored', true);
      return { success: true };
    } catch (e) {
      console.error('Import error:', e);
      return { success: false, error: e.message || 'هەڵە لە فایلی داتادا' };
    }
  }

  clearAllData() {
    localStorage.removeItem(DB_KEYS.BATCHES);
    localStorage.removeItem(DB_KEYS.SALES);
    localStorage.removeItem(DB_KEYS.LOSSES);
    localStorage.removeItem(DB_KEYS.EXPENSES);
    localStorage.removeItem(DB_KEYS.ACTIVE_BATCH_ID);
    localStorage.removeItem(DB_KEYS.RECEIPT_SEQUENCES);
    this.notify('all_data_restored', true);
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
      average_weight_per_chicken: 2.11,
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
}

// Global singleton instance
if (typeof window !== 'undefined') {
  window.db = new Database();
} else if (typeof global !== 'undefined') {
  global.db = new Database();
}
