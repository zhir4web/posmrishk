/**
 * Sargalu Chicken POS - Ad-hoc & Monthly Expenses Module (خەرجییە کاتی و مانگانەکان)
 * Rent, Electricity, Gas, Feed, Bags, and custom operating expenses
 * Asia/Baghdad timezone, validation, XSS safety
 */

class ExpensesModule {
  constructor() {
    this.selectedCategory = 'غاز';
    this.init();
  }

  init() {
    this.bindEvents();
    this.setPreset('غاز');
    this.renderExpensesTable();

    if (window.db) {
      window.db.subscribe((event) => {
        if (['expenses_updated', 'all_data_restored', 'settings_updated'].includes(event)) {
          this.renderExpensesTable();
        }
      });
    }
  }

  bindEvents() {
    // Preset buttons
    document.querySelectorAll('.preset-card-btn[data-category]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-category');
        this.setPreset(cat);
        if (window.app) window.app.playSound('click');
      });
    });

    // Submit button (direct click)
    const submitBtn = document.getElementById('btn_submit_expense');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.submitExpense();
      });
    }

    // Submit form fallback
    const form = document.getElementById('expense_entry_form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitExpense();
      });
    }
  }

  setPreset(category) {
    this.selectedCategory = category;

    // Update active UI on preset buttons
    document.querySelectorAll('.preset-card-btn[data-category]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-category') === category);
    });

    const descInput = document.getElementById('expense_description');
    const unitTypeInput = document.getElementById('expense_unit_type');
    const qtyInput = document.getElementById('expense_qty');
    const qtyWrapper = document.getElementById('expense_qty_wrapper');
    const qtyLabel = document.getElementById('expense_qty_label');
    const totalCostInput = document.getElementById('expense_total_cost');
    const totalLabel = document.getElementById('expense_total_label');

    const settings = window.db ? window.db.getSettings() : { monthly_rent: 350000 };

    if (category === 'کرێی دوکان') {
      const rent = settings.monthly_rent || 350000;
      if (descInput) descInput.value = 'کرێی مانگانەی دوکان';
      if (qtyWrapper) qtyWrapper.style.display = 'none';
      if (unitTypeInput) unitTypeInput.value = 'مانگ';
      if (qtyInput) qtyInput.value = '1';
      if (totalCostInput) {
        totalCostInput.value = rent;
        totalCostInput.placeholder = '350000';
      }
      if (totalLabel) totalLabel.textContent = '🏢 بڕی پارەی کرێی شوێن (دینار):';
    } else if (category === 'کارەبا') {
      if (descInput) descInput.value = 'پارەی کارەبا (موەلیدە / نیشتمانی)';
      if (qtyWrapper) qtyWrapper.style.display = 'none';
      if (unitTypeInput) unitTypeInput.value = 'پسوولە';
      if (qtyInput) qtyInput.value = '1';
      if (totalCostInput) {
        totalCostInput.value = '';
        totalCostInput.placeholder = 'بڕی پارەی پسوولەی کارەبا بنووسە...';
      }
      if (totalLabel) totalLabel.textContent = '⚡ بڕی پارەی پسوولەی کارەبا (دینار):';
    } else if (category === 'غاز') {
      if (descInput) descInput.value = 'بوتڵی غازی ئاوی گەرم';
      if (qtyWrapper) qtyWrapper.style.display = 'grid';
      if (qtyLabel) qtyLabel.textContent = 'ژمارەی بوتڵ:';
      if (unitTypeInput) unitTypeInput.value = 'دانە (بوتڵ)';
      if (qtyInput) qtyInput.value = '1';
      if (totalCostInput) {
        totalCostInput.value = '8500';
        totalCostInput.placeholder = '8500';
      }
      if (totalLabel) totalLabel.textContent = '⛽ کۆی پارەی غاز (دینار):';
    } else if (category === 'عەلاگە') {
      if (descInput) descInput.value = 'عەلاگەی بەستەبەندی مریشک';
      if (qtyWrapper) qtyWrapper.style.display = 'grid';
      if (qtyLabel) qtyLabel.textContent = 'کێش (کیلۆگرام):';
      if (unitTypeInput) unitTypeInput.value = 'کیلۆگرام';
      if (qtyInput) qtyInput.value = '2';
      if (totalCostInput) {
        totalCostInput.value = '5000';
        totalCostInput.placeholder = '5000';
      }
      if (totalLabel) totalLabel.textContent = '🛍️ کۆی پارەی عەلاگە (دینار):';
    } else if (category === 'عەلەف / دانەوێڵە') {
      if (descInput) descInput.value = 'عەلەف / دانەوێڵەی مریشک';
      if (qtyWrapper) qtyWrapper.style.display = 'grid';
      if (qtyLabel) qtyLabel.textContent = 'کێش (کیلۆگرام):';
      if (unitTypeInput) unitTypeInput.value = 'کیلۆگرام';
      if (qtyInput) qtyInput.value = '10';
      if (totalCostInput) {
        totalCostInput.value = '7500';
        totalCostInput.placeholder = '7500';
      }
      if (totalLabel) totalLabel.textContent = '🌾 کۆی پارەی عەلەف (دینار):';
    } else {
      if (descInput) descInput.value = 'خەرجی گشتی';
      if (qtyWrapper) qtyWrapper.style.display = 'none';
      if (unitTypeInput) unitTypeInput.value = 'پارە';
      if (qtyInput) qtyInput.value = '1';
      if (totalCostInput) {
        totalCostInput.value = '';
        totalCostInput.placeholder = 'بڕی پارەی خەرجی بنووسە';
      }
      if (totalLabel) totalLabel.textContent = '💼 بڕی پارەی خەرجی (دینار):';
    }
  }

  submitExpense() {
    try {
      const descInput = document.getElementById('expense_description');
      const unitTypeInput = document.getElementById('expense_unit_type');
      const qtyInput = document.getElementById('expense_qty');
      const totalCostInput = document.getElementById('expense_total_cost');

      let desc = descInput ? descInput.value.trim() : '';
      if (!desc) desc = this.selectedCategory || 'خەرجی گشتی';

      let unitType = unitTypeInput ? unitTypeInput.value.trim() : 'بڕی پارە';
      let qty = qtyInput ? parseFloat(qtyInput.value) : 1;
      let totalCost = totalCostInput ? parseFloat(totalCostInput.value) : 0;

      if (isNaN(totalCost) || totalCost <= 0) {
        if (window.app) window.app.showToast('تکایە بڕی پارەی خەرجی بە دینار بنووسە', 'warning');
        if (totalCostInput) totalCostInput.focus();
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        if (window.app) window.app.showToast('تکایە بڕی خەرجی بە درووستی بنووسە', 'warning');
        return;
      }

      const expenseData = {
        category: this.selectedCategory || 'خەرجی تر',
        description: desc,
        unit_type: unitType || 'بڕی پارە',
        quantity: qty,
        unit_price: Math.round(totalCost / qty),
        total_cost: totalCost
      };

      if (window.db) {
        window.db.saveExpense(expenseData);
      }

      if (window.app) {
        window.app.playSound('cash');
        window.app.showToast(`خەرجی (${expenseData.description} - ${totalCost.toLocaleString()} د.ع) تۆمارکرا`, 'success');
      }

      // Reset form to preset
      this.setPreset(this.selectedCategory);
    } catch (err) {
      console.error('Error submitting expense:', err);
      if (window.app) window.app.showToast(err.message || 'کێشەیەک ڕوویدا لە تۆمارکردن', 'danger');
    }
  }

  renderExpensesTable() {
    const tbody = document.getElementById('expenses_table_body');
    const todayTotalBadge = document.getElementById('expenses_today_total');
    if (!tbody || !window.db) return;

    const todayStr = getBaghdadDate();
    const todayExpenses = window.db.getExpensesByDate(todayStr);
    const allExpenses = window.db.getExpenses();

    const todayTotal = todayExpenses.reduce((sum, e) => sum + (Number(e.total_cost) || 0), 0);

    if (todayTotalBadge) {
      todayTotalBadge.textContent = `${todayTotal.toLocaleString()} د.ع`;
    }

    if (allExpenses.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <div class="empty-icon">💸</div>
            <div class="empty-title">هیچ خەرجییەک تۆمار نەکراوە</div>
            <div class="empty-sub">لەسەرەوە جۆری خەرجی دیاریبکە و تۆماری بکە</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = allExpenses.slice(0, 50).map(exp => {
      let icon = '💸';
      if (exp.category === 'کرێی دوکان') icon = '🏢';
      else if (exp.category === 'کارەبا') icon = '⚡';
      else if (exp.category === 'غاز') icon = '⛽';
      else if (exp.category === 'عەلاگە') icon = '🛍️';
      else if (exp.category === 'عەلەف / دانەوێڵە') icon = '🌾';

      const isMonthly = exp.category === 'کرێی دوکان' || exp.category === 'کارەبا';
      const badgeClass = isMonthly ? 'badge-primary' : 'badge-warning';

      const dateStr = getBaghdadDate(exp.timestamp);
      const timeStr = getBaghdadTime(exp.timestamp);
      const isToday = dateStr === todayStr;

      return `
        <tr>
          <td>
            <span class="badge ${badgeClass}">${icon} ${escapeHtml(exp.category)}</span>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
              ${isToday ? 'ئەمڕۆ ' : dateStr + ' '}${timeStr}
            </div>
          </td>
          <td><strong>${escapeHtml(exp.description)}</strong></td>
          <td>${exp.quantity} ${escapeHtml(exp.unit_type || '')}</td>
          <td>${exp.unit_price ? Number(exp.unit_price).toLocaleString() + ' د.ع' : '-'}</td>
          <td><strong style="color: var(--danger); font-size: 1.05rem;">${Number(exp.total_cost).toLocaleString()} د.ع</strong></td>
          <td>
            <button type="button" class="btn-delete" onclick="window.expenses.deleteExpense('${escapeHtml(exp.expense_id)}')" title="سڕینەوە">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  deleteExpense(id) {
    if (confirm('ئایا دڵنیایت لە سڕینەوەی ئەم خەرجییە؟')) {
      if (window.db) window.db.deleteExpense(id);
      if (window.app) {
        window.app.playSound('delete');
        window.app.showToast('خەرجی سڕایەوە', 'info');
      }
    }
  }
}

// Global instance
window.expenses = new ExpensesModule();
