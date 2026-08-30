/**
 * Sargalu Chicken POS - Dedicated Smart Pricing & Strategy Advisor (ڕاوێژکاری زیرەکی نرخ و قازانج)
 * Automatic Daily Recommendation Engine & Strategic Profit Simulator
 */

class SmartAdvisorModule {
  constructor() {
    this.init();
  }

  init() {
    this.renderFullPage();
    this.bindEvents();

    if (window.db) {
      window.db.subscribe((event) => {
        if (['batches_updated', 'active_batch_changed', 'settings_updated'].includes(event)) {
          this.renderFullPage();
        }
      });
    }
  }

  bindEvents() {
    // Strategy Simulator Inputs in dedicated tab
    document.addEventListener('input', (e) => {
      if (['sim_buy_price', 'sim_sell_price', 'sim_bird_count', 'sim_avg_weight', 'sim_cleaning_fee', 'sim_clean_percent'].includes(e.target.id)) {
        this.updateSimulatorMath();
      }
    });

    // Apply Strategy Price Buttons
    document.addEventListener('click', (e) => {
      const applyBtn = e.target.closest('.btn-apply-strategy-price');
      if (applyBtn) {
        const price = parseFloat(applyBtn.getAttribute('data-price'));
        if (price > 0 && window.pos) {
          window.pos.setCustomMeatSellPrice(price);
          if (window.app) {
            window.app.switchTab('pos');
            window.app.showToast(`نرخی ${price.toLocaleString()} د.ع لە شاشەی فرۆشتن جێبەجێکرا ✓`, 'success');
            window.app.playSound('success');
          }
        }
      }
    });
  }

  /**
   * Generates strategic pricing analysis for a given batch
   */
  analyzeBatch(batch) {
    const settings = window.db ? window.db.getSettings() : { default_buy_price_per_kg: 2250, default_sell_price_per_kg: 2750, cleaning_fee_per_chicken: 1500 };
    const buyPrice = batch ? (batch.buy_price_per_kg || settings.default_buy_price_per_kg) : settings.default_buy_price_per_kg;
    const currentSellPrice = batch ? (batch.sell_price_per_kg || settings.default_sell_price_per_kg) : settings.default_sell_price_per_kg;
    const cleaningFee = settings.cleaning_fee_per_chicken || 1500;
    const totalWeight = batch ? (batch.total_weight_kg || 150) : 150;
    const estimatedChickens = batch ? (batch.total_chickens || Math.max(1, Math.round(totalWeight / 2.3))) : Math.max(1, Math.round(totalWeight / 2.3));
    const avgWeightPerBird = (batch && batch.avg_weight_per_bird) ? batch.avg_weight_per_bird : +(totalWeight / Math.max(1, estimatedChickens)).toFixed(2);

    // Strategy 1: Market Breaker / Ultra Discount (فرۆشتن بە کەمێک خوار نرخی کڕین، قازانج لە پاککردن)
    const discountPrice = Math.max(1000, buyPrice - 100);
    const discountMeatProfitPerBird = (discountPrice - buyPrice) * avgWeightPerBird;
    const discountNetProfitPerBird = discountMeatProfitPerBird + cleaningFee;
    const discountBatchNetProfit = Math.round(discountNetProfitPerBird * estimatedChickens);

    // Strategy 2: At-Cost Traffic Driver (فرۆشتن ڕێک بە نرخی مەخزەن)
    const atCostPrice = buyPrice;
    const atCostNetProfitPerBird = cleaningFee;
    const atCostBatchNetProfit = Math.round(atCostNetProfitPerBird * estimatedChickens);

    // Strategy 3: Competitive Fast Mover (قازانجی کەم لەسەر کێش + تەواوی پاککردن)
    const competitivePrice = buyPrice + 150;
    const compMeatProfitPerBird = (competitivePrice - buyPrice) * avgWeightPerBird;
    const compNetProfitPerBird = compMeatProfitPerBird + cleaningFee;
    const compBatchNetProfit = Math.round(compNetProfitPerBird * estimatedChickens);

    // Strategy 4: Standard Normal Market Price
    const standardPrice = Math.max(currentSellPrice, buyPrice + 450);
    const stdMeatProfitPerBird = (standardPrice - buyPrice) * avgWeightPerBird;
    const stdNetProfitPerBird = stdMeatProfitPerBird + cleaningFee;
    const stdBatchNetProfit = Math.round(stdNetProfitPerBird * estimatedChickens);

    return {
      buyPrice,
      currentSellPrice,
      cleaningFee,
      estimatedChickens,
      totalWeight,
      avgWeightPerBird,
      strategies: {
        ultraDiscount: {
          title: '⚡ بازاڕشکێن و کڕیاری بێشومار (Traffic Magnet)',
          badge: 'هەرزانترین لە شار',
          badgeClass: 'badge-warning',
          sellPrice: discountPrice,
          profitPerBird: Math.round(discountNetProfitPerBird),
          batchProfit: discountBatchNetProfit,
          desc: `گۆشت بە ١٠٠ د.ع خوار نرخی کڕین دەفرۆشیت بۆ ڕاکێشانی کڕیار، بەڵام بە کرێی پاککردن (${cleaningFee.toLocaleString()} د.ع) لە هەر مریشکێکدا +${Math.round(discountNetProfitPerBird).toLocaleString()} د.ع قازانجی پاک دەکەیت!`
        },
        atCost: {
          title: '🔥 فرۆشتن بە نرخی مەخزەن (At-Cost Traffic)',
          badge: 'ڕاکێشانی گەورە',
          badgeClass: 'badge-primary',
          sellPrice: atCostPrice,
          profitPerBird: Math.round(atCostNetProfitPerBird),
          batchProfit: atCostBatchNetProfit,
          desc: `گۆشت ڕێک بە نرخی تێچووی کڕین (${buyPrice.toLocaleString()} د.ع) دەفرۆشیت، داهاتی پاککردن تەواوی دەبێتە قازانجی ساف کە دەکاتە +${atCostBatchNetProfit.toLocaleString()} د.ع بۆ تەواوی بارەکە.`
        },
        competitive: {
          title: '✨ هەرزانی هاوسەنگ (Smart Volume)',
          badge: 'پێشنیارکراوی زیرەک (Recommended)',
          badgeClass: 'badge-success',
          sellPrice: competitivePrice,
          profitPerBird: Math.round(compNetProfitPerBird),
          batchProfit: compBatchNetProfit,
          desc: `نرخێکی زۆر گونجاو و کێبڕکێکار (+١٥٠ د.ع لەسەر کڕین)، فرۆشتنت زۆر دەبێت و +${compBatchNetProfit.toLocaleString()} د.ع قازانجی ساف دەهێنێت.`
        },
        standard: {
          title: '⚖️ نرخی ستانداردی بازاڕ (Standard Margin)',
          badge: 'قازانجی ئاسایی',
          badgeClass: 'badge-neutral',
          sellPrice: standardPrice,
          profitPerBird: Math.round(stdNetProfitPerBird),
          batchProfit: stdBatchNetProfit,
          desc: `قازانجی ئاسایی لەسەر کێش + کرێی پاککردن، قازانجی گشتی پێشبینیکراو: +${stdBatchNetProfit.toLocaleString()} د.ع.`
        }
      }
    };
  }

