/**
 * Sargalu Chicken POS - Dead Loss & Mortality Module (مرداربوونەوە و لەدەستچوون)
 * Stock deduction, loss financial cost calculation, reason tracking, Baghdad timezone, XSS safety
 * Event Delegation (No Inline onclick handlers)
 */

class LossesModule {
  constructor() {
    this.init();
  }

  init() {
    this.bindEvents();
    this.renderLossesList();
    this.updateEstimatedValues();

    if (window.db) {
      window.db.subscribe((event) => {
        if (['losses_updated', 'batches_updated', 'active_batch_changed', 'all_data_restored'].includes(event)) {
          this.renderLossesList();
          this.updateEstimatedValues();
        }
      });
    }
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
          if (window.app) window.app.playSound('click');
        }
      });
    }

    if (plusBtn && countInput) {
      plusBtn.addEventListener('click', () => {
        let cur = parseInt(countInput.value, 10) || 0;
        countInput.value = cur + 1;
        this.updateEstimatedValues();
        if (window.app) window.app.playSound('click');
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

    // Event delegation for deleting losses (Eliminating inline onclick)
    const tableBody = document.getElementById('losses_table_body');
    if (tableBody) {
      tableBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.btn-delete-loss');
        if (deleteBtn) {
          const lossId = deleteBtn.getAttribute('data-id');
          if (isSafeRecordId(lossId)) {
            this.confirmDeleteLoss(lossId);
          }
        }
      });
    }
  }

  updateEstimatedValues(isCustomWeight = false) {
    const countInput = document.getElementById('loss_dead_count');
    const count = parseInt(countInput ? countInput.value : 1, 10) || 0;

    const activeBatch = window.db ? window.db.getActiveBatch() : null;
    const settings = window.db ? window.db.getSettings() : { default_buy_price_per_kg: 2250 };

    const avgWeight = activeBatch && activeBatch.average_weight_per_chicken > 0
      ? activeBatch.average_weight_per_chicken
      : (activeBatch && activeBatch.avg_weight_per_bird > 0 ? activeBatch.avg_weight_per_bird : 1.9);

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
      if (window.app) window.app.showToast('تکایە ژمارەی مریشکی مرداربوو دیاری بکە', 'warning');
      return;
    }

    let reason = reasonSelect ? reasonSelect.value : 'مرداربوونەوە لە قەفەز';
    if (reasonNote && reasonNote.value.trim()) {
      reason += ` (${reasonNote.value.trim()})`;
    }

    const activeBatch = window.db ? window.db.getActiveBatch() : null;

    const lossData = {
      batch_id: activeBatch ? activeBatch.batch_id : null,
      chickens_count: count,
      estimated_weight_kg: customWeight,
      reason: reason
    };

    try {
      const saved = window.db.saveLoss(lossData);
      if (window.app) {
        window.app.playSound('warning');
        window.app.showToast(`تۆماری زیانی ${count} مریشک لە مەخزەن کەمکرایەوە`, 'danger');
      }

      // Reset Form
      document.getElementById('loss_dead_count').value = '1';
      document.getElementById('loss_custom_weight').value = '';
      if (reasonNote) reasonNote.value = '';
      this.updateEstimatedValues();
    } catch (err) {
      console.error('Loss submit error:', err);
      if (window.app) {
        window.app.playSound('warning');
        window.app.showToast(err.message || 'هەڵەیەک ڕوویدا لە تۆمارکردنی زیان', 'danger');
      }
    }
  }

  renderLossesList() {
    const listEl = document.getElementById('losses_table_body');
    const totalTodayEl = document.getElementById('losses_today_total_count');
    const totalCostEl = document.getElementById('losses_today_total_cost');
    if (!listEl || !window.db) return;

    const todayStr = getBaghdadDate();
    const losses = window.db.getLossesByDate(todayStr);

    const totalCount = losses.reduce((sum, l) => sum + (Number(l.chickens_count) || 0), 0);
    const totalCost = losses.reduce((sum, l) => sum + (Number(l.loss_financial_cost) || 0), 0);

    if (totalTodayEl) totalTodayEl.textContent = `${totalCount} دانە`;
    if (totalCostEl) totalCostEl.textContent = `${totalCost.toLocaleString()} د.ع`;

    if (losses.length === 0) {
      listEl.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <div class="empty-icon">🍗</div>
            <div class="empty-title">هیچ زیانێکی مرداربوونەوە بۆ ئەمڕۆ تۆمار نەکراوە</div>
            <div class="empty-sub">ئەگەر لە قەفەزدا مرداربوونەوە هەبوو، لە دەستە چەپ تۆماری بکە</div>
          </td>
        </tr>
      `;
      return;
    }

    listEl.innerHTML = losses.map(l => {
      const time = getBaghdadTime(l.timestamp);
      return `
        <tr>
          <td>
            <strong>${time}</strong>
          </td>
          <td><strong>${l.chickens_count}</strong> دانە</td>
          <td>${l.estimated_weight_kg} کگم</td>
          <td><strong style="color: var(--danger); font-size: 1.05rem;">${Number(l.loss_financial_cost).toLocaleString()} د.ع</strong></td>
          <td><span class="badge badge-danger">${escapeHtml(l.reason)}</span></td>
          <td>
            <button type="button" class="btn-delete btn-delete-loss" data-id="${escapeHtml(l.loss_id)}" title="سڕینەوە">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  confirmDeleteLoss(lossId) {
    if (!isSafeRecordId(lossId)) return;
    if (confirm('ئایا دڵنیایت لە سڕینەوەی ئەم تۆماری زیانە؟')) {
      try {
        window.db.deleteLoss(lossId);
        if (window.app) {
          window.app.playSound('delete');
          window.app.showToast('زیانەکە سڕایەوە', 'info');
        }
      } catch (err) {
        if (window.app) {
          window.app.showToast(err.message || 'هەڵە لە سڕینەوەی زیان', 'warning');
        }
      }
    }
  }
}

// Global instance
window.losses = new LossesModule();
