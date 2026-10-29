(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const cfg = window.FINSAKU_CONFIG || {};
  let transactions = [];
  let selectedReceipt = null;
  let recognition = null;
  let toastTimer = null;

  const money = (n) => new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0
  }).format(Number(n) || 0);
  const safe = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const fmtDate = (s) => {
    if (!s) return "—";
    const d = new Date(String(s).slice(0,10) + "T12:00:00");
    return isNaN(d) ? safe(s) : d.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
  };
  const isoToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  function toast(message, error=false) {
    const el = $("toast"); el.textContent = message;
    el.className = "toast show" + (error ? " error" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className="toast", 3800);
  }
  function busy(on, message="Memproses…") {
    $("busy-text").textContent = message;
    $("busy-overlay").classList.toggle("show", on);
  }
  function configured() { return Boolean(cfg.GAS_URL && cfg.API_TOKEN); }
  function connection(ok, text) {
    $("connection-dot").className = ok ? "connected" : "";
    $("connection-text").textContent = text;
  }
  async function request(action, data={}) {
    if (!configured()) throw new Error("Konfigurasi belum diisi. Isi GAS_URL dan API_TOKEN di config.js.");
    const url = cfg.GAS_URL.trim();
    const payload = { ...data, action, api_token: cfg.API_TOKEN };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || "Permintaan gagal.");
    return result;
  }
  async function loadTransactions(showToast=false) {
    if (!configured()) {
      connection(false, "Belum terhubung ke Sheets");
      renderAll();
      return;
    }
    try {
      const url = new URL(cfg.GAS_URL);
      url.searchParams.set("api_token", cfg.API_TOKEN);
      const res = await fetch(url.toString(), { method: "GET", redirect: "follow" });
      const result = await res.json();
      if (!result.success) throw new Error(result.message || "Gagal memuat transaksi.");
      transactions = Array.isArray(result.data) ? result.data : [];
      connection(true, "Terhubung ke Google Sheets");
      renderAll();
      if (showToast) toast("Data transaksi berhasil dimuat.");
    } catch (e) {
      connection(false, "Koneksi Sheets bermasalah");
      if (showToast) toast(e.message, true);
      else console.warn("FinSaku: gagal memuat data", e);
      renderAll();
    }
  }
  function renderAll() {
    const period = $("period-select")?.value || "all";
    const now = new Date();
    const data = transactions.filter(t => period !== "month" || (() => {
      const d = new Date(String(t.tanggal || "").slice(0,10) + "T12:00:00");
      return !isNaN(d) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })());
    const income = data.filter(t=>t.jenis==="Masuk").reduce((a,t)=>a+Number(t.nominal||0),0);
    const expense = data.filter(t=>t.jenis==="Keluar").reduce((a,t)=>a+Number(t.nominal||0),0);
    $("total-balance").textContent = money(income-expense);
    $("total-income").textContent = money(income);
    $("total-expense").textContent = money(expense);
    renderChart(data);
    renderRecent();
    renderTable();
    updateCategoryFilter();
  }
  function renderChart(data) {
    const wrap = $("cashflow-chart");
    const months = [];
    const now = new Date();
    for (let i=5;i>=0;i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      months.push({year:d.getFullYear(),month:d.getMonth(),label:d.toLocaleDateString("id-ID",{month:"short"})});
    }
    const sums = months.map(m => {
      const rows = data.filter(t => {
        const d = new Date(String(t.tanggal||"").slice(0,10)+"T12:00:00");
        return !isNaN(d) && d.getFullYear()===m.year && d.getMonth()===m.month;
      });
      return {...m, masuk:rows.filter(t=>t.jenis==="Masuk").reduce((a,t)=>a+Number(t.nominal||0),0),
        keluar:rows.filter(t=>t.jenis==="Keluar").reduce((a,t)=>a+Number(t.nominal||0),0)};
    });
    const max = Math.max(1,...sums.map(m=>Math.max(m.masuk,m.keluar)));
    if (!sums.some(m=>m.masuk||m.keluar)) {
      wrap.innerHTML = '<div class="empty-chart">Tambahkan transaksi untuk melihat arus kas.</div>'; return;
    }
    wrap.innerHTML = sums.map(m => `<div class="chart-month"><div class="bar-pair"><div class="bar" title="Masuk ${money(m.masuk)}" style="height:${Math.max(m.masuk?4:0,m.masuk/max*100)}%"></div><div class="bar out" title="Keluar ${money(m.keluar)}" style="height:${Math.max(m.keluar?4:0,m.keluar/max*100)}%"></div></div><small>${safe(m.label)}</small></div>`).join("");
  }
  function iconFor(t) {
    if (t.jenis==="Masuk") return "↙";
    const c = String(t.kategori||"").toLowerCase();
    if (c.includes("makan")) return "♨";
    if (c.includes("transport")) return "↗";
    if (c.includes("belanja")) return "▤";
    if (c.includes("tagihan")) return "▣";
    return "•";
  }
  function rowHTML(t) {
    const incoming = t.jenis === "Masuk";
    return `<div class="transaction-row"><div class="transaction-name"><span class="transaction-symbol ${incoming?"":"out"}">${iconFor(t)}</span><span><b>${safe(t.keterangan||t.kategori||"Transaksi")}</b><small>${safe(t.dompet||"Tunai")}</small></span></div><div class="transaction-date">${fmtDate(t.tanggal)}</div><div class="transaction-amount ${incoming?"in":"out"}">${incoming?"+":"−"}${money(t.nominal)}</div></div>`;
  }
  function renderRecent() {
    const rows = [...transactions].sort((a,b)=>String(b.tanggal||"").localeCompare(String(a.tanggal||""))).slice(0,5);
    $("recent-list").innerHTML = rows.length ? rows.map(rowHTML).join("") : '<div class="empty-state">Belum ada transaksi. Mulai dengan menambahkan transaksi pertamamu.</div>';
  }
  function updateCategoryFilter() {
    const sel = $("category-filter"); if (!sel) return;
    const old = sel.value;
    const cats = [...new Set(transactions.map(t=>t.kategori).filter(Boolean))].sort();
    sel.innerHTML = '<option value="all">Semua kategori</option>' + cats.map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join("");
    if (cats.includes(old)) sel.value=old;
  }
  function renderTable() {
    const query = ($("search-input")?.value||"").toLowerCase().trim();
    const type = $("type-filter")?.value||"all";
    const cat = $("category-filter")?.value||"all";
    const rows = [...transactions].filter(t => {
      const hay = `${t.keterangan||""} ${t.kategori||""} ${t.dompet||""}`.toLowerCase();
      return (!query||hay.includes(query)) && (type==="all"||t.jenis===type) && (cat==="all"||t.kategori===cat);
    }).sort((a,b)=>String(b.tanggal||"").localeCompare(String(a.tanggal||"")));
    $("transactions-body").innerHTML = rows.length ? rows.map(t => `<tr><td><div class="transaction-name"><span class="transaction-symbol ${t.jenis==="Masuk"?"":"out"}">${iconFor(t)}</span><span><b>${safe(t.keterangan||t.kategori||"Transaksi")}</b><small>${safe(t.dompet||"Tunai")}</small></span></div></td><td>${fmtDate(t.tanggal)}</td><td>${safe(t.kategori||"Lainnya")}</td><td>${safe(t.metode||"Manual")}</td><td style="color:${t.jenis==="Masuk"?"#159460":"#33433a"}">${t.jenis==="Masuk"?"+":"−"}${money(t.nominal)}</td></tr>`).join("") : '<tr><td colspan="5" class="empty-state">Tidak ada transaksi yang cocok.</td></tr>';
    $("transaction-count").textContent = `${rows.length} transaksi`;
  }
  function go(view) {
    document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id===`view-${view}`));
    document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
    const titles={dashboard:"Ringkasan",transactions:"Transaksi",add:"Tambah transaksi",tools:"Input pintar"};
    $("page-title").textContent=titles[view]||"FinSaku";
    if (view==="transactions") renderTable();
    window.scrollTo({top:0,behavior:"smooth"});
  }
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.goto)));
  $("date-chip").textContent = new Date().toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
  $("today-label").textContent = new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase();
  $("date").value = isoToday();
  $("period-select").addEventListener("change",renderAll);
  ["search-input","type-filter","category-filter"].forEach(id=>$(id).addEventListener("input",renderTable));
  $("refresh-btn").addEventListener("click",()=>loadTransactions(true));

  document.querySelectorAll(".type-choice").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".type-choice").forEach(b=>b.classList.toggle("selected",b===btn));
    $("form-type").value=btn.dataset.type;
  }));
  $("transaction-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const payload={
      tanggal:$("date").value,jenis:$("form-type").value,kategori:$("category").value,
      nominal:Number($("amount").value),dompet:$("wallet").value,
      keterangan:$("description").value.trim()||$("category").value
    };
    if (!payload.nominal || payload.nominal<=0) return toast("Masukkan nominal yang valid.",true);
    busy(true,"Menyimpan transaksi…");
    try {
      await request("manual",payload);
      $("transaction-form").reset(); $("date").value=isoToday();
      document.querySelectorAll(".type-choice").forEach(b=>b.classList.toggle("selected",b.dataset.type==="Keluar"));
      $("form-type").value="Keluar";
      await loadTransactions(false); go("transactions"); toast("Transaksi berhasil disimpan ke Google Sheets.");
    } catch(err) { toast(err.message,true); }
    finally { busy(false); }
  });
  $("reset-form").addEventListener("click",()=>setTimeout(()=>{$("date").value=isoToday();},0));

  $("receipt-file").addEventListener("change",e=>{
    const file=e.target.files[0]; selectedReceipt=null; $("receipt-btn").disabled=true;
    if (!file) { $("receipt-preview").innerHTML=""; return; }
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) { toast("Gunakan foto JPG, PNG, atau WebP.",true); e.target.value=""; return; }
    if (file.size>3*1024*1024) { toast("Ukuran foto maksimal 3 MB.",true); e.target.value=""; return; }
    const reader=new FileReader();
    reader.onload=()=>{selectedReceipt={base64:String(reader.result).split(",")[1],mime:file.type};$("receipt-preview").innerHTML=`<img src="${reader.result}" alt="Pratinjau struk"><div>${safe(file.name)}</div>`;$("receipt-btn").disabled=false;};
    reader.readAsDataURL(file);
  });
  $("receipt-btn").addEventListener("click",async()=>{
    if (!selectedReceipt) return;
    busy(true,"Membaca foto struk dengan AI…");
    try {
      const result=await request("receipt",{image_base64:selectedReceipt.base64,mime_type:selectedReceipt.mime});
      await loadTransactions(false); toast(`Struk tersimpan: ${money(result.data.nominal)} · ${result.data.kategori}`); go("transactions");
      $("receipt-file").value="";$("receipt-preview").innerHTML="";selectedReceipt=null;$("receipt-btn").disabled=true;
    } catch(err) { toast(err.message,true); }
    finally { busy(false); }
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  $("voice-start").addEventListener("click",()=>{
    if (!SpeechRecognition) { toast("Pengenalan suara tidak tersedia di browser ini. Ketik catatan secara manual.",true); return; }
    if (recognition) { recognition.stop(); recognition=null; return; }
    recognition=new SpeechRecognition(); recognition.lang="id-ID"; recognition.interimResults=true; recognition.continuous=false;
    $("voice-status").textContent="Mendengarkan…"; $("voice-help").textContent="Ucapkan transaksi dengan jelas.";
    $("voice-start").textContent="■ Berhenti";
    recognition.onresult=e=>{let text="";for(let i=e.resultIndex;i<e.results.length;i++)text+=e.results[i][0].transcript;$("voice-text").value=text;};
    recognition.onerror=e=>{toast("Pengenalan suara: "+e.error,true);};
    recognition.onend=()=>{recognition=null;$("voice-status").textContent="Selesai mendengarkan";$("voice-help").textContent="Periksa teks sebelum diproses.";$("voice-start").textContent="● Mulai rekam";};
    recognition.start();
  });
  $("voice-btn").addEventListener("click",async()=>{
    const text=$("voice-text").value.trim(); if(!text)return toast("Isi atau rekam catatan suara terlebih dahulu.",true);
    busy(true,"Mengubah catatan menjadi transaksi…");
    try {
      const result=await request("voice",{text});
      await loadTransactions(false); toast(`Transaksi tersimpan: ${money(result.data.nominal)} · ${result.data.kategori}`); go("transactions");
      $("voice-text").value="";
    } catch(err) { toast(err.message,true); }
    finally { busy(false); }
  });

  loadTransactions(false);
})();
