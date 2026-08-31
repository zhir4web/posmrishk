/**
 * Sargalu Chicken POS - Main Application Controller
 * Handles Navigation, Keypads, Fast Shortkeys, Modals, Print, Backups, Sound
 * Strict Data Integrity, DOM-safe Notifications, No Silent Coercion
 */

class AppController {
  constructor() {
    this.currentTheme = 'dark';
    this.audioContext = null;
    this.init();
  }

  init() {
    this.bindNavigation();
    this.bindModals();
    this.bindKeyboardShortcuts();
    this.bindSoundToggle();
    this.bindSettingsForm();
    this.bindBackupActions();
    this.bindGlobalInputSanitization();
    this.initAudioContext();
  }

  // Audio Context (Safe Web Audio API synthesizer)
  initAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  playSound(type = 'beep') {
    const settings = window.db ? window.db.getSettings() : { enable_sound: true };
    if (!settings.enable_sound || !this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    try {
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'beep') {
        osc.frequency.setValueAtTime(880, now); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'cash') {
        // High register two-tone chime
        osc.frequency.setValueAtTime(1046.5, now); // C6
        osc.frequency.setValueAtTime(1318.5, now + 0.08); // E6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'click') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'delete') {
        osc.frequency.setValueAtTime(300, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'toggle') {
        osc.frequency.setValueAtTime(659.25, now); // E5
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'warning' || type === 'error') {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(180, now + 0.1);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'success') {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      console.warn('Sound play error:', e);
    }
  }

  // Navigation
  bindNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabId = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tabId);
        this.playSound('click');
      });
    });
  }

  // Keyboard shortcuts
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Avoid hotkeys when typing in text or search inputs
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      // Global F-keys
      if (e.key === 'F1') {
        e.preventDefault();
        this.switchTab('pos');
      } else if (e.key === 'F2') {
        e.preventDefault();
        this.switchTab('batches');
      } else if (e.key === 'F3') {
        e.preventDefault();
        this.switchTab('expenses');
      } else if (e.key === 'F4') {
        e.preventDefault();
        this.switchTab('losses');
      } else if (e.key === 'F5') {
        // Allow F5 refresh or customize if needed
      } else if (e.key === 'F6') {
        e.preventDefault();
        this.switchTab('advisor');
      } else if (e.key === 'F9') {
        e.preventDefault();
        this.switchTab('reports');
      } else if (e.key === 'F10') {
        e.preventDefault();
        this.switchTab('settings');
      } else if (e.key === 'Escape') {
        this.closeAllModals();
      }

      // Enter key in POS: Save and print
      if (e.key === 'Enter' && !isInput) {
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab && activeTab.id === 'tab_pos' && window.pos) {
          window.pos.submitSale(true);
        }
      }
    });
  }

  // Strict Input Sanitization (Forbids minus, exponents, and invalid pastes without silent coercion)
  bindGlobalInputSanitization() {
    // 1. Intercept keydown to forbid minus (-), plus (+), and exponential (e, E) in all number inputs
    document.addEventListener('keydown', (e) => {
      if (e.target && e.target.type === 'number') {
        if (e.key === '-' || e.key === 'Minus' || e.key === 'e' || e.key === 'E' || e.key === '+') {
          e.preventDefault();
        }
      }
    });

    // 2. Intercept paste events: If pasted value is negative or invalid, prevent paste and show toast warning
    document.addEventListener('paste', (e) => {
      if (e.target && e.target.type === 'number') {
        const text = (e.clipboardData || window.clipboardData)?.getData('text');
        if (text) {
          const trimmed = text.trim();
          const parsed = Number(trimmed);
          if (trimmed.includes('-') || trimmed.includes('e') || trimmed.includes('E') || !Number.isFinite(parsed) || parsed < 0) {
            e.preventDefault();
            this.showToast('داخڵکردنی ژمارەی سالب یان نادرووست ڕێگەپێدراو نییە', 'warning');
          }
        }
      }
    });
  }

  switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `tab_${tabId}`);
    });
  }

  // Modals
  bindModals() {
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.currentTarget.closest('.modal-backdrop');
        if (modal) {
          this.closeModal(modal.id);
        }
      });
    });

    const printModalBtn = document.getElementById('btn_modal_print_receipt');
    if (printModalBtn) {
      printModalBtn.addEventListener('click', () => window.print());
    }
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
  }

  // Toast Notifications (Using DOM Text Nodes for complete XSS safety)
  showToast(message, type = 'info') {
    const container = document.getElementById('toast_container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '🛑';
    if (type === 'warning') icon = '⚠️';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = icon;
    const msgSpan = document.createElement('span');
    msgSpan.textContent = String(message);

    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s';
      setTimeout(() => toast.remove(), 200);
    }, 3500);
  }

  // Settings
  bindSettingsForm() {
    const settings = window.db.getSettings();
    this.populateSettingsForm(settings);

    const form = document.getElementById('settings_form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
          const rawCleanFee = parseFloat(document.getElementById('setting_cleaning_fee').value);
          const rawCleanOld = parseFloat(document.getElementById('setting_cleaning_fee_old_chicken').value);
          const rawCleanGoose = parseFloat(document.getElementById('setting_cleaning_fee_goose').value);
          const rawCleanTurkey = parseFloat(document.getElementById('setting_cleaning_fee_turkey').value);
          const rawRent = parseFloat(document.getElementById('setting_monthly_rent').value);
          const rawSellPrice = parseFloat(document.getElementById('setting_sell_price').value);
          const rawBuyPrice = parseFloat(document.getElementById('setting_buy_price').value);

          const updated = {
            store_name: document.getElementById('setting_store_name').value.trim(),
            phone: document.getElementById('setting_phone').value.trim(),
            address: document.getElementById('setting_address').value.trim(),
            receipt_header: document.getElementById('setting_receipt_header').value.trim(),
            receipt_footer: document.getElementById('setting_receipt_footer').value.trim(),
            cleaning_fee_per_chicken: rawCleanFee,
            cleaning_fee_old_chicken: rawCleanOld,
            cleaning_fee_goose: rawCleanGoose,
            cleaning_fee_turkey: rawCleanTurkey,
            monthly_rent: rawRent,
            default_sell_price_per_kg: rawSellPrice,
            default_buy_price_per_kg: rawBuyPrice,
            auto_print_receipt: document.getElementById('setting_auto_print').checked,
            enable_sound: document.getElementById('setting_sound_enabled').checked
          };

          window.db.saveSettings(updated);
          this.showToast('ڕێکخستنەکان بە سەرکەوتوویی پاشەکەوت کران', 'success');
          this.playSound('success');
        } catch (err) {
          console.error('Settings save error:', err);
          this.showToast(err.message || 'هەڵە لە پاشەکەوتکردنی ڕێکخستنەکان', 'danger');
          this.playSound('warning');
        }
      });
    }
  }

  populateSettingsForm(s) {
    if (!s) return;
    const map = {
      setting_store_name: s.store_name,
      setting_phone: s.phone,
      setting_address: s.address,
      setting_receipt_header: s.receipt_header,
      setting_receipt_footer: s.receipt_footer,
      setting_cleaning_fee: s.cleaning_fee_per_chicken,
      setting_cleaning_fee_old_chicken: s.cleaning_fee_old_chicken,
      setting_cleaning_fee_goose: s.cleaning_fee_goose,
      setting_cleaning_fee_turkey: s.cleaning_fee_turkey,
      setting_monthly_rent: s.monthly_rent,
      setting_sell_price: s.default_sell_price_per_kg,
      setting_buy_price: s.default_buy_price_per_kg
    };

    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    });

    const autoPrintEl = document.getElementById('setting_auto_print');
    if (autoPrintEl) autoPrintEl.checked = Boolean(s.auto_print_receipt);

    const soundEl = document.getElementById('setting_sound_enabled');
    if (soundEl) soundEl.checked = Boolean(s.enable_sound);

    const soundHeaderBtn = document.getElementById('btn_toggle_sound');
    if (soundHeaderBtn) {
      soundHeaderBtn.classList.toggle('active', Boolean(s.enable_sound));
    }
  }

  // Backup & Actions
  bindBackupActions() {
    // Export Backup JSON
    const exportBtn = document.getElementById('btn_export_backup');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = window.db.exportAllData();
        const str = JSON.stringify(data, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const backupDate = typeof getBaghdadDate === 'function' ? getBaghdadDate() : new Date().toISOString().slice(0, 10);
        a.download = `sargalu_backup_${backupDate}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('فایلی پاشەکەوتی داتابەیس دابەزێنرا', 'success');
        this.playSound('success');
      });
    }

    // Import Backup JSON
    const importInput = document.getElementById('import_file_input');
    const importBtn = document.getElementById('btn_trigger_import');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          const res = window.db.importAllData(evt.target.result);
          if (res.success) {
            this.showToast('داتاکان بە سەرکەوتوویی گەڕێنرانەوە', 'success');
            this.playSound('success');
            setTimeout(() => location.reload(), 800);
          } else {
            this.showToast('هەڵە لە فایلی داتادا: ' + res.error, 'danger');
            this.playSound('warning');
          }
        };
        reader.readAsText(file);
      });
    }

    // Seed Demo Data
    const seedBtn = document.getElementById('btn_seed_demo');
    if (seedBtn) {
      seedBtn.addEventListener('click', () => {
        if (confirm('ئایا دڵنیایت لە بارکردنی داتای نموونەیی؟ داتاکانی ئێستا دەسڕدرێنەوە.')) {
          window.db.clearAllData();
          window.db.seedDemoData();
          this.showToast('داتای تاقیکردنەوە بە سەرکەوتوویی بارکرا', 'success');
          this.playSound('success');
          setTimeout(() => location.reload(), 600);
        }
      });
    }

    // Reset All Data
    const resetBtn = document.getElementById('btn_reset_all_data');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('⚠️ ئاگاداری: ئایا بە تەواوی دڵنیایت لە سڕینەوەی سەرجەم داتاکان (بار، فرۆشتن، زیان و خەرجی)؟ ئەم کردارە ناگەڕێتەوە.')) {
          if (confirm('دووپاتکردنەوە: تکایە دڵنیابە پێش سڕینەوە باکئەپت دابەزاندبێت. سڕینەوە ئەنجام بدرێت؟')) {
            window.db.clearAllData();
            this.showToast('سەرجەم داتاکان سڕانەوە', 'danger');
            this.playSound('delete');
            setTimeout(() => location.reload(), 600);
          }
        }
      });
    }
  }

  bindSoundToggle() {
    const btn = document.getElementById('btn_toggle_sound');
    if (btn) {
      btn.addEventListener('click', () => {
        const s = window.db.getSettings();
        const newVal = !s.enable_sound;
        window.db.saveSettings({ enable_sound: newVal });
        btn.classList.toggle('active', newVal);
        this.showToast(newVal ? 'دەنگی سیستەم چالاککرا' : 'دەنگی سیستەم بێدەنگکرا', 'info');
        if (newVal) this.playSound('success');
      });
    }
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
