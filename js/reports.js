/**
 * Sargalu Chicken POS - Financial Reports & Net Profit Calculator (ڕاپۆرتی دارایی ڕۆژانە و مانگانە)
 * Stock Reconciliation, Revenue Breakdown, Operating Costs, Net Profit & Z-Report
 * Asia/Baghdad timezone, cross-day stock accounting, XSS safety
 */

class ReportsModule {
  constructor() {
    this.currentMode = 'daily'; // 'daily' or 'monthly'
    this.currentDate = getBaghdadDate();
    this.currentMonth = getBaghdadMonth();
    this.init();
  }

  init() {
    this.bindEvents();
    this.renderReport();

    if (window.db) {
      window.db.subscribe((event) => {
        if (['sales_updated', 'losses_updated', 'expenses_updated', 'batches_updated', 'all_data_restored', 'settings_updated'].includes(event)) {
          this.renderReport();
        }
      });
    }
  }

  bindEvents() {
    // Mode Switcher (Daily vs Monthly)
    const dailyBtn = document.getElementById('btn_view_daily');
    const monthlyBtn = document.getElementById('btn_view_monthly');
    const dailyControls = document.getElementById('report_daily_controls');
    const monthlyControls = document.getElementById('report_monthly_controls');

    if (dailyBtn && monthlyBtn) {
      dailyBtn.addEventListener('click', () => {
        this.currentMode = 'daily';
        dailyBtn.classList.add('active');
        monthlyBtn.classList.remove('active');
        if (dailyControls) dailyControls.style.display = 'flex';
        if (monthlyControls) monthlyControls.style.display = 'none';
        this.renderReport();
        if (window.app) window.app.playSound('tab');
      });

      monthlyBtn.addEventListener('click', () => {
        this.currentMode = 'monthly';
        monthlyBtn.classList.add('active');
        dailyBtn.classList.remove('active');
        if (dailyControls) dailyControls.style.display = 'none';
        if (monthlyControls) monthlyControls.style.display = 'flex';
        this.renderReport();
        if (window.app) window.app.playSound('tab');
      });
    }

    // Daily Date Picker
    const dateInput = document.getElementById('report_date_picker');
    if (dateInput) {
      dateInput.value = this.currentDate;
      dateInput.addEventListener('change', (e) => {
        this.currentDate = getBaghdadDate(e.target.value);
        this.renderReport();
        if (window.app) window.app.playSound('click');
      });
    }

    // Monthly Picker
    const monthInput = document.getElementById('report_month_picker');
    if (monthInput) {
      monthInput.value = this.currentMonth;
      monthInput.addEventListener('change', (e) => {
        this.currentMonth = (e.target.value || getBaghdadMonth()).slice(0, 7);
        this.renderReport();
        if (window.app) window.app.playSound('click');
      });
    }

    // Previous / Next Date Buttons
    const prevBtn = document.getElementById('report_prev_date');
    const nextBtn = document.getElementById('report_next_date');
    const todayBtn = document.getElementById('report_today_btn');
    const thisMonthBtn = document.getElementById('report_this_month_btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const [y, m, d] = (this.currentDate || getBaghdadDate()).split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d));
        dateObj.setUTCDate(dateObj.getUTCDate() - 1);
        this.currentDate = dateObj.toISOString().slice(0, 10);
        if (dateInput) dateInput.value = this.currentDate;
        this.renderReport();
        if (window.app) window.app.playSound('click');
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const [y, m, d] = (this.currentDate || getBaghdadDate()).split('-').map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d));
        dateObj.setUTCDate(dateObj.getUTCDate() + 1);
        this.currentDate = dateObj.toISOString().slice(0, 10);
        if (dateInput) dateInput.value = this.currentDate;
        this.renderReport();
        if (window.app) window.app.playSound('click');
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        this.currentDate = getBaghdadDate();
        if (dateInput) dateInput.value = this.currentDate;
        this.renderReport();
        if (window.app) window.app.playSound('click');
      });
    }

    if (thisMonthBtn) {
      thisMonthBtn.addEventListener('click', () => {
        this.currentMonth = getBaghdadMonth();
        if (monthInput) monthInput.value = this.currentMonth;
        this.renderReport();
        if (window.app) window.app.playSound('click');
      });
    }

    // Print Z-Report Button
    const printZReportBtn = document.getElementById('btn_print_z_report');
    if (printZReportBtn) {
      printZReportBtn.addEventListener('click', () => {
        this.openZReportPrint();
      });
    }

    // Export CSV Button
    const exportCsvBtn = document.getElementById('btn_export_csv');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        this.exportCsv();
      });
    }
  }

  renderReport() {
    if (!window.db) return;
    if (this.currentMode === 'monthly') {
      this.renderMonthlyReport();
    } else {
      this.renderDailyReport();
    }
  }

  renderDailyReport() {
    const report = window.db.getDailyReport(this.currentDate);

    // Hero title & formula
    const heroTitle = document.getElementById('report_hero_title');
    const heroFormula = document.getElementById('report_hero_formula');
    if (heroTitle) heroTitle.textContent = `قازانجی سافی تەواوی ئەمڕۆ (${report.date}):`;
    if (heroFormula) heroFormula.textContent = 'هاوکێشە = کۆی داهات − (تێچووی کڕینی مریشکی فرۆشراو + خەرجییە کاتییەکان + زیانی مرداربوونەوە)';

    // Hero Values
    const netProfitEl = document.getElementById('report_hero_net_profit');
    const netProfitStatusEl = document.getElementById('report_hero_profit_status');
    const grossRevEl = document.getElementById('report_hero_gross_rev');
    const totalCostEl = document.getElementById('report_hero_total_cost');

    if (netProfitEl) {
      netProfitEl.textContent = `${report.profit.net_profit.toLocaleString()} د.ع`;
      netProfitEl.className = `profit-big-val ${report.profit.is_profitable ? 'positive' : 'negative'}`;
    }

    if (netProfitStatusEl) {
      if (report.profit.net_profit > 0) {
        netProfitStatusEl.innerHTML = `<span class="badge badge-success" style="font-size: 0.9rem; padding: 0.35rem 0.8rem;">قازانجی ساف (بەسوود)</span>`;
      } else if (report.profit.net_profit < 0) {
        netProfitStatusEl.innerHTML = `<span class="badge badge-danger" style="font-size: 0.9rem; padding: 0.35rem 0.8rem;">زیان</span>`;
      } else {
        netProfitStatusEl.innerHTML = `<span class="badge badge-neutral" style="font-size: 0.9rem; padding: 0.35rem 0.8rem;">هاوسەنگ</span>`;
      }
    }

    if (grossRevEl) grossRevEl.textContent = `${report.income.total_gross_revenue.toLocaleString()} د.ع`;
    if (totalCostEl) totalCostEl.textContent = `${report.expenses.total_costs.toLocaleString()} د.ع`;

    // Stock Status
    const lblReceivedCages = document.getElementById('lbl_rep_received_cages');
    const lblReceivedWeight = document.getElementById('lbl_rep_received_weight');
    if (lblReceivedCages) lblReceivedCages.textContent = 'قەفەزی هاتووی ئەمڕۆ:';
    if (lblReceivedWeight) lblReceivedWeight.textContent = 'کۆی کێشی باری گەیشتوو:';

    const stockReceivedCount = document.getElementById('rep_stock_received_count');
    const stockReceivedWeight = document.getElementById('rep_stock_received_weight');
    const stockSoldCount = document.getElementById('rep_stock_sold_count');
    const stockSoldWeight = document.getElementById('rep_stock_sold_weight');
    const stockDeadCount = document.getElementById('rep_stock_dead_count');
    const stockRemainWeight = document.getElementById('rep_stock_remain_weight');

    if (stockReceivedCount) stockReceivedCount.textContent = `${report.stock.received_cages || report.stock.received_count} قەفەز`;
    if (stockReceivedWeight) stockReceivedWeight.textContent = `${report.stock.received_weight} کگم`;
    if (stockSoldCount) stockSoldCount.textContent = `${report.stock.sold_count} دانە`;
    if (stockSoldWeight) stockSoldWeight.textContent = `${report.stock.sold_weight} کگم`;
    if (stockDeadCount) stockDeadCount.textContent = `${report.stock.dead_count} دانە`;
    
    if (stockRemainWeight) {
      const isShortfall = report.stock.remaining_weight < 0;
      stockRemainWeight.textContent = `${report.stock.remaining_weight} کگم`;
      stockRemainWeight.style.color = isShortfall ? 'var(--danger)' : 'var(--primary)';
    }

    // Income Card
    const incMeat = document.getElementById('rep_inc_meat');
    const incClean = document.getElementById('rep_inc_clean');
    const incCleanedChickens = document.getElementById('rep_inc_cleaned_count');
    const incTransactions = document.getElementById('rep_inc_trans_count');
    const incTotal = document.getElementById('rep_inc_total');

    if (incMeat) incMeat.textContent = `${report.income.meat_revenue.toLocaleString()} د.ع`;
    if (incClean) incClean.textContent = `${report.income.cleaning_revenue.toLocaleString()} د.ع`;
    if (incCleanedChickens) incCleanedChickens.textContent = `${report.income.cleaned_chickens_count} دانە`;
    if (incTransactions) incTransactions.textContent = `${report.income.transactions_count} وەسڵ`;
    if (incTotal) incTotal.textContent = `${report.income.total_gross_revenue.toLocaleString()} د.ع`;

    // Expenses Card (Hide monthly rent/elec in daily view)
    const rowRent = document.getElementById('row_rep_exp_rent');
    const rowElec = document.getElementById('row_rep_exp_elec');
    if (rowRent) rowRent.style.display = 'none';
    if (rowElec) rowElec.style.display = 'none';

    const lblAdhoc = document.getElementById('lbl_rep_exp_adhoc');
    if (lblAdhoc) lblAdhoc.textContent = 'خەرجییە کاتییەکان (غاز، عەلاگە، عەلەف):';

    const expCogs = document.getElementById('rep_exp_cogs');
    const expAdhoc = document.getElementById('rep_exp_adhoc');
    const expDead = document.getElementById('rep_exp_dead');
    const expTotal = document.getElementById('rep_exp_total');

    if (expCogs) expCogs.textContent = `${report.expenses.cost_of_sold_goods.toLocaleString()} د.ع`;
    if (expAdhoc) expAdhoc.textContent = `${report.expenses.adhoc_expenses.toLocaleString()} د.ع`;
    if (expDead) expDead.textContent = `${report.expenses.dead_loss_cost.toLocaleString()} د.ع`;
    if (expTotal) expTotal.textContent = `${report.expenses.total_costs.toLocaleString()} د.ع`;

    // Margins
    const marginMeat = document.getElementById('rep_margin_meat');
    if (marginMeat) marginMeat.textContent = `${report.profit.meat_profit.toLocaleString()} د.ع`;
  }

  renderMonthlyReport() {
    const report = window.db.getMonthlyReport(this.currentMonth);

    // Hero title & formula
    const heroTitle = document.getElementById('report_hero_title');
    const heroFormula = document.getElementById('report_hero_formula');
    if (heroTitle) heroTitle.textContent = `قازانجی سافی تەواوی مانگی (${report.month}):`;
    if (heroFormula) heroFormula.textContent = 'هاوکێشەی مانگانە = کۆی داهات − (تێچووی مریشک + خەرجییەکان + کرێی شوێن + پارەی کارەبا + زیانی مرداربوونەوە)';

    // Hero Values
    const netProfitEl = document.getElementById('report_hero_net_profit');
    const netProfitStatusEl = document.getElementById('report_hero_profit_status');
    const grossRevEl = document.getElementById('report_hero_gross_rev');
    const totalCostEl = document.getElementById('report_hero_total_cost');

    if (netProfitEl) {
      netProfitEl.textContent = `${report.profit.net_profit.toLocaleString()} د.ع`;
      netProfitEl.className = `profit-big-val ${report.profit.is_profitable ? 'positive' : 'negative'}`;
    }

    if (netProfitStatusEl) {
      if (report.profit.net_profit > 0) {
        netProfitStatusEl.innerHTML = `<span class="badge badge-success" style="font-size: 0.9rem; padding: 0.35rem 0.8rem;">قازانجی سافی مانگانە (بەسوود)</span>`;
      } else if (report.profit.net_profit < 0) {
        netProfitStatusEl.innerHTML = `<span class="badge badge-danger" style="font-size: 0.9rem; padding: 0.35rem 0.8rem;">زیانی مانگانە</span>`;
      } else {
        netProfitStatusEl.innerHTML = `<span class="badge badge-neutral" style="font-size: 0.9rem; padding: 0.35rem 0.8rem;">هاوسەنگ</span>`;
      }
    }

    if (grossRevEl) grossRevEl.textContent = `${report.income.total_gross_revenue.toLocaleString()} د.ع`;
    if (totalCostEl) totalCostEl.textContent = `${report.expenses.total_costs.toLocaleString()} د.ع`;

    // Stock Status
    const lblReceivedCages = document.getElementById('lbl_rep_received_cages');
    const lblReceivedWeight = document.getElementById('lbl_rep_received_weight');
    if (lblReceivedCages) lblReceivedCages.textContent = 'کۆی قەفەزی هاتوو لە مانگەکەدا:';
    if (lblReceivedWeight) lblReceivedWeight.textContent = 'کۆی کێشی باری مانگەکە:';

    const stockReceivedCount = document.getElementById('rep_stock_received_count');
    const stockReceivedWeight = document.getElementById('rep_stock_received_weight');
    const stockSoldCount = document.getElementById('rep_stock_sold_count');
    const stockSoldWeight = document.getElementById('rep_stock_sold_weight');
    const stockDeadCount = document.getElementById('rep_stock_dead_count');
    const stockRemainWeight = document.getElementById('rep_stock_remain_weight');

    if (stockReceivedCount) stockReceivedCount.textContent = `${report.stock.received_cages} قەفەز`;
    if (stockReceivedWeight) stockReceivedWeight.textContent = `${report.stock.received_weight} کگم`;
    if (stockSoldCount) stockSoldCount.textContent = `${report.stock.sold_count} دانە`;
    if (stockSoldWeight) stockSoldWeight.textContent = `${report.stock.sold_weight} کگم`;
    if (stockDeadCount) stockDeadCount.textContent = `${report.stock.dead_count} دانە`;
    
    if (stockRemainWeight) {
      const isShortfall = report.stock.remaining_weight < 0;
      stockRemainWeight.textContent = `${report.stock.remaining_weight} کگم`;
      stockRemainWeight.style.color = isShortfall ? 'var(--danger)' : 'var(--primary)';
    }

    // Income Card
    const incMeat = document.getElementById('rep_inc_meat');
    const incClean = document.getElementById('rep_inc_clean');
    const incCleanedChickens = document.getElementById('rep_inc_cleaned_count');
    const incTransactions = document.getElementById('rep_inc_trans_count');
    const incTotal = document.getElementById('rep_inc_total');

    if (incMeat) incMeat.textContent = `${report.income.meat_revenue.toLocaleString()} د.ع`;
    if (incClean) incClean.textContent = `${report.income.cleaning_revenue.toLocaleString()} د.ع`;
    if (incCleanedChickens) incCleanedChickens.textContent = `${report.income.cleaned_chickens_count} دانە`;
    if (incTransactions) incTransactions.textContent = `${report.income.transactions_count} وەسڵ`;
    if (incTotal) incTotal.textContent = `${report.income.total_gross_revenue.toLocaleString()} د.ع`;

    // Expenses Card (Show monthly rent & elec breakdown)
    const rowRent = document.getElementById('row_rep_exp_rent');
    const rowElec = document.getElementById('row_rep_exp_elec');
    const repRent = document.getElementById('rep_exp_rent');
    const repElec = document.getElementById('rep_exp_elec');
    if (rowRent) rowRent.style.display = 'flex';
    if (rowElec) rowElec.style.display = 'flex';
    if (repRent) repRent.textContent = `${report.expenses.rent_paid.toLocaleString()} د.ع`;
    if (repElec) repElec.textContent = `${report.expenses.electricity_paid.toLocaleString()} د.ع`;

    const lblAdhoc = document.getElementById('lbl_rep_exp_adhoc');
    if (lblAdhoc) lblAdhoc.textContent = 'خەرجییەکانی تر (غاز، عەلاگە، عەلەف):';

    const expCogs = document.getElementById('rep_exp_cogs');
    const expAdhoc = document.getElementById('rep_exp_adhoc');
    const expDead = document.getElementById('rep_exp_dead');
    const expTotal = document.getElementById('rep_exp_total');

    if (expCogs) expCogs.textContent = `${report.expenses.cost_of_sold_goods.toLocaleString()} د.ع`;
    if (expAdhoc) expAdhoc.textContent = `${report.expenses.other_expenses.toLocaleString()} د.ع`;
    if (expDead) expDead.textContent = `${report.expenses.dead_loss_cost.toLocaleString()} د.ع`;
    if (expTotal) expTotal.textContent = `${report.expenses.total_costs.toLocaleString()} د.ع`;

    // Margins
    const marginMeat = document.getElementById('rep_margin_meat');
    if (marginMeat) marginMeat.textContent = `${report.profit.meat_profit.toLocaleString()} د.ع`;
  }

  openZReportPrint() {
    const isMonthly = this.currentMode === 'monthly';
    const report = isMonthly ? window.db.getMonthlyReport(this.currentMonth) : window.db.getDailyReport(this.currentDate);
    const settings = window.db.getSettings();

    const titleStr = isMonthly ? `ڕاپۆرتی دارایی تەواوی مانگ (${report.month})` : `ڕاپۆرتی دارایی ڕۆژانە (${report.date})`;
    const currentTimeStr = `${getBaghdadDate()} ${getBaghdadTime()}`;

    const zReportHtml = `
      <div class="receipt-paper print-area" id="printable_z_report">
        <div class="receipt-header">
          <div class="shop-title">${escapeHtml(settings.receipt_header || settings.store_name)}</div>
          <div style="font-weight: 800; font-size: 1rem; margin-top: 4px;">${escapeHtml(titleStr)}</div>
          <div class="shop-meta">بەروار: ${escapeHtml(isMonthly ? report.month : report.date)}</div>
        </div>

        <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 4px; border-bottom: 1px dashed #999;">١. دۆخی مەخزەن و مریشک</div>
        <div class="receipt-info-row">
          <span>باری هاتوو:</span>
          <span><strong>${report.stock.received_cages || report.stock.received_count}</strong> قەفەز (${report.stock.received_weight} کگم)</span>
        </div>
        <div class="receipt-info-row">
          <span>مریشکی فرۆشراو:</span>
          <span><strong>${report.stock.sold_count}</strong> دانە (${report.stock.sold_weight} کگم)</span>
        </div>
        <div class="receipt-info-row">
          <span>مریشکی مرداربوو:</span>
          <span><strong>${report.stock.dead_count}</strong> دانە (${report.stock.dead_weight} کگم)</span>
        </div>
        <div class="receipt-info-row" style="color: ${report.stock.remaining_weight < 0 ? '#b91c1c' : 'var(--primary)'}; font-weight: 800;">
          <span>کێشی ماوە لە مەخزەن:</span>
          <span><strong>${report.stock.remaining_weight}</strong> کگم</span>
        </div>

        <div style="font-weight: 800; font-size: 0.9rem; margin: 8px 0 4px; border-bottom: 1px dashed #999;">٢. داهاتی گشتی (${report.income.transactions_count} فرۆشتن)</div>
        <div class="receipt-info-row">
          <span>فرۆشتنی گۆشت:</span>
          <span>${report.income.meat_revenue.toLocaleString()} د.ع</span>
        </div>
        <div class="receipt-info-row">
          <span>کرێی پاککردنی گۆشت:</span>
          <span>${(report.income.store_cleaning_revenue || 0).toLocaleString()} د.ع</span>
        </div>
        ${(report.income.service_only_revenue > 0) ? `
        <div class="receipt-info-row" style="color: #b45309; font-weight: 700;">
          <span>✂️ پاککردنی پەلەوەری کڕیار (${report.income.service_only_count || 0} دانە):</span>
          <span>${report.income.service_only_revenue.toLocaleString()} د.ع</span>
        </div>` : ''}
        <div class="receipt-info-row" style="font-weight: 800;">
          <span>کۆی گشتی داهات:</span>
          <span>${report.income.total_gross_revenue.toLocaleString()} د.ع</span>
        </div>

        <div style="font-weight: 800; font-size: 0.9rem; margin: 8px 0 4px; border-bottom: 1px dashed #999;">٣. تێچوو، خەرجی و زیانەکان</div>
        <div class="receipt-info-row">
          <span>تێچووی کڕینی مریشک:</span>
          <span>${report.expenses.cost_of_sold_goods.toLocaleString()} د.ع</span>
        </div>
        ${isMonthly && report.expenses.rent_paid > 0 ? `
        <div class="receipt-info-row">
          <span>🏢 کرێی شوێن / دوکان:</span>
          <span>${report.expenses.rent_paid.toLocaleString()} د.ع</span>
        </div>` : ''}
        ${isMonthly && report.expenses.electricity_paid > 0 ? `
        <div class="receipt-info-row">
          <span>⚡ پارەی کارەبا:</span>
          <span>${report.expenses.electricity_paid.toLocaleString()} د.ع</span>
        </div>` : ''}
        <div class="receipt-info-row">
          <span>خەرجی تر (غاز/عەلاگە/عەلەف):</span>
          <span>${(isMonthly ? report.expenses.other_expenses : report.expenses.adhoc_expenses).toLocaleString()} د.ع</span>
        </div>
        <div class="receipt-info-row">
          <span>زیانی مریشکی مرداربوو:</span>
          <span>${report.expenses.dead_loss_cost.toLocaleString()} د.ع</span>
        </div>
        <div class="receipt-info-row" style="font-weight: 800; color: #b91c1c;">
          <span>کۆی گشتی تێچوو و خەرجی:</span>
          <span>${report.expenses.total_costs.toLocaleString()} د.ع</span>
        </div>

        <div class="receipt-total-box" style="background: #f8fafc; padding: 8px; margin-top: 8px;">
          <div class="receipt-total-row">
            <span>قازانجی ساف (Net Profit):</span>
            <span style="color: ${report.profit.is_profitable ? '#15803d' : '#b91c1c'}; font-size: 1.15rem;">${report.profit.net_profit.toLocaleString()} د.ع</span>
          </div>
        </div>

        <div class="receipt-footer">
          <div>کاتی چاپکردن: ${currentTimeStr}</div>
          <div style="margin-top: 4px;">واژۆی بەرپرس: _______________</div>
        </div>
      </div>
    `;

    const container = document.getElementById('receipt_modal_content');
    if (container) {
      container.innerHTML = zReportHtml;
    }

    if (window.app) window.app.openModal('receipt_modal');
    setTimeout(() => {
      window.print();
    }, 300);
  }

  exportCsv() {
    const isMonthly = this.currentMode === 'monthly';
    const report = isMonthly ? window.db.getMonthlyReport(this.currentMonth) : window.db.getDailyReport(this.currentDate);
    const sales = report.raw_data.sales;

    let csv = `\uFEFFبەروار,کاتی فرۆشتن,ژمارەی وەسڵ,جۆری پەلەوەر,ناوی کڕیار,دانە,کێش (کگم),نرخی کیلۆ,پاککراو,کرێی پاککردن,نرخی گۆشت,کۆی گشتی\n`;

    sales.forEach(s => {
      const time = getBaghdadTime(s.timestamp);
      const date = getBaghdadDate(s.timestamp);
      const itemDesc = s.is_service_only ? `تەنها پاککردن (${s.service_target_name || 'پەلەوەر'})` : (s.item_type || 'مریشک');
      csv += `"${date}","${time}","${s.receipt_no}","${itemDesc}","${(s.customer_name || '').replace(/"/g, '""')}",${s.chickens_count},${s.weight_kg},${s.sell_price_per_kg},"${s.is_cleaned ? 'بەڵێ' : 'نەخێر'}",${s.cleaning_total_fee},${s.meat_price},${s.total_amount}\n`;
    });

    // Summary lines
    csv += `\n,,,,,,کۆی داهاتی گشتی,,,,${report.income.total_gross_revenue}\n`;
    if (report.income.service_only_revenue > 0) {
      csv += `,,,,,,داهاتی پاککردنی پەلەوەری کڕیار,,,,${report.income.service_only_revenue}\n`;
    }
    csv += `,,,,,,تێچووی مریشکی فرۆشراو,,,,${report.expenses.cost_of_sold_goods}\n`;
    if (isMonthly) {
      csv += `,,,,,,کرێی مانگانەی دوکان,,,,${report.expenses.rent_paid}\n`;
      csv += `,,,,,,پارەی کارەبا,,,,${report.expenses.electricity_paid}\n`;
      csv += `,,,,,,خەرجییەکانی تر,,,,${report.expenses.other_expenses}\n`;
    } else {
      csv += `,,,,,,خەرجییە کاتییەکان,,,,${report.expenses.adhoc_expenses}\n`;
    }
    csv += `,,,,,,زیانی مرداربوونەوە,,,,${report.expenses.dead_loss_cost}\n`;
    csv += `,,,,,,قازانجی ساف,,,,${report.profit.net_profit}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = isMonthly ? `sargalu_monthly_report_${this.currentMonth}.csv` : `sargalu_daily_report_${this.currentDate}.csv`;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    if (window.app) window.app.showToast(`فایلی CSV بۆ (${isMonthly ? this.currentMonth : this.currentDate}) دابەزێنرا`, 'success');
  }
}

// Global instance
window.reports = new ReportsModule();
