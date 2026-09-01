/**
 * Sargalu Chicken POS - Fast POS Module (شاشەی فرۆشتنی خێرا)
 * Multi-Poultry Support + Batch Cost Linking + Strict Inventory Validation + XSS Safety
 * Event Delegation (No Inline onclick handlers)
 */

class PosModule {
  constructor() {
    this.selectedPoultryType = 'مریشکی ناسک'; // 'مریشکی ناسک' | 'مریشکی پیر' | 'قاز' | 'قەل' | 'تەنها پاککردن'
    this.selectedServiceTarget = 'مریشک'; // 'مریشک' | 'مریشکی پیر' | 'قاز' | 'قەل' | 'نرخی دەستی'
    this.customServiceFee = 1500; // Customer poultry cleaning fee
    this.customMeatSellPrice = null; // User-defined or preset meat sell price per kg
    this.customMeatCleaningFee = null; // User-defined or preset meat cleaning fee per bird
    this.currentSale = {
      customer_name: '',
      chickens_count: 1,
      weight_kg: 0,
      is_cleaned: true,
      is_service_only: false
    };
    this.weightInputBuffer = '';
    this.init();
  }

  init() {
    this.bindEvents();
    this.renderLiveBanner();
    this.renderSalesFeed();
    this.updateServiceFeeBadges();
    this.updateServiceFeeIndicator();
    this.syncMeatSellPriceUI();
    this.syncMeatCleaningFeeUI();
    this.updateCalculation();

    // Listen to db changes
    if (window.db) {
      window.db.subscribe((event) => {
        if (['batches_updated', 'active_batch_changed', 'sales_updated', 'losses_updated', 'settings_updated', 'all_data_restored'].includes(event)) {
          this.renderLiveBanner();
          this.renderSalesFeed();
          this.updateServiceFeeBadges();
          this.syncMeatSellPriceUI();
          this.syncMeatCleaningFeeUI();
          this.updateCalculation();
        }
      });
    }
  }

  bindEvents() {
    // 1. Poultry & Service Type Selector Pills
    document.querySelectorAll('#poultry_type_selector .poultry-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.getAttribute('data-type');
        this.setPoultryType(type);
        if (window.app) window.app.playSound('click');
      });
    });

    // 2. Service Only Target Bird Selector (Chicken, Old Chicken, Goose, Turkey, Custom)
    document.querySelectorAll('#service_target_selector .service-target-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target');
        this.setServiceTarget(target);
        if (window.app) window.app.playSound('click');
      });
    });

    // 2.1 Custom Cleaning Fee Direct Input (for Customer Poultry)
    const customFeeInput = document.getElementById('pos_service_custom_fee');
    if (customFeeInput) {
      customFeeInput.addEventListener('input', (e) => {
        let fee = parseFloat(e.target.value);
        if (isNaN(fee) || fee < 0) fee = 0;
        this.customServiceFee = fee;
        this.updateServiceFeeIndicator();
        this.updateCalculation();
      });
    }

    // 2.2 Meat Cleaning Fee Direct Input (for Regular Meat Sales)
    const meatCleanInput = document.getElementById('pos_meat_cleaning_fee_input');
    if (meatCleanInput) {
      meatCleanInput.addEventListener('input', (e) => {
        let fee = parseFloat(e.target.value);
        if (isNaN(fee) || fee < 0) fee = 0;
        this.customMeatCleaningFee = fee;
        this.updateMeatCleaningFeeBadge();
        this.updateCalculation();
      });
    }

    // 3. Direct Chickens Count Input
    const countInput = document.getElementById('pos_chickens_count');
    if (countInput) {
      countInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        this.currentSale.chickens_count = val;
        this.updateCalculation();
      });
    }

    // 4. Cleaning Choice Buttons (For regular meat sales)
    document.querySelectorAll('.cleaning-choice-btn[data-cleaned]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const isCleaned = e.currentTarget.getAttribute('data-cleaned') === 'true';
        this.setCleaningMode(isCleaned);
      });
    });

    // 5. Touch Keypad Buttons
    document.querySelectorAll('.keypad-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = e.currentTarget.getAttribute('data-key');
        this.handleKeypadInput(key);
        if (window.app) window.app.playSound('beep');
      });
    });

    // 6. Quick Weight Helper Buttons (+0.1, +0.5, +1.0, +2.0)
    document.querySelectorAll('.helper-btn[data-add]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const addVal = parseFloat(e.currentTarget.getAttribute('data-add'));
        let cur = parseFloat(this.weightInputBuffer) || 0;
        cur = Math.max(0, +(cur + addVal).toFixed(2));
        this.weightInputBuffer = cur.toString();
        this.currentSale.weight_kg = cur;
        this.updateWeightDisplay();
        this.updateCalculation();
        if (window.app) window.app.playSound('beep');
      });
    });

    // 7. Customer Name Input
    const custInput = document.getElementById('pos_customer_name');
    if (custInput) {
      custInput.addEventListener('input', (e) => {
        this.currentSale.customer_name = e.target.value;
      });
    }

    // 8. Save & Print Button
    const savePrintBtn = document.getElementById('pos_save_and_print_btn');
    if (savePrintBtn) {
      savePrintBtn.addEventListener('click', () => {
        this.submitSale(true);
      });
    }

    // 9. Fast Save Only Button
    const saveOnlyBtn = document.getElementById('pos_save_only_btn');
    if (saveOnlyBtn) {
      saveOnlyBtn.addEventListener('click', () => {
        this.submitSale(false);
      });
    }

    // 10. Event delegation for Batch Banner Button
    const bannerEl = document.getElementById('pos_batch_banner');
    if (bannerEl) {
      bannerEl.addEventListener('click', (e) => {
        const gotoBtn = e.target.closest('.btn-goto-batches');
        if (gotoBtn && window.app) {
          window.app.switchTab('batches');
        }
      });
    }

    // 11. Event delegation for Sales Feed Print & Delete actions (Eliminating inline onclick)
    const listEl = document.getElementById('pos_sales_feed_list');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const printBtn = e.target.closest('.btn-print-sale');
        if (printBtn) {
          const saleId = printBtn.getAttribute('data-id');
          if (isSafeRecordId(saleId)) {
            this.openReceiptModalById(saleId);
          }
          return;
        }

        const deleteBtn = e.target.closest('.btn-delete-sale');
        if (deleteBtn) {
          const saleId = deleteBtn.getAttribute('data-id');
          if (isSafeRecordId(saleId)) {
            this.confirmDeleteSale(saleId);
          }
        }
      });
    }
  }

  setPoultryType(type) {
    this.selectedPoultryType = type;
    const isService = type === 'تەنها پاککردن';
    this.currentSale.is_service_only = isService;

    // Update active pill UI
    document.querySelectorAll('#poultry_type_selector .poultry-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-type') === type);
    });

    // Update badge in header
    const badgeEl = document.getElementById('pos_current_type_badge');
    if (badgeEl) {
      let icon = '🐔';
      let badgeClass = 'badge-success';
      if (type === 'مریشکی پیر') { icon = '🐓'; badgeClass = 'badge-warning'; }
      else if (type === 'قاز') { icon = '🦆'; badgeClass = 'badge-primary'; }
      else if (type === 'قەل') { icon = '🦃'; badgeClass = 'badge-primary'; }
      else if (isService) { icon = '✂️'; badgeClass = 'badge-warning'; }

      badgeEl.className = `badge ${badgeClass}`;
      badgeEl.textContent = `${icon} ${type}`;
    }

    // Show/hide service panel vs scale weight section & cleaning choice
    const servicePanel = document.getElementById('service_only_panel');
    const scaleSection = document.getElementById('pos_scale_weight_section');
    const cleaningSection = document.getElementById('pos_cleaning_choice_section');
    const meatCleanPanel = document.getElementById('pos_meat_cleaning_custom_panel');
    const countLabel = document.getElementById('pos_count_label');

    if (isService) {
      if (servicePanel) servicePanel.style.display = 'block';
      if (scaleSection) scaleSection.style.display = 'none';
      if (cleaningSection) cleaningSection.style.display = 'none';
      if (meatCleanPanel) meatCleanPanel.style.display = 'none';
      if (countLabel) countLabel.textContent = 'ژمارەی پەلەوەری کڕیار (دانە):';
    } else {
      if (servicePanel) servicePanel.style.display = 'none';
      if (scaleSection) scaleSection.style.display = 'block';
      if (cleaningSection) cleaningSection.style.display = 'block';
      if (meatCleanPanel) meatCleanPanel.style.display = this.currentSale.is_cleaned ? 'flex' : 'none';
      if (countLabel) countLabel.textContent = 'ژمارەی مریشک / دانە:';
    }

    this.customMeatSellPrice = null;
    this.customMeatCleaningFee = null;
    this.syncMeatSellPriceUI();
    this.syncMeatCleaningFeeUI();
    this.renderLiveBanner();
    this.updateCalculation();
  }

  syncMeatSellPriceUI() {
    this.updateSellPriceBadge();
  }

  getEffectiveMeatSellPrice() {
    if (this.customMeatSellPrice !== null && !isNaN(this.customMeatSellPrice) && this.customMeatSellPrice > 0) {
      return this.customMeatSellPrice;
    }
    const activeBatch = window.db ? window.db.getActiveBatch(this.selectedPoultryType) : null;
    const settings = window.db ? window.db.getSettings() : { default_sell_price_per_kg: 2750 };
    return activeBatch ? activeBatch.sell_price_per_kg : settings.default_sell_price_per_kg;
  }

  setCustomMeatSellPrice(price) {
    this.customMeatSellPrice = Math.max(0, parseFloat(price) || 0);
    this.updateSellPriceBadge();
    this.updateCalculation();
  }

  updateSellPriceBadge() {
    const badge = document.getElementById('pos_unit_sell_price_badge');
    const effective = this.getEffectiveMeatSellPrice();
    if (badge) {
      badge.textContent = `${effective.toLocaleString()} د.ع/کگم`;
    }
  }

  syncMeatCleaningFeeUI() {
    const effectiveFee = this.getEffectiveCleaningFee();
    const input = document.getElementById('pos_meat_cleaning_fee_input');
    if (input && document.activeElement !== input) {
      input.value = effectiveFee;
    }
    this.updateMeatCleaningFeeBadge();
  }

  setCustomMeatCleaningFee(fee) {
    this.customMeatCleaningFee = Math.max(0, parseFloat(fee) || 0);
    const input = document.getElementById('pos_meat_cleaning_fee_input');
    if (input) input.value = this.customMeatCleaningFee;
    this.updateMeatCleaningFeeBadge();
    this.updateCalculation();
  }

  updateMeatCleaningFeeBadge() {
    const badge = document.getElementById('pos_meat_cleaning_fee_badge');
    const effective = this.getEffectiveCleaningFee();
    if (badge) {
      badge.textContent = `${effective.toLocaleString()} د.ع`;
    }
  }

  setServiceTarget(target) {
    this.selectedServiceTarget = target;
    document.querySelectorAll('#service_target_selector .service-target-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-target') === target);
    });

    const settings = window.db.getSettings();
    if (target === 'مریشک') {
      this.setCustomServiceFee(settings.cleaning_fee_per_chicken || 1500);
    } else if (target === 'مریشکی پیر') {
      this.setCustomServiceFee(settings.cleaning_fee_old_chicken || 2000);
    } else if (target === 'قاز') {
      this.setCustomServiceFee(settings.cleaning_fee_goose || 3500);
    } else if (target === 'قەل') {
      this.setCustomServiceFee(settings.cleaning_fee_turkey || 5000);
    } else if (target === 'نرخی دەستی') {
      const input = document.getElementById('pos_service_custom_fee');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  setCustomServiceFee(fee) {
    this.customServiceFee = Math.max(0, parseFloat(fee) || 0);
    const input = document.getElementById('pos_service_custom_fee');
    if (input) input.value = this.customServiceFee;
    this.updateServiceFeeIndicator();
    this.updateCalculation();
  }

  updateServiceFeeIndicator() {
    const ind = document.getElementById('pos_service_fee_indicator');
    if (ind) {
      ind.textContent = `${this.customServiceFee.toLocaleString()} د.ع`;
    }
  }

  updateServiceFeeBadges() {
    const settings = window.db.getSettings();
    const elChicken = document.getElementById('fee_badge_chicken');
    const elOld = document.getElementById('fee_badge_old_chicken');
    const elGoose = document.getElementById('fee_badge_goose');
    const elTurkey = document.getElementById('fee_badge_turkey');

    if (elChicken) elChicken.textContent = `${(settings.cleaning_fee_per_chicken || 1500).toLocaleString()} د.ع`;
    if (elOld) elOld.textContent = `${(settings.cleaning_fee_old_chicken || 2000).toLocaleString()} د.ع`;
    if (elGoose) elGoose.textContent = `${(settings.cleaning_fee_goose || 3500).toLocaleString()} د.ع`;
    if (elTurkey) elTurkey.textContent = `${(settings.cleaning_fee_turkey || 5000).toLocaleString()} د.ع`;
  }

  getEffectiveCleaningFee() {
    if (this.currentSale.is_service_only) {
      return this.customServiceFee;
    }
    if (!this.currentSale.is_cleaned) {
      return 0;
    }
    if (this.customMeatCleaningFee !== null && !isNaN(this.customMeatCleaningFee) && this.customMeatCleaningFee >= 0) {
      return this.customMeatCleaningFee;
    }
    const settings = window.db ? window.db.getSettings() : {};
    if (this.selectedPoultryType === 'مریشکی پیر') return settings.cleaning_fee_old_chicken || 2000;
    if (this.selectedPoultryType === 'قاز') return settings.cleaning_fee_goose || 3500;
    if (this.selectedPoultryType === 'قەل') return settings.cleaning_fee_turkey || 5000;
    return settings.cleaning_fee_per_chicken || 1500;
  }

  setCleaningMode(isCleaned) {
    this.currentSale.is_cleaned = isCleaned;

    const btnYes = document.getElementById('btn_cleaned_yes');
    const btnNo = document.getElementById('btn_cleaned_no');
    const customPanel = document.getElementById('pos_meat_cleaning_custom_panel');

    if (btnYes) btnYes.classList.toggle('active', isCleaned);
    if (btnNo) btnNo.classList.toggle('active', !isCleaned);

    if (customPanel && !this.currentSale.is_service_only) {
      customPanel.style.display = isCleaned ? 'flex' : 'none';
    }

    if (window.app) window.app.playSound('toggle');
    this.syncMeatCleaningFeeUI();
    this.updateCalculation();
  }

  handleKeypadInput(key) {
    if (key === 'clear') {
      this.weightInputBuffer = '';
    } else if (key === 'backspace') {
      this.weightInputBuffer = this.weightInputBuffer.slice(0, -1);
    } else if (key === '.') {
      if (!this.weightInputBuffer.includes('.')) {
        this.weightInputBuffer = this.weightInputBuffer ? this.weightInputBuffer + '.' : '0.';
      }
    } else {
      const nextStr = this.weightInputBuffer + key;
      if (nextStr.includes('.')) {
        const parts = nextStr.split('.');
        if (parts[1].length > 2) return;
      }
      if (parseFloat(nextStr) > 999) return;
      this.weightInputBuffer = nextStr;
    }

    this.currentSale.weight_kg = parseFloat(this.weightInputBuffer) || 0;
    this.updateWeightDisplay();
    this.updateCalculation();
  }

  updateWeightDisplay() {
    const valDisplay = document.getElementById('pos_weight_display');
    if (valDisplay) {
      valDisplay.textContent = this.weightInputBuffer || '0.00';
    }
  }

  renderLiveBanner() {
    const banner = document.getElementById('pos_batch_banner');
    if (!banner || !window.db) return;

    if (this.currentSale.is_service_only) {
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.4rem;">✂️</span>
          <div>
            <div style="font-weight: 800; font-size: 1rem;">دۆخی خزمەتگوزاری: تەنها پاککردن و بڕینی پەلەوەری کڕیار</div>
            <div style="font-size: 0.82rem; opacity: 0.95;">
              هیچ کێشێک لە مەخزەن کەم ناکرێتەوە و داهاتەکە ١٠٠٪ قازانجی سافە.
            </div>
          </div>
        </div>
      `;
      return;
    }

    const activeBatch = window.db.getActiveBatch(this.selectedPoultryType);
    const effectiveSellPrice = this.getEffectiveMeatSellPrice();

    if (!activeBatch) {
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="font-size: 1.5rem;">⚠️</span>
          <div>
            <div style="font-weight: 800; font-size: 1.05rem;">باری کارا بۆ (${escapeHtml(this.selectedPoultryType)}) دیاری نەکراوە</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">نرخی فرۆشتنی سەرەتا: ${effectiveSellPrice.toLocaleString()} د.ع/کگم</div>
          </div>
        </div>
        <button type="button" class="touch-btn btn-goto-batches" style="background: white; color: var(--primary); padding: 0.4rem 0.9rem; border-radius: var(--radius-md); font-weight: 800; font-size: 0.85rem;">
          داخڵکردنی باری نوێ ⟵
        </button>
      `;
      return;
    }

    const stock = window.db.getBatchStock(activeBatch.batch_id);
    const remainingWeight = stock ? stock.remaining_weight : activeBatch.total_weight_kg;
    const remainingCount = stock ? stock.remaining_count : (activeBatch.total_chickens || 0);

    const stockBadgeClass = remainingWeight <= 0 ? 'color: #ef4444;' : (remainingWeight < 15 ? 'color: #f59e0b;' : 'color: #dcfce7;');

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.4rem;">📦</span>
        <div>
          <div style="font-weight: 800; font-size: 1rem;">باری کارای ${escapeHtml(activeBatch.poultry_type || 'مریشک')} (${escapeHtml(activeBatch.date || '')})</div>
          <div style="font-size: 0.82rem; opacity: 0.95;">
            مەخزەنی ماوە: <strong style="${stockBadgeClass}">${remainingWeight} کگم</strong> (${remainingCount} دانە) | 
            کڕین: <span class="highlight">${activeBatch.buy_price_per_kg.toLocaleString()} د.ع</span>
          </div>
        </div>
      </div>
      <div style="text-align: left;">
        <div style="font-size: 0.75rem; opacity: 0.9;">نرخی فرۆشتن:</div>
        <div style="font-size: 1.3rem; font-weight: 900; color: #fef08a;">${effectiveSellPrice.toLocaleString()} د.ع</div>
      </div>
    `;
  }

  updateCalculation() {
    const isService = this.currentSale.is_service_only;
    const settings = window.db ? window.db.getSettings() : { currency_symbol: 'د.ع' };

    const sellPrice = isService ? 0 : this.getEffectiveMeatSellPrice();
    const cleaningFee = this.getEffectiveCleaningFee();

    const chickensCount = this.currentSale.chickens_count;
    const weightKg = isService ? 0 : this.currentSale.weight_kg;
    const isCleaned = isService ? true : this.currentSale.is_cleaned;

    const meatPrice = isService ? 0 : Math.round(weightKg * sellPrice);
    const cleaningTotal = isCleaned ? (chickensCount * cleaningFee) : 0;
    const totalAmount = meatPrice + cleaningTotal;

    // Update Choice fee label in UI
    const choiceFeeLabel = document.getElementById('calc_choice_fee_label');
    if (choiceFeeLabel) {
      choiceFeeLabel.textContent = `+${cleaningFee.toLocaleString()} د.ع بۆ هەر دانەیەک`;
    }

    // Update UI elements
    const unitPriceEl = document.getElementById('calc_unit_price');
    const meatTotalEl = document.getElementById('calc_meat_total');
    const cleaningTotalEl = document.getElementById('calc_cleaning_total');
    const grandTotalEl = document.getElementById('calc_grand_total');

    if (unitPriceEl) {
      unitPriceEl.textContent = isService ? 'خزمەتگوزاری' : `${sellPrice.toLocaleString()} ${settings.currency_symbol}`;
    }
    if (meatTotalEl) {
      meatTotalEl.textContent = isService ? '٠ د.ع (پەلەوەری کڕیار)' : `${meatPrice.toLocaleString()} ${settings.currency_symbol}`;
    }
    if (cleaningTotalEl) {
      cleaningTotalEl.textContent = `${cleaningTotal.toLocaleString()} ${settings.currency_symbol}`;
    }
    if (grandTotalEl) {
      grandTotalEl.textContent = `${totalAmount.toLocaleString()} ${settings.currency_symbol}`;
    }
  }

  submitSale(shouldPrint = true) {
    if (this._submitting) return;
    this._submitting = true;

    try {
      const isService = this.currentSale.is_service_only;
      const isCleaned = isService ? true : Boolean(this.currentSale.is_cleaned);
      
      if (!isService && (!this.currentSale.weight_kg || this.currentSale.weight_kg <= 0)) {
        if (window.app) {
          window.app.showToast('تکایە سەرەتا کێشی مریشکەکان لەسەر تەرازوو دیاری بکە', 'warning');
          window.app.playSound('error');
        }
        return;
      }

      const activeBatch = isService ? null : window.db.getActiveBatch(this.selectedPoultryType);

      if (!isService && !activeBatch) {
        if (window.app) {
          window.app.showToast(`هیچ بارێکی کارا بۆ (${this.selectedPoultryType}) لە مەخزەن نییە. تکایە سەرەتا بار داخڵ بکە`, 'warning');
          window.app.playSound('error');
        }
        return;
      }

      const sellPrice = isService ? 0 : this.getEffectiveMeatSellPrice();
      const cleaningFee = this.getEffectiveCleaningFee();

      const saleData = {
        customer_name: this.currentSale.customer_name,
        chickens_count: this.currentSale.chickens_count,
        weight_kg: isService ? 0 : this.currentSale.weight_kg,
        sell_price_per_kg: sellPrice,
        is_cleaned: isCleaned,
        cleaning_fee_per_chicken: cleaningFee,
        item_type: isService ? 'تەنها پاککردن' : this.selectedPoultryType,
        is_service_only: isService,
        service_target_name: isService ? this.selectedServiceTarget : this.selectedPoultryType,
        batch_id: activeBatch ? activeBatch.batch_id : null
      };

      const savedSale = window.db.saveSale(saleData);

      if (window.app) {
        window.app.playSound('cash');
        window.app.showToast(`وەسڵی ژمارە #${savedSale.receipt_no} (${savedSale.item_type}) تۆمارکرا`, 'success');
      }

      if (shouldPrint) {
        this.openReceiptModal(savedSale);
      }

      // Reset Form for next customer
      this.resetForm();
    } catch (err) {
      console.error('Sale save error:', err);
      if (window.app) {
        window.app.playSound('warning');
        window.app.showToast(err.message || 'هەڵەیەک ڕوویدا لە تۆمارکردنی فرۆشتن', 'danger');
      }
    } finally {
      this._submitting = false;
    }
  }

  resetForm() {
    this.currentSale.customer_name = '';
    this.currentSale.chickens_count = 1;
    this.currentSale.weight_kg = 0;
    this.currentSale.is_cleaned = true;
    this.weightInputBuffer = '';

    const custInput = document.getElementById('pos_customer_name');
    if (custInput) custInput.value = '';

    const countInput = document.getElementById('pos_chickens_count');
    if (countInput) countInput.value = '1';

    this.setCleaningMode(true);
    this.updateWeightDisplay();
    this.updateCalculation();
  }

  renderSalesFeed() {
    const listEl = document.getElementById('pos_sales_feed_list');
    const countBadge = document.getElementById('pos_sales_count_badge');
    const totalTodayBadge = document.getElementById('pos_sales_today_total');
    if (!listEl || !window.db) return;

    const todayStr = getBaghdadDate();
    const salesToday = window.db.getSalesByDate(todayStr);

    if (countBadge) countBadge.textContent = `${salesToday.length} وەسڵ`;
    
    const sumTotal = salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    if (totalTodayBadge) totalTodayBadge.textContent = `${sumTotal.toLocaleString()} د.ع`;

    if (salesToday.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem; opacity: 0.6;">🧾</div>
          <div style="font-weight: 700;">هیچ فرۆشتنێک بۆ ئەمڕۆ تۆمار نەکراوە</div>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">دوای هەر فرۆشتنێک وەسڵەکان لێرە دەردەکەون</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = salesToday.map(sale => {
      const time = getBaghdadTime(sale.timestamp);
      const isService = sale.is_service_only;
      
      let typeBadge = `<span class="badge badge-success">${escapeHtml(sale.item_type || 'مریشک')}</span>`;
      if (isService) {
        typeBadge = `<span class="badge badge-warning">✂️ پاککردنی کڕیار (${escapeHtml(sale.service_target_name || 'پەلەوەر')})</span>`;
      } else if (sale.item_type === 'مریشکی پیر') {
        typeBadge = `<span class="badge badge-warning">🐓 مریشکی پیر</span>`;
      } else if (sale.item_type === 'قاز') {
        typeBadge = `<span class="badge badge-primary">🦆 قاز</span>`;
      } else if (sale.item_type === 'قەل') {
        typeBadge = `<span class="badge badge-primary">🦃 قەل</span>`;
      }

      const cleanTag = isService ? '' : (sale.is_cleaned ? `<span class="badge badge-warning">پاککردن</span>` : `<span class="badge badge-neutral">زیندوو</span>`);
      const custName = sale.customer_name ? `<span style="color: var(--info); font-weight: 700;">(${escapeHtml(sale.customer_name)})</span>` : '';

      return `
        <div class="sale-item-card">
          <div class="sale-item-info">
            <div class="sale-item-top">
              <span class="receipt-tag">#${escapeHtml(sale.receipt_no)}</span>
              <span class="sale-item-time">${time}</span>
              ${typeBadge}
              ${cleanTag}
            </div>
            <div class="sale-item-details">
              <span>${sale.chickens_count} دانە</span>
              ${!isService ? ` • <span>${sale.weight_kg} کگم</span>` : ' • <span>تەنها پاککردن</span>'} 
              ${custName}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="sale-item-amount">${Number(sale.total_amount).toLocaleString()} <span style="font-size: 0.7rem; font-weight: normal;">د.ع</span></div>
            <div class="sale-item-actions">
              <button type="button" class="action-mini-btn btn-print-sale" data-id="${escapeHtml(sale.sale_id)}" title="چاپکردنەوە">
                🖨️
              </button>
              <button type="button" class="action-mini-btn delete btn-delete-sale" data-id="${escapeHtml(sale.sale_id)}" title="سڕینەوە">
                ✕
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  openReceiptModalById(saleId) {
    if (!isSafeRecordId(saleId)) return;
    const sales = window.db.getSales();
    const sale = sales.find(s => s.sale_id === saleId);
    if (sale) {
      this.openReceiptModal(sale);
    }
  }

  openReceiptModal(sale) {
    const settings = window.db.getSettings();
    const isService = sale.is_service_only;
    const dateStr = getBaghdadDate(sale.timestamp);
    const timeStr = getBaghdadTime(sale.timestamp);
    const fullTimeStr = `${dateStr} ${timeStr}`;

    const receiptHtml = `
      <div class="receipt-paper print-area" id="printable_receipt">
        <div class="receipt-header">
          <div class="shop-title">${escapeHtml(settings.receipt_header || settings.store_name)}</div>
          <div class="shop-meta">${escapeHtml(settings.phone || '')}</div>
          <div class="shop-meta">${escapeHtml(settings.address || '')}</div>
        </div>

        <div class="receipt-info-row">
          <span>ژمارەی وەسڵ: <strong>#${escapeHtml(sale.receipt_no)}</strong></span>
          <span>کاتی فرۆشتن: ${fullTimeStr}</span>
        </div>
        ${sale.customer_name ? `
          <div class="receipt-info-row">
            <span>کڕیار: <strong>${escapeHtml(sale.customer_name)}</strong></span>
          </div>
        ` : ''}

        <table class="receipt-table">
          <thead>
            <tr>
              <th>بڕگە</th>
              <th style="text-align: center;">ژمارە / کێش</th>
              <th style="text-align: left;">نرخ (د.ع)</th>
            </tr>
          </thead>
          <tbody>
            ${!isService ? `
              <tr>
                <td>
                  <div>${escapeHtml(sale.item_type || 'مریشکی زیندوو')}</div>
                  <div style="font-size: 0.75rem; color: #555;">(${Number(sale.sell_price_per_kg).toLocaleString()} د.ع/کگم)</div>
                </td>
                <td style="text-align: center;">
                  <div>${sale.chickens_count} دانە</div>
                  <div>${sale.weight_kg} کگم</div>
                </td>
                <td style="text-align: left; font-weight: 700;">
                  ${Number(sale.meat_price).toLocaleString()}
                </td>
              </tr>
            ` : ''}
            
            ${isService ? `
              <tr>
                <td>
                  <div>✂️ خزمەتگوزاری پاککردن و بڕین</div>
                  <div style="font-size: 0.75rem; color: #555;">(پەلەوەری کڕیار: ${escapeHtml(sale.service_target_name || 'مریشک')})</div>
                </td>
                <td style="text-align: center;">${sale.chickens_count} دانە</td>
                <td style="text-align: left; font-weight: 700;">
                  ${Number(sale.cleaning_total_fee).toLocaleString()}
                </td>
              </tr>
            ` : (sale.is_cleaned ? `
              <tr>
                <td>کرێی پاککردن و بڕین</td>
                <td style="text-align: center;">${sale.chickens_count} دانە</td>
                <td style="text-align: left; font-weight: 700;">
                  ${Number(sale.cleaning_total_fee).toLocaleString()}
                </td>
              </tr>
            ` : '')}
          </tbody>
        </table>

        <div class="receipt-total-box">
          <div class="receipt-total-row">
            <span>کۆی گشتی:</span>
            <span>${Number(sale.total_amount).toLocaleString()} د.ع</span>
          </div>
        </div>

        <div class="receipt-footer">
          <div>${escapeHtml(settings.receipt_footer || 'سوپاس بۆ سەردانەکەتان')}</div>
          <div style="margin-top: 4px; font-size: 0.65rem; color: #888;">سیستەمی پێشکەوتووی سەرگەڵو POS</div>
        </div>
      </div>
    `;

    const container = document.getElementById('receipt_modal_content');
    if (container) {
      container.innerHTML = receiptHtml;
    }

    if (window.app) window.app.openModal('receipt_modal');

    // Auto-trigger print if enabled in settings
    if (settings.auto_print_receipt) {
      setTimeout(() => {
        window.print();
      }, 300);
    }
  }

  confirmDeleteSale(saleId) {
    if (!isSafeRecordId(saleId)) return;
    if (confirm('ئایا دڵنیایت لە هەڵوەشاندنەوە و سڕینەوەی ئەم وەسڵە؟ ڕەسیدی کۆگا نوێ دەکرێتەوە.')) {
      try {
        window.db.deleteSale(saleId);
        if (window.app) {
          window.app.showToast('وەسڵەکە سڕایەوە', 'danger');
          window.app.playSound('delete');
        }
      } catch (err) {
        if (window.app) {
          window.app.showToast(err.message || 'هەڵە لە سڕینەوەی وەسڵ', 'warning');
        }
      }
    }
  }
}

// Global instance
window.pos = new PosModule();
