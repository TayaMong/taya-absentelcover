const APPS_SCRIPT_URL = 'PASTE_URL_WEB_APP_GOOGLE_APPS_SCRIPT_DISINI';

document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  const loginForm = document.getElementById('loginForm');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const togglePassword = document.getElementById('togglePassword');
  const loginError = document.getElementById('loginError');
  const tabContent = document.getElementById('tabContent');
  const navItems = document.querySelectorAll('.nav-item');
  const logoutBtn = document.getElementById('logoutBtn');

  let html5QrScanner = null;
  let cachedMahasiswa = [];
  let isProcessingScan = false;

  // --- AUTH GUARD ---
  function isAdminAuthenticated() {
    return (
      localStorage.getItem('sw_logged_in') === 'true' &&
      localStorage.getItem('sw_user') === 'admin'
    );
  }

  function rejectAccess() {
    stopScanner();
    localStorage.removeItem('sw_logged_in');
    localStorage.removeItem('sw_user');
    window.location.replace('login.html');
  }

  // --- THEME ---
  if (localStorage.getItem('sw_dark_mode') === 'true') {
    document.body.classList.add('dark-mode');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('sw_dark_mode', document.body.classList.contains('dark-mode'));
    });
  }

  // --- LOGIN PAGE ---
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    });
  }

  if (loginForm) {
    if (isAdminAuthenticated()) {
      window.location.replace('dashboard.html');
      return;
    }

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (username === 'admin' && password === 'admin123') {
        localStorage.setItem('sw_logged_in', 'true');
        localStorage.setItem('sw_user', 'admin');
        window.location.replace('dashboard.html');
      } else if (loginError) {
        loginError.textContent = 'Username atau password salah! (admin / admin123)';
      }
    });
  }

  // --- DASHBOARD PROTECTION ---
  if (tabContent) {
    if (!isAdminAuthenticated()) {
      rejectAccess();
      return;
    }

    window.addEventListener('storage', () => {
      if (!isAdminAuthenticated()) rejectAccess();
    });

    if (logoutBtn) {
      logoutBtn.addEventListener('click', rejectAccess);
    }
  }

  // --- HELPER STOP KAMERA SAAT PINDAH TAB ---
  async function stopScanner() {
    if (html5QrScanner) {
      try {
        await html5QrScanner.stop();
        html5QrScanner.clear();
      } catch (_) {}
      html5QrScanner = null;
    }
  }

  // --- TAB LOADER ---
  async function switchTab(tabName) {
    if (!isAdminAuthenticated()) return rejectAccess();

    await stopScanner();

    navItems.forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tabName);
    });

    try {
      const response = await fetch(`tabs/${tabName}.html`);
      if (!response.ok) throw new Error(`Gagal memuat tabs/${tabName}.html`);

      const rawHtml = await response.text();
      tabContent.innerHTML = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
      initTabEvents(tabName);
    } catch (err) {
      tabContent.innerHTML = `
        <div class="feed-card neu-card">
          <p class="challenge-text">Gagal memuat <strong>tabs/${tabName}.html</strong>.</p>
          <p class="feed-meta">Jalankan melalui Live Server / localhost.</p>
        </div>
      `;
    }
  }

  // --- VERIFIKASI NIM KE SPREADSHEET (HIJAU / MERAH) ---
  async function verifyAndRecordAttendance(nimValue) {
    if (isProcessingScan || !nimValue) return;
    isProcessingScan = true;

    const statusBox = document.getElementById('scanStatusBox');
    const statusIcon = document.getElementById('scanStatusIcon');
    const statusTitle = document.getElementById('scanStatusTitle');
    const statusDesc = document.getElementById('scanStatusDesc');

    if (statusBox) {
      statusBox.className = 'status-banner neu-card status-loading';
      statusIcon.textContent = '⏳';
      statusTitle.textContent = `Memeriksa NIM: ${nimValue}...`;
      statusDesc.textContent = 'Menghubungkan ke Google Spreadsheet';
    }

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({ nim: nimValue })
      });
      const result = await res.json();

      if (result.status === 'found') {
        // DATA DITEMUKAN -> HIJAU
        statusBox.className = 'status-banner neu-card status-success';
        statusIcon.textContent = '✅';
        statusTitle.textContent = `${result.student.nama} (${result.student.nim})`;
        statusDesc.textContent = `Hadir tercatat • Kelas ${result.student.kelas} • ${result.timestamp}`;
      } else {
        // DATA TIDAK DITEMUKAN -> MERAH
        statusBox.className = 'status-banner neu-card status-error';
        statusIcon.textContent = '❌';
        statusTitle.textContent = 'Data Mahasiswa Tidak Ditemukan!';
        statusDesc.textContent = result.message || `NIM ${nimValue} tidak ada di Spreadsheet`;
      }
    } catch (err) {
      statusBox.className = 'status-banner neu-card status-error';
      statusIcon.textContent = '⚠️';
      statusTitle.textContent = 'Gagal Terhubung ke Spreadsheet';
      statusDesc.textContent = 'Periksa koneksi internet atau URL Apps Script';
    }

    // Jeda 2.5 detik sebelum menerima scan berikutnya agar tidak double-input
    setTimeout(() => {
      isProcessingScan = false;
    }, 2500);
  }

  // --- INISIALISASI TIAP TAB ---
  async function initTabEvents(tabName) {
    // 1. TAB SCAN QR MAHASISWA
    if (tabName === 'scan') {
      const manualForm = document.getElementById('manualScanForm');
      const manualInput = document.getElementById('manualNimInput');

      if (manualForm && manualInput) {
        manualForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const nim = manualInput.value.trim();
          if (nim) {
            verifyAndRecordAttendance(nim);
            manualInput.value = '';
          }
        });
      }

      if (typeof Html5Qrcode !== 'undefined' && document.getElementById('qrReader')) {
        html5QrScanner = new Html5Qrcode('qrReader');
        try {
          await html5QrScanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 200, height: 200 } },
            (decodedText) => {
              verifyAndRecordAttendance(decodedText.trim());
            }
          );
        } catch (camErr) {
          document.getElementById('qrReader').innerHTML =
            '<p class="feed-meta" style="padding:24px;text-align:center;">Kamera tidak diizinkan/tidak ditemukan. Gunakan input NIM manual di bawah.</p>';
        }
      }
    }

    // 2. TAB BUAT QR MAHASISWA (SEARCH NAMA / NIM)
    if (tabName === 'generate') {
      const searchInput = document.getElementById('searchMahasiswaInput');
      const resultList = document.getElementById('studentResultList');
      const qrOutputCard = document.getElementById('qrOutputCard');
      const qrCanvasBox = document.getElementById('qrCanvasBox');
      const qrStudentName = document.getElementById('qrStudentName');
      const qrStudentNim = document.getElementById('qrStudentNim');
      const downloadQrBtn = document.getElementById('downloadQrBtn');

      function renderStudentList(keyword = '') {
        const q = keyword.toLowerCase().trim();
        const filtered = cachedMahasiswa.filter(
          (m) => m.nama.toLowerCase().includes(q) || m.nim.toLowerCase().includes(q)
        );

        if (filtered.length === 0) {
          resultList.innerHTML =
            '<p class="feed-meta" style="text-align:center;padding:12px;">Mahasiswa tidak ditemukan.</p>';
          return;
        }

        resultList.innerHTML = filtered
          .map(
            (m) => `
            <div class="challenge-card neu-card" style="padding: 10px 12px;">
              <div class="challenge-info">
                <p class="challenge-text">${m.nama}</p>
                <p class="feed-meta">NIM: ${m.nim} • ${m.kelas}</p>
              </div>
              <button type="button" class="btn-primary go-btn gen-qr-btn" data-nim="${m.nim}" data-nama="${m.nama}" data-kelas="${m.kelas}">
                Buat QR
              </button>
            </div>
          `
          )
          .join('');

        resultList.querySelectorAll('.gen-qr-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const { nim, nama, kelas } = btn.dataset;
            qrOutputCard.style.display = 'flex';
            qrCanvasBox.innerHTML = '';
            qrStudentName.textContent = nama;
            qrStudentNim.textContent = `NIM: ${nim} (${kelas})`;

            new QRCode(qrCanvasBox, {
              text: nim,
              width: 110,
              height: 110,
              colorDark: '#0f172a',
              colorLight: '#ffffff'
            });

            downloadQrBtn.onclick = () => {
              const canvas = qrCanvasBox.querySelector('canvas');
              if (!canvas) return;
              const link = document.createElement('a');
              link.download = `QR_${nim}_${nama.replace(/\s+/g, '_')}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
            };
          });
        });
      }

      // Ambil data mahasiswa dari Google Sheets
      try {
        if (cachedMahasiswa.length === 0) {
          const res = await fetch(`${APPS_SCRIPT_URL}?action=getMahasiswa`);
          const json = await res.json();
          if (json.status === 'ok') cachedMahasiswa = json.data;
        }
        renderStudentList('');
      } catch (err) {
        resultList.innerHTML =
          '<p class="feed-meta" style="text-align:center;color:#ef4444;padding:12px;">Gagal memuat data dari Google Sheets.</p>';
      }

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          renderStudentList(e.target.value);
        });
      }
    }
  }

  if (tabContent && navItems.length > 0) {
    navItems.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    switchTab('scan');
  }
});