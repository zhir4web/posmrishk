/**
 * Sargalu Chicken POS - Simplified Batches Module (داخڵکردنی باری نوێ - مەخزەن)
 * Simplified fields: Cages count, Total weight, Buy price, Sell price & Total cost
 */

class BatchesModule {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
    this.renderBatchesList();
    this.setDefaultDate();

    window.db.subscribe((event) => {
      if (['batches_updated', 'active_batch_changed'].includes(event)) {
        this.renderBatchesList();
      }
    });
  }

  setDefaultDate() {
    const dateInput = document.getElementById('batch_date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  bindEvents() {
    // Live calculation on input change
    ['batch_cages_count', 'batch_total_chickens', 'batch_total_weight', 'batch_buy_price', 'batch_sell_price'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateBatchCalculations();
        });
      }
    });

    // Save Batch Form Submit
    const form = document.getElementById('batch_entry_form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveBatch();
      });
    }
  }

  updateBatchCalculations() {
    const totalWeight = parseFloat(document.getElementById('batch_total_weight')?.value || 0) || 0;
    const totalChickens = parseInt(document.getElementById('batch_total_chickens')?.value || 0, 10) || 0;
    const buyPrice = parseFloat(document.getElementById('batch_buy_price')?.value || 0) || 0;
    const sellPrice = parseFloat(document.getElementById('batch_sell_price')?.value || 0) || 0;

    const totalCost = totalWeight * buyPrice;
    const potentialRevenue = totalWeight * sellPrice;
    const potentialProfit = potentialRevenue - totalCost;
    const avgBirdWeight = totalChickens > 0 ? (totalWeight / totalChickens) : (totalWeight > 0 ? (totalWeight / 30) : 0);

    // Update UI labels
    const weightPreviewEl = document.getElementById('calc_batch_preview_weight');
    const avgBirdWeightEl = document.getElementById('calc_batch_avg_bird_weight');
    const totalCostEl = document.getElementById('calc_batch_total_cost');
    const profitEl = document.getElementById('calc_batch_expected_profit');

    if (weightPreviewEl) weightPreviewEl.textContent = `${totalWeight} کگم`;
    if (avgBirdWeightEl) avgBirdWeightEl.textContent = `${avgBirdWeight > 0 ? avgBirdWeight.toFixed(2) : '0.00'} کگم`;
    if (totalCostEl) totalCostEl.textContent = `${Math.round(totalCost).toLocaleString()} د.ع`;
    if (profitEl) profitEl.textContent = `${Math.round(potentialProfit).toLocaleString()} د.ع`;
  }

  saveBatch() {
    const poultryType = document.getElementById('batch_poultry_type')?.value || 'مریشکی ناسک';
    const date = document.getElementById('batch_date').value || new Date().toISOString().slice(0, 10);
    const cagesCount = parseInt(document.getElementById('batch_cages_count')?.value || 0, 10) || 0;
    const totalChickens = parseInt(document.getElementById('batch_total_chickens')?.value || 0, 10) || Math.max(1, Math.round(cagesCount * 25));
    const totalWeight = parseFloat(document.getElementById('batch_total_weight')?.value || 0);
    const buyPrice = parseFloat(document.getElementById('batch_buy_price')?.value || 0);
    const sellPrice = parseFloat(document.getElementById('batch_sell_price')?.value || 0);

    if (cagesCount <= 0) {
      window.app.showToast('تکایە ژمارەی قەفەزەکان دیاری بکە', 'warning');
      return;
    }
    if (totalWeight <= 0) {
      window.app.showToast('تکایە کۆی کێشی بارەکە دیاری بکە', 'warning');
      return;
    }
    if (buyPrice <= 0 || sellPrice <= 0) {
      window.app.showToast('تکایە نرخی کڕین و فرۆشتن داخڵ بکە', 'warning');
      return;
    }

    const avgWeightPerBird = +(totalWeight / Math.max(1, totalChickens)).toFixed(2);

    const batchData = {
      poultry_type: poultryType,
      date: date,
      cages_count: cagesCount,
      total_chickens: totalChickens,
      total_weight_kg: totalWeight,
      avg_weight_per_bird: avgWeightPerBird,
      buy_price_per_kg: buyPrice,
      sell_price_per_kg: sellPrice
    };

    const saved = window.db.saveBatch(batchData);
    window.app.playSound('success');
    window.app.showToast(`باری (${poultryType} - ${date}) بە سەرکەوتوویی تۆمارکرا`, 'success');

    // Reset Form fields
    document.getElementById('batch_cages_count').value = '3';
    document.getElementById('batch_total_chickens').value = '80';
    document.getElementById('batch_total_weight').value = '';
    this.updateBatchCalculations();
  }

  renderBatchesList() {
    const listEl = document.getElementById('batches_table_body');
    if (!listEl) return;

    const batches = window.db.getBatches();
    const activeBatch = window.db.getActiveBatch();

    if (batches.length === 0) {
      listEl.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            هیچ بارێک لە سیستەم تۆمار نەکراوە.
          </td>
        </tr>
      `;
      return;
    }

    listEl.innerHTML = batches.map(b => {
      const isActive = activeBatch && activeBatch.batch_id === b.batch_id;
      const cagesCount = b.cages_count || (b.cages_detail ? b.cages_detail.length : 1);
      const totalCost = b.total_cost || (b.total_weight_kg * b.buy_price_per_kg);
      const pType = b.poultry_type || 'مریشکی ناسک';

      let icon = '🐔';
      if (pType === 'مریشکی پیر') icon = '🐓';
      else if (pType === 'قاز') icon = '🦆';
      else if (pType === 'قەل') icon = '🦃';

      return `
        <tr style="${isActive ? 'background-color: #f0fdf4;' : ''}">
          <td>
            <strong>${b.date}</strong>
            <span class="badge badge-neutral" style="margin-right: 0.25rem;">${icon} ${pType}</span>
            ${isActive ? '<span class="badge badge-success" style="margin-right: 0.25rem;">باری کارا</span>' : ''}
          </td>
          <td><strong>${cagesCount}</strong> قەفەز</td>
          <td><strong>${b.total_weight_kg}</strong> کگم</td>
          <td>${b.buy_price_per_kg.toLocaleString()} د.ع</td>
          <td><strong style="color: var(--primary);">${b.sell_price_per_kg.toLocaleString()} د.ع</strong></td>
          <td><strong style="color: var(--danger);">${Math.round(totalCost).toLocaleString()} د.ع</strong></td>
          <td>
            <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
              ${!isActive ? `
                <button class="touch-btn" onclick="window.db.setActiveBatch('${b.batch_id}')" style="background: var(--surface-alt); padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 700;">
                  کاراکردن
                </button>
              ` : ''}
              <button class="action-mini-btn delete" title="سڕینەوە" onclick="window.batches.confirmDeleteBatch('${b.batch_id}')">
                ✕
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  confirmDeleteBatch(batchId) {
    if (confirm('ئایا دڵنیایت لە سڕینەوەی ئەم بارە؟')) {
      window.db.deleteBatch(batchId);
      window.app.showToast('بارەکە سڕایەوە', 'danger');
      window.app.playSound('delete');
    }
  }
}

window.batches = new BatchesModule();
