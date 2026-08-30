/**
 * Sargalu Chicken POS - Main Application Controller
 * Tab switching, Web Audio Sound Synth, Modals, Toasts, Settings & Backup
 */

class AppController {
  constructor() {
    this.audioCtx = null;
    this.init();
  }

  init() {
    this.bindNavigation();
    this.bindModals();
    this.bindSettingsForm();
    this.bindBackupActions();
    this.bindGlobalInputSanitization();
    this.initAudioContext();
    this.registerServiceWorker();
    this.updateOnlineStatus();

    window.addEventListener('online', () => this.updateOnlineStatus());
    window.addEventListener('offline', () => this.updateOnlineStatus());
  }

  // Web Audio Synthesizer for tactile touch feedback
  initAudioContext() {
    const unlockAudio = () => {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('click', unlockAudio, { once: true });
  }

  playSound(type) {
    const settings = window.db ? window.db.getSettings() : { enable_sound: true };
    if (!settings.enable_sound) return;

    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) this.audioCtx = new AudioContextClass();
      }
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      if (type === 'beep' || type === 'click') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'cash') {
        // Double ding register chime
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(1046.5, now); // C6
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.5, now + 0.08); // E6

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start(now);
        osc1.stop(now + 0.15);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.35);
      } else if (type === 'success') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'toggle') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(900, now + 0.03);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'delete' || type === 'error' || type === 'warning') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      // Audio not supported or blocked
    }
  }

  // Navigation
  bindNavigation() {
    document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabId = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tabId);
        this.playSound('click');
      });
    });

    // Fullscreen button
    const fsBtn = document.getElementById('btn_toggle_fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Sound toggle in header
    const soundBtn = document.getElementById('btn_toggle_sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const settings = window.db.getSettings();
        settings.enable_sound = !settings.enable_sound;
        window.db.saveSettings(settings);
        soundBtn.classList.toggle('active', settings.enable_sound);
        this.showToast(settings.enable_sound ? 'دەنگ کارا کرا 🔊' : 'دەنگ بێدەنگ کرا 🔇', 'info');
      });
    }
  }

  bindGlobalInputSanitization() {
    // 1. Intercept keydown to forbid minus (-), plus (+), and exponential (e, E) in all number inputs
    document.addEventListener('keydown', (e) => {
      if (e.target && e.target.type === 'number') {
        if (e.key === '-' || e.key === 'Minus' || e.key === 'e' || e.key === 'E' || e.key === '+') {
          e.preventDefault();
        }
      }
    });

    // 2. Intercept paste events to sanitize pasted negative text
    document.addEventListener('paste', (e) => {
      if (e.target && e.target.type === 'number') {
        const text = (e.clipboardData || window.clipboardData)?.getData('text');
        if (text && (text.includes('-') || text.includes('e') || text.includes('E'))) {
          e.preventDefault();
          const clean = Math.abs(parseFloat(text)) || '';
          e.target.value = clean;
          e.target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    // 3. Live sanitize any negative value on input/change events across the whole app
    document.addEventListener('input', (e) => {
      if (e.target && e.target.type === 'number') {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val < 0) {
          e.target.value = Math.abs(val);
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
        const modal = e.target.closest('.modal-backdrop');
        if (modal) this.closeModal(modal.id);
      });
    });
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

  // Toast Notifications
  showToast(message, type = 'info') {
    const container = document.getElementById('toast_container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '🛑';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
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
        const updated = {
          store_name: document.getElementById('setting_store_name').value.trim(),
          phone: document.getElementById('setting_phone').value.trim(),
          address: document.getElementById('setting_address').value.trim(),
          receipt_header: document.getElementById('setting_receipt_header').value.trim(),
          receipt_footer: document.getElementById('setting_receipt_footer').value.trim(),
          cleaning_fee_per_chicken: parseFloat(document.getElementById('setting_cleaning_fee').value) || 1500,
          cleaning_fee_old_chicken: parseFloat(document.getElementById('setting_cleaning_fee_old_chicken').value) || 2000,
          cleaning_fee_goose: parseFloat(document.getElementById('setting_cleaning_fee_goose').value) || 3500,
          cleaning_fee_turkey: parseFloat(document.getElementById('setting_cleaning_fee_turkey').value) || 5000,
          monthly_rent: parseFloat(document.getElementById('setting_monthly_rent').value) || 350000,
          default_sell_price_per_kg: parseFloat(document.getElementById('setting_sell_price').value) || 2750,
          default_buy_price_per_kg: parseFloat(document.getElementById('setting_buy_price').value) || 2250,
          auto_print_receipt: document.getElementById('setting_auto_print').checked,
          enable_sound: document.getElementById('setting_sound_enabled').checked
        };

        window.db.saveSettings(updated);
        this.showToast('ڕێکخستنەکان بە سەرکەوتوویی پاشەکەوت کران', 'success');
        this.playSound('success');
      });
    }
  }

  populateSettingsForm(s) {
    if (document.getElementById('setting_store_name')) document.getElementById('setting_store_name').value = s.store_name || '';
    if (document.getElementById('setting_phone')) document.getElementById('setting_phone').value = s.phone || '';
    if (document.getElementById('setting_address')) document.getElementById('setting_address').value = s.address || '';
    if (document.getElementById('setting_receipt_header')) document.getElementById('setting_receipt_header').value = s.receipt_header || '';
    if (document.getElementById('setting_receipt_footer')) document.getElementById('setting_receipt_footer').value = s.receipt_footer || '';
    if (document.getElementById('setting_cleaning_fee')) document.getElementById('setting_cleaning_fee').value = s.cleaning_fee_per_chicken ?? 1500;
    if (document.getElementById('setting_cleaning_fee_old_chicken')) document.getElementById('setting_cleaning_fee_old_chicken').value = s.cleaning_fee_old_chicken ?? 2000;
    if (document.getElementById('setting_cleaning_fee_goose')) document.getElementById('setting_cleaning_fee_goose').value = s.cleaning_fee_goose ?? 3500;
    if (document.getElementById('setting_cleaning_fee_turkey')) document.getElementById('setting_cleaning_fee_turkey').value = s.cleaning_fee_turkey ?? 5000;
    if (document.getElementById('setting_monthly_rent')) document.getElementById('setting_monthly_rent').value = s.monthly_rent ?? 350000;
    if (document.getElementById('setting_sell_price')) document.getElementById('setting_sell_price').value = s.default_sell_price_per_kg ?? 2750;
    if (document.getElementById('setting_buy_price')) document.getElementById('setting_buy_price').value = s.default_buy_price_per_kg ?? 2250;
    if (document.getElementById('setting_auto_print')) document.getElementById('setting_auto_print').checked = Boolean(s.auto_print_receipt);
    if (document.getElementById('setting_sound_enabled')) document.getElementById('setting_sound_enabled').checked = Boolean(s.enable_sound);

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
        a.download = `sargalu_backup_${new Date().toISOString().slice(0, 10)}.json`;
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
          }
        };
        reader.readAsText(file);
      });
    }

    // Seed Demo Data
    const seedBtn = document.getElementById('btn_seed_demo');
    if (seedBtn) {
      seedBtn.addEventListener('click', () => {
        if (confirm('ئایا دەتەوێت داتای تاقیکاری بار، فرۆشتن و خەرجی بۆ ئەمڕۆ پڕبکەیتەوە؟')) {
          window.db.seedDemoData();
          this.showToast('داتای نموونەیی بە سەرکەوتوویی بارکرا', 'success');
          this.playSound('success');
        }
      });
    }

    // Clear All Data
    const clearBtn = document.getElementById('btn_clear_all');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('ئاگاداربە! ئەم کارە تەواوی داتاکانی فرۆشتن، بار و خەرجی دەسڕێتەوە. ئایا دڵنیایت؟')) {
          window.db.clearAllData();
          this.showToast('تەواوی داتاکان سڕانەوە', 'danger');
          this.playSound('delete');
        }
      });
    }
  }

  updateOnlineStatus() {
    const badge = document.getElementById('network_status_badge');
    if (!badge) return;
    if (navigator.onLine) {
      badge.innerHTML = `<span style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; display: inline-block;"></span> ئۆنلاین`;
      badge.className = 'badge badge-success';
    } else {
      badge.innerHTML = `<span style="width: 8px; height: 8px; background: #eab308; border-radius: 50%; display: inline-block;"></span> ئۆفلاین (PWA)`;
      badge.className = 'badge badge-warning';
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('Sargalu PWA Service Worker Registered');
            reg.update();
          })
          .catch((err) => console.log('SW registration skipped:', err));
      });
    }

    // Request permanent persistent storage on device
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persistent) => {
        if (persistent) {
          console.log('Storage is locked and will never be cleared automatically');
        }
      }).catch(() => {});
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
