/**
 * Sargalu Chicken POS - Dead Loss & Mortality Module (مرداربوونەوە و لەدەستچوون)
 * Stock deduction, loss financial cost calculation, reason tracking
 */

class LossesModule {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
    this.renderLossesList();
    this.updateEstimatedValues();

    window.db.subscribe((event) => {
      if (['losses_updated', 'batches_updated', 'active_batch_changed'].includes(event)) {
        this.renderLossesList();
        this.updateEstimatedValues();
      }
    });
  }

  bindEvents() {
    // Dead Count Input & Steppers
    const countInput = document.getElementById('loss_dead_count');
    const minusBtn = document.getElementById('loss_stepper_minus');
    const plusBtn = document.getElementById('loss_stepper_plus');

    if (countInput) {
      countInput.addEventListener('input', () => {
        this.updateEstimatedValues();
      });
    }

    if (minusBtn && countInput) {
      minusBtn.addEventListener('click', () => {
        let cur = parseInt(countInput.value, 10) || 1;
        if (cur > 1) {
          countInput.value = cur - 1;
          this.updateEstimatedValues();
          window.app.playSound('click');
        }
      });
    }

    if (plusBtn && countInput) {
      plusBtn.addEventListener('click', () => {
        let cur = parseInt(countInput.value, 10) || 0;
        countInput.value = cur + 1;
        this.updateEstimatedValues();
        window.app.playSound('click');
      });
    }

    // Custom weight toggle
    const customWeightInput = document.getElementById('loss_custom_weight');
    if (customWeightInput) {
      customWeightInput.addEventListener('input', () => {
        this.updateEstimatedValues(true);
      });
    }

    // Submit form
    const form = document.getElementById('loss_entry_form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitLoss();
      });
    }
  }

  updateEstimatedValues(isCustomWeight = false) {
    const countInput = document.getElementById('loss_dead_count');
    const count = parseInt(countInput ? countInput.value : 1, 10) || 0;

    const activeBatch = window.db.getActiveBatch();
    const settings = window.db.getSettings();

    const avgWeight = activeBatch && activeBatch.average_weight_per_chicken > 0 
      ? activeBatch.average_weight_per_chicken 
      : 1.9;

    const buyPrice = activeBatch ? activeBatch.buy_price_per_kg : settings.default_buy_price_per_kg;

    const customWeightInput = document.getElementById('loss_custom_weight');
    let totalWeight = 0;

    if (isCustomWeight && customWeightInput && customWeightInput.value) {
      totalWeight = parseFloat(customWeightInput.value) || 0;
    } else {
      totalWeight = +(count * avgWeight).toFixed(2);
      if (customWeightInput && !customWeightInput.matches(':focus')) {
        customWeightInput.value = totalWeight > 0 ? totalWeight : '';
      }
    }

    const lossCost = Math.round(totalWeight * buyPrice);

    // Update UI
    const calcWeightEl = document.getElementById('calc_loss_weight');
    const calcCostEl = document.getElementById('calc_loss_financial_cost');
    const calcAvgWeightEl = document.getElementById('calc_loss_batch_avg');

    if (calcWeightEl) calcWeightEl.textContent = `${totalWeight} کگم`;
    if (calcCostEl) calcCostEl.textContent = `${lossCost.toLocaleString()} د.ع`;
    if (calcAvgWeightEl) calcAvgWeightEl.textContent = `${avgWeight.toFixed(2)} کگم`;
  }

  submitLoss() {
    const count = parseInt(document.getElementById('loss_dead_count').value, 10) || 0;
    const customWeight = parseFloat(document.getElementById('loss_custom_weight').value) || 0;
    const reasonSelect = document.getElementById('loss_reason_select');
    const reasonNote = document.getElementById('loss_reason_note');

    if (count <= 0) {
      window.app.showToast('تکایە ژمارەی مریشکی مرداربوو دیاری بکە', 'warning');
      return;
    }

    let reason = reasonSelect ? reasonSelect.value : 'مرداربوونەوە لە قەفەز';
    if (reasonNote && reasonNote.value.trim()) {
      reason += ` (${reasonNote.value.trim()})`;
    }

    const lossData = {
      chickens_count: count,
      estimated_weight_kg: customWeight,
      reason: reason
    };

    const saved = window.db.saveLoss(lossData);
    window.app.playSound('warning');
    window.app.showToast(`تۆماری زیانی ${count} مریشک لە کۆگا کەمکرایەوە`, 'danger');

    // Reset Form
    document.getElementById('loss_dead_count').value = '1';
    document.getElementById('loss_custom_weight').value = '';
    if (reasonNote) reasonNote.value = '';
    this.updateEstimatedValues();
  }

  renderLossesList() {
    const listEl = document.getElementById('losses_table_body');
    const totalTodayEl = document.getElementById('losses_today_total_count');
    const totalCostEl = document.getElementById('losses_today_total_cost');
    if (!listEl) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const losses = window.db.getLossesByDate(todayStr);

    const sumCount = losses.reduce((sum, l) => sum + l.chickens_count, 0);
    const sumCost = losses.reduce((sum, l) => sum + l.loss_financial_cost, 0);

    if (totalTodayEl) totalTodayEl.textContent = `${sumCount} دانە`;
    if (totalCostEl) totalCostEl.textContent = `${sumCost.toLocaleString()} د.ع`;

    if (losses.length === 0) {
      listEl.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            هیچ مریشکێکی مرداربوو بۆ ئەمڕۆ تۆمار نەکراوە.
          </td>
        </tr>
      `;
      return;
    }

    listEl.innerHTML = losses.map(l => {
      const time = new Date(l.timestamp).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
      return `
        <tr>
          <td><span class="badge badge-danger">${time}</span></td>
          <td><strong style="color: var(--danger); font-size: 1.05rem;">${l.chickens_count}</strong> دانە</td>
          <td><strong>${l.estimated_weight_kg}</strong> کگم</td>
          <td><strong style="color: var(--danger);">${l.loss_financial_cost.toLocaleString()} د.ع</strong></td>
          <td><span style="font-size: 0.85rem; color: var(--text-main);">${l.reason}</span></td>
          <td>
            <button class="action-mini-btn delete" title="سڕینەوە" onclick="window.losses.confirmDeleteLoss('${l.loss_id}')">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  confirmDeleteLoss(lossId) {
    if (confirm('ئایا دڵنیایت لە سڕینەوەی ئەم تۆمارەی مرداربوونەوە؟ ڕەسیدی مەخزەن چاک دەکرێتەوە.')) {
      window.db.deleteLoss(lossId);
      window.app.showToast('تۆمارەکە سڕایەوە', 'info');
      window.app.playSound('delete');
    }
  }
}

window.losses = new LossesModule();