  renderFullPage() {
    const container = document.getElementById('smart_advisor_full_page');
    if (!container) return;

    const activeBatch = window.db ? window.db.getActiveBatch('مریشکی ناسک') : null;
    const analysis = this.analyzeBatch(activeBatch);
    const strats = Object.values(analysis.strategies);

    container.innerHTML = `
      <!-- Header Banner with Batch Analysis -->
      <div class="card" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #86efac; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <div style="background: white; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; box-shadow: 0 4px 10px rgba(0,0,0,0.06);">
              💡
            </div>
            <div>
              <h2 style="font-size: 1.25rem; font-weight: 900; color: #166534; margin: 0;">ڕاوێژکاری زیرەکی نرخ و ستراتیژی فرۆشتن (Smart Pricing Advisor)</h2>
              <div style="font-size: 0.88rem; color: #15803d; margin-top: 3px;">
                نرخی کڕینی ئەمڕۆ: <strong>${analysis.buyPrice.toLocaleString()} د.ع/کگم</strong> | 
                کۆی کێشی مەخزەن: <strong>${analysis.totalWeight} کگم</strong> (~${analysis.estimatedChickens} مریشک)
              </div>
            </div>
          </div>
          <button type="button" class="btn-primary touch-btn" onclick="window.app.switchTab('pos')" style="padding: 0.6rem 1.25rem; font-weight: 800;">
            ⚡ چوون بۆ شاشەی فرۆشتن ⟵
          </button>
        </div>
      </div>

      <!-- Strategic Pricing Cards Grid -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-title" style="margin-bottom: 1rem; color: var(--primary);">
          🎯 ستراتیژییە پێشنیارکراوەکانی ئەمڕۆ بەپێی باری مەخزەن:
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
          ${strats.map(s => `
            <div class="advisor-strategy-card ${s.badgeClass === 'badge-success' ? 'recommended' : ''}" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div class="card-top-row">
                  <div>
                    <strong style="font-size: 0.95rem;">${s.title}</strong>
                    <span class="badge ${s.badgeClass}" style="margin-right: 0.3rem;">${s.badge}</span>
                  </div>
                  <div class="strat-price" style="font-size: 1.3rem;">${s.sellPrice.toLocaleString()} <span style="font-size: 0.75rem;">د.ع/کگم</span></div>
                </div>
                <div class="strat-desc" style="margin: 0.6rem 0; font-size: 0.85rem; line-height: 1.5;">${s.desc}</div>
              </div>
              <div class="strat-footer" style="margin-top: 0.75rem;">
                <div class="profit-highlight">قازانجی ساف: <strong>+${s.batchProfit.toLocaleString()} د.ع</strong></div>
                <button type="button" class="btn-apply-strategy-price touch-btn apply-btn" data-price="${s.sellPrice}">
                  جێبەجێکردن لە فرۆشتن ✓
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Interactive Profit Simulator (ژمێریاری تاقیکردنەوەی نرخ و قازانج) -->
      <div class="card">
        <div class="card-title" style="margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
          <span>🧮 ژمێریاری تاقیکردنەوەی نرخ و پێشبینی داهات (Profit Simulator):</span>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">هەر نرخێک و ژمارەیەک بنووسیت ڕاستەوخۆ هەژماری دەکات</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-top: 1rem;">
          <div class="pos-row">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 700;">نرخی کڕینی ١ کگم (د.ع):</label>
            <input type="number" min="0" id="sim_buy_price" class="input-text" value="${analysis.buyPrice}" style="font-weight: 700;">
          </div>
          <div class="pos-row">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 700;">نرخی فرۆشتنی ١ کگم (د.ع):</label>
            <input type="number" min="0" id="sim_sell_price" class="input-text" value="${analysis.strategies.competitive.sellPrice}" style="font-weight: 900; color: var(--primary);">
          </div>
          <div class="pos-row">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 700;">ژمارەی مریشک:</label>
            <input type="number" min="1" id="sim_bird_count" class="input-text" value="${analysis.estimatedChickens}">
          </div>
          <div class="pos-row">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 700;">کێشی تەقریبی ١ مریشک (کگم):</label>
            <input type="number" step="0.1" min="0.5" id="sim_avg_weight" class="input-text" value="${analysis.avgWeightPerBird}" title="بە نزیکەیی کێشی یەک مریشک چەندە (بۆ نموونە: 2.3 کگم)">
          </div>
          <div class="pos-row">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 700;">کرێی پاککردن (د.ع):</label>
            <input type="number" min="0" id="sim_cleaning_fee" class="input-text" value="${analysis.cleaningFee}">
          </div>
          <div class="pos-row">
            <label class="form-label" style="font-size: 0.82rem; font-weight: 700;">٪ـی پاککراو:</label>
            <input type="number" min="0" max="100" id="sim_clean_percent" class="input-text" value="90">
          </div>
        </div>

        <!-- Simulator Result Panel -->
        <div class="sim-result-card" style="margin-top: 1.25rem; background: var(--surface-alt); border: 2px solid var(--border); border-radius: var(--radius-lg); padding: 1.25rem;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; text-align: center;">
            <div>
              <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">داهاتی فرۆشتنی گۆشت</div>
              <div id="sim_res_meat_rev" style="font-weight: 800; font-size: 1.15rem; margin-top: 4px;">0 د.ع</div>
            </div>
            <div>
              <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">داهاتی پاککردن</div>
              <div id="sim_res_clean_rev" style="font-weight: 800; font-size: 1.15rem; color: #b45309; margin-top: 4px;">0 د.ع</div>
            </div>
            <div>
              <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700;">کۆی تێچووی کڕینی بار</div>
              <div id="sim_res_total_cost" style="font-weight: 800; font-size: 1.15rem; color: #b91c1c; margin-top: 4px;">0 د.ع</div>
            </div>
            <div style="background: white; border-radius: var(--radius-md); padding: 0.5rem; border: 2px solid #86efac;">
              <div style="font-size: 0.8rem; color: #166534; font-weight: 800;">قازانجی سافی تەواوی بارەکە</div>
              <div id="sim_res_net_profit" style="font-weight: 900; font-size: 1.35rem; color: var(--primary); margin-top: 2px;">0 د.ع</div>
            </div>
          </div>
          <div id="sim_res_insight" style="margin-top: 1rem; padding-top: 0.85rem; border-top: 1px dashed var(--border);">
            <!-- Insight details -->
          </div>
        </div>
      </div>
    `;

    this.updateSimulatorMath();
  }

  updateSimulatorMath() {
    const buyPrice = parseFloat(document.getElementById('sim_buy_price')?.value) || 0;
    const sellPrice = parseFloat(document.getElementById('sim_sell_price')?.value) || 0;
    const birdCount = parseInt(document.getElementById('sim_bird_count')?.value, 10) || 0;
    const avgWeight = parseFloat(document.getElementById('sim_avg_weight')?.value) || 2.3;
    const cleaningFee = parseFloat(document.getElementById('sim_cleaning_fee')?.value) || 1500;
    const cleanPercent = (parseFloat(document.getElementById('sim_clean_percent')?.value) || 90) / 100;

    const totalWeight = +(birdCount * avgWeight).toFixed(2);
    const totalBuyCost = Math.round(totalWeight * buyPrice);
    const totalMeatRevenue = Math.round(totalWeight * sellPrice);
    const meatProfitLoss = totalMeatRevenue - totalBuyCost;

    const cleanedBirdsCount = Math.round(birdCount * cleanPercent);
    const totalCleaningRevenue = Math.round(cleanedBirdsCount * cleaningFee);

    const grandTotalRevenue = totalMeatRevenue + totalCleaningRevenue;
    const netProfit = grandTotalRevenue - totalBuyCost;
    const profitPerBird = birdCount > 0 ? Math.round(netProfit / birdCount) : 0;

    // Update UI elements
    const elMeatRev = document.getElementById('sim_res_meat_rev');
    const elCleanRev = document.getElementById('sim_res_clean_rev');
    const elTotalCost = document.getElementById('sim_res_total_cost');
    const elNetProfit = document.getElementById('sim_res_net_profit');
    const elInsight = document.getElementById('sim_res_insight');

    if (elMeatRev) elMeatRev.textContent = `${totalMeatRevenue.toLocaleString()} د.ع`;
    if (elCleanRev) elCleanRev.textContent = `${totalCleaningRevenue.toLocaleString()} د.ع (${cleanedBirdsCount} دانە)`;
    if (elTotalCost) elTotalCost.textContent = `${totalBuyCost.toLocaleString()} د.ع`;
    
    if (elNetProfit) {
      elNetProfit.textContent = `${netProfit.toLocaleString()} د.ع`;
      elNetProfit.style.color = netProfit >= 0 ? '#15803d' : '#b91c1c';
    }

    if (elInsight) {
      if (sellPrice < buyPrice) {
        elInsight.innerHTML = `
          <div style="color: #b45309; font-weight: 700; font-size: 0.9rem; line-height: 1.5;">
            ⚡ <strong>ستراتیژی بازاڕشکێن و کڕیاری زۆر (Traffic Magnet):</strong> گۆشتەکە بە ${Math.abs(sellPrice - buyPrice).toLocaleString()} د.ع خوار تێچووی کڕین دەفرۆشیت بۆ ڕاکێشانی کڕیارێکی بێشومار، بەڵام بەهۆی داهاتی پاککردن (${totalCleaningRevenue.toLocaleString()} د.ع)، بە گشتی <strong>+${netProfit.toLocaleString()} د.ع قازانجی ساف</strong> دەکەیت و بڕی <strong>+${profitPerBird.toLocaleString()} د.ع قازانج لە هەر دانەیەک</strong> دەمێنێتەوە!
          </div>
        `;
      } else if (sellPrice === buyPrice) {
        elInsight.innerHTML = `
          <div style="color: #0284c7; font-weight: 700; font-size: 0.9rem; line-height: 1.5;">
            🔥 <strong>ستراتیژی فرۆشتن بە نرخی مەخزەن:</strong> گۆشت بە تێچووی کڕین دەفرۆشرێت، تەواوی داهاتی پاککردن (${totalCleaningRevenue.toLocaleString()} د.ع) دەبێتە قازانجی سافی دوکانەکەت.
          </div>
        `;
      } else {
        elInsight.innerHTML = `
          <div style="color: #15803d; font-weight: 700; font-size: 0.9rem; line-height: 1.5;">
            💎 <strong>ستراتیژی قازانجی دوولایەنە:</strong> قازانج لە کێشی گۆشت (${meatProfitLoss.toLocaleString()} د.ع) + قازانج لە پاککردن (${totalCleaningRevenue.toLocaleString()} د.ع) = <strong>+${netProfit.toLocaleString()} د.ع کۆی قازانجی پاک</strong>.
          </div>
        `;
      }
    }
  }
}

window.smartAdvisor = new SmartAdvisorModule();
