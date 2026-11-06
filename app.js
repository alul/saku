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

  function parseMoneyFromText(text) {
    const lines = String(text || "").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const totalKeys = /(grand\s*total|total\s*bayar|total|jumlah\s*bayar|jumlah|netto|amount\s*due|tunai|dibayar)/i;
    const candidates = [];
    lines.forEach((line, index) => {
      const nums = line.match(/(?:rp\.?\s*)?\d[\d.,]{1,}/gi) || [];
      nums.forEach(raw => {
        const digits = raw.replace(/[^0-9]/g, "");
        const value = Number(digits);
        if (value > 0) candidates.push({value, score:(totalKeys.test(line)?100:0) + Math.min(digits.length,8) + index/1000});
      });
    });
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]?.value || 0;
  }
  function guessCategory(text) {
    const s=String(text||"").toLowerCase();
    if(/makan|minum|resto|warung|cafe|kopi|bakso|ayam|mie/.test(s)) return "Makanan";
    if(/bensin|pertalite|pertamax|parkir|tol|ojek|grab|gojek|transport/.test(s)) return "Transportasi";
    if(/listrik|token|air|pdam|internet|wifi|pulsa|tagihan/.test(s)) return "Tagihan";
    if(/obat|klinik|dokter|apotek|rumah sakit/.test(s)) return "Kesehatan";
    return "Belanja";
  }
  function numberWordsToInt(text) {
    const words=String(text||"").toLowerCase().replace(/rupiah|rp|per|dan/g," ").trim().split(/\s+/);
    const n={nol:0,satu:1,se:1,dua:2,tiga:3,empat:4,lima:5, enam:6,tujuh:7,delapan:8,sembilan:9,sepuluh:10,sebelas:11};
    let total=0, group=0, found=false;
    for(let i=0;i<words.length;i++){
      const w=words[i];
      if(/^\d[\d.,]*$/.test(w)){ const v=Number(w.replace(/\./g,"").replace(/,/g,"")); if(v>0){group+=v;found=true;} continue; }
      if(n[w]!==undefined){group+=n[w];found=true;continue;}
      if(w==="belas"){group=(group||1)+10;found=true;continue;}
      if(w==="puluh"){group=(group||1)*10;found=true;continue;}
      if(w==="ratus"){group=(group||1)*100;found=true;continue;}
      if(w==="ribu"){total+=(group||1)*1000;group=0;found=true;continue;}
      if(w==="juta"){total+=(group||1)*1000000;group=0;found=true;continue;}
    }
    const value=total+group;
    return found && value>0 ? value : 0;
  }
  function voicePayload(text) {
    const s=String(text||"").toLowerCase();
    const income=/(pemasukan|gaji|terima|menerima|dapat uang|pendapatan|jualan laku)/.test(s);
    const amount=numberWordsToInt(s);
    let category="Lainnya";
    if(/makan|minum|kopi|sarapan|makan siang|makan malam/.test(s)) category="Makanan";
    else if(/bensin|parkir|tol|ojek|gojek|grab|transport/.test(s)) category="Transportasi";
    else if(/belanja|supermarket|minimarket|pasar/.test(s)) category="Belanja";
    else if(/listrik|air|internet|wifi|pulsa|tagihan/.test(s)) category="Tagihan";
    else if(/obat|dokter|klinik|apotek/.test(s)) category="Kesehatan";
    else if(/gaji/.test(s)) category="Gaji";
    return {tanggal:isoToday(),jenis:income?"Masuk":"Keluar",kategori:category,nominal:amount,dompet:"Tunai",keterangan:text.trim(),metode:"Catatan Suara"};
  }

  $("receipt-file").addEventListener("change",e=>{
    const file=e.target.files[0]; selectedReceipt=file||null; $("receipt-btn").disabled=!file; $("receipt-result").innerHTML="";
    if (!file) { $("receipt-preview").innerHTML=""; return; }
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) { toast("Gunakan foto JPG, PNG, atau WebP.",true); e.target.value=""; selectedReceipt=null; $("receipt-btn").disabled=true; return; }
    if (file.size>3*1024*1024) { toast("Ukuran foto maksimal 3 MB.",true); e.target.value=""; selectedReceipt=null; $("receipt-btn").disabled=true; return; }
    const reader=new FileReader();
    reader.onload=()=>{$("receipt-preview").innerHTML=`<img src="${reader.result}" alt="Pratinjau struk"><div>${safe(file.name)}</div>`;};
    reader.readAsDataURL(file);
  });
  $("receipt-btn").addEventListener("click",async()=>{
    if (!selectedReceipt) return;
    if (!window.Tesseract) return toast("Modul OCR belum termuat. Periksa koneksi internet lalu muat ulang.",true);
    busy(true,"Membaca teks struk secara lokal…");
    try {
      const result=await Tesseract.recognize(selectedReceipt,"ind",{logger:m=>{if(m.status==="recognizing text") $("busy-text").textContent=`Membaca struk… ${Math.round((m.progress||0)*100)}%`;}});
      const extracted=String(result.data.text||"").trim();
      if(!extracted) throw new Error("Tulisan pada foto belum terbaca. Coba foto lebih terang, fokus, dan tidak miring.");
      const amount=parseMoneyFromText(extracted);
      const lines=extracted.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      const desc=(lines.find(x=>/[a-zA-Z]{3,}/.test(x))||"Transaksi dari foto struk").slice(0,100);
      $("receipt-result").innerHTML=`<div class="panel" style="margin-top:12px;padding:14px"><b>Hasil pembacaan struk</b><label for="receipt-amount" style="display:block;margin-top:12px">Total (Rp)</label><input id="receipt-amount" type="number" min="1" value="${amount||""}" placeholder="Periksa nominal" style="width:100%;padding:10px;border:1px solid #dfe8e2;border-radius:8px;margin:6px 0 12px"><label for="receipt-desc">Keterangan</label><input id="receipt-desc" value="${safe(desc)}" style="width:100%;padding:10px;border:1px solid #dfe8e2;border-radius:8px;margin:6px 0 12px"><label for="receipt-ocr">Teks hasil OCR (boleh dikoreksi)</label><textarea id="receipt-ocr" rows="5" style="width:100%;padding:10px;border:1px solid #dfe8e2;border-radius:8px">${safe(extracted)}</textarea><button class="primary-btn full-btn" id="receipt-save" style="margin-top:10px">Simpan transaksi struk</button></div>`;
      $("receipt-save").addEventListener("click",async()=>{
        const nominal=Number($("receipt-amount").value);
        if(!nominal||nominal<=0) return toast("Nominal tidak terbaca. Isi total secara manual.",true);
        busy(true,"Menyimpan transaksi struk…");
        try { await request("manual",{tanggal:isoToday(),jenis:"Keluar",kategori:guessCategory($("receipt-ocr").value),nominal,dompet:"Tunai",keterangan:$("receipt-desc").value||"Transaksi dari struk",metode:"Foto Struk OCR"}); await loadTransactions(false); toast(`Struk tersimpan: ${money(nominal)}`); go("transactions"); $("receipt-file").value="";$("receipt-preview").innerHTML="";$("receipt-result").innerHTML="";selectedReceipt=null;$("receipt-btn").disabled=true; }
        catch(err){toast(err.message,true);} finally{busy(false);}
      });
      toast("Teks struk berhasil dibaca. Periksa nominal sebelum menyimpan.");
    } catch(err) { toast(err.message||String(err),true); }
    finally { busy(false); }
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  $("voice-start").addEventListener("click",()=>{
    if (!SpeechRecognition) { toast("Browser ini tidak mendukung pengenalan suara. Gunakan Chrome atau ketik catatan manual.",true); return; }
    if (recognition) { recognition.stop(); recognition=null; return; }
    recognition=new SpeechRecognition(); recognition.lang="id-ID"; recognition.interimResults=true; recognition.continuous=false;
    $("voice-status").textContent="Mendengarkan…"; $("voice-help").textContent="Ucapkan transaksi, misalnya: beli makan dua puluh lima ribu rupiah.";
    $("voice-start").textContent="■ Berhenti";
    recognition.onresult=e=>{let text="";for(let i=0;i<e.results.length;i++)text+=e.results[i][0].transcript;$("voice-text").value=text;};
    recognition.onerror=e=>{toast("Pengenalan suara: "+e.error,true);};
    recognition.onend=()=>{recognition=null;$("voice-status").textContent="Selesai mendengarkan";$("voice-help").textContent="Periksa teks dan nominal sebelum disimpan.";$("voice-start").textContent="● Mulai rekam";};
    try { recognition.start(); } catch(e) { toast("Tidak dapat memulai mikrofon. Periksa izin mikrofon dan gunakan HTTPS.",true); }
  });
  $("voice-btn").addEventListener("click",async()=>{
    const text=$("voice-text").value.trim(); if(!text)return toast("Isi atau rekam catatan suara terlebih dahulu.",true);
    const payload=voicePayload(text);
    if(!payload.nominal) return toast("Nominal belum terbaca. Ucapkan angka dengan jelas atau tulis nominal angka, misalnya 25000.",true);
    busy(true,"Menyimpan catatan suara…");
    try {
      await request("manual",payload);
      await loadTransactions(false); toast(`Transaksi tersimpan: ${money(payload.nominal)} · ${payload.kategori}`); go("transactions");
      $("voice-text").value="";
    } catch(err) { toast(err.message,true); }
    finally { busy(false); }
  });

  loadTransactions(false);
})();
