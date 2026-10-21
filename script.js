/* =====================================================================
   SafeMedia – منطق الواجهة (script.js)
   ---------------------------------------------------------------------
   الأقسام:
   1) الإعدادات والمتغيرات العامة
   2) أدوات مساعدة (Toast، تبويبات، حالة الاتصال)
   3) تثبيت PWA وتسجيل Service Worker
   4) التخزين المحلي IndexedDB
   5) التواصل مع السيرفر (رفع مجزأ + متابعة المهمة)
   6) الوضع التجريبي (بدون سيرفر)
   7) عرض النتيجة والمحرر اليدوي
   8) المكتبة المحفوظة
   ===================================================================== */

/* ---------- 1) الإعدادات ---------- */
// ضع هنا عنوان سيرفر المعالجة (مثال: "https://api.example.com").
// اتركه فارغاً لتشغيل الوضع التجريبي.
const API_BASE = "";
const CHUNK_SIZE = 5 * 1024 * 1024; // حجم الجزء الواحد عند الرفع المجزأ (5MB)

const $ = (id) => document.getElementById(id);
const state = {
  file: null,          // الملف المرفوع
  jobId: null,         // معرّف مهمة المعالجة
  resultBlob: null,    // الناتج النهائي
  resultName: "safemedia-output",
  segments: [],        // مقاطع التعديل [{start,end,type}]
  duration: 60,        // مدة الوسائط بالثواني (للشريط الزمني)
};

/* ---------- 2) أدوات مساعدة ---------- */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 3000);
}

// تبديل تبويبي (رفع / رابط)
document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $("tab-upload").classList.toggle("hidden", btn.dataset.tab !== "upload");
    $("tab-url").classList.toggle("hidden", btn.dataset.tab !== "url");
  })
);

// عرض قيمة شريط شدة التغطية
$("blurLevel").addEventListener("input", (e) => ($("blurVal").textContent = e.target.value));

// حالة الاتصال
function updateOnline() { $("offlineBar").classList.toggle("hidden", navigator.onLine); }
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);
updateOnline();

// اختيار الملف (نقر أو سحب وإفلات)
function setFile(f) {
  if (!f) return;
  state.file = f;
  $("fileName").textContent = "✔ " + f.name + " (" + (f.size / 1048576).toFixed(1) + " MB)";
  $("fileName").classList.remove("hidden");
}
$("fileInput").addEventListener("change", (e) => setFile(e.target.files[0]));
const dz = $("dropzone");
["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

/* ---------- 3) تثبيت PWA ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").classList.remove("hidden");
});
$("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").classList.add("hidden");
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.error));
}

/* ---------- 4) IndexedDB ---------- */
const DB_NAME = "safemedia", STORE = "media";
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbOp(mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  });
}
const dbAdd = (item) => dbOp("readwrite", (s) => s.add(item));
const dbAll = () => dbOp("readonly", (s) => s.getAll());
const dbGet = (id) => dbOp("readonly", (s) => s.get(id));
const dbDel = (id) => dbOp("readwrite", (s) => s.delete(id));

/* ---------- 5) السيرفر ---------- */
// قراءة الإعدادات من الواجهة
function readOptions() {
  return {
    video_blur: $("optVideo").checked,
    text_blur: $("optText").checked,
    remove_music: $("optMusic").checked,
    profanity_mute: $("optProfanity").checked,
    subtitles: $("optSubs").checked,
    cover_type: document.querySelector('input[name="coverType"]:checked').value,
    blur_level: +$("blurLevel").value,
    music_replace: $("musicReplace").value,
    quality: $("quality").value,
  };
}

function setProgress(pct, text) {
  $("barFill").style.width = pct + "%";
  $("barPct").textContent = Math.round(pct) + "%";
  if (text) $("stageText").textContent = text;
}

// رفع مجزأ: init -> chunks -> complete
async function chunkedUpload(file) {
  const init = await fetch(API_BASE + "/uploads/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, type: file.type }),
  }).then((r) => r.json());
  const total = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < total; i++) {
    const part = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    // إعادة المحاولة 3 مرات لكل جزء (استئناف عند انقطاع الشبكة)
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await fetch(`${API_BASE}/uploads/${init.upload_id}/chunk?index=${i}`, { method: "PUT", body: part });
        if (!r.ok) throw new Error("chunk failed");
        break;
      } catch (e) { if (attempt >= 3) throw e; await new Promise((r) => setTimeout(r, 1500 * attempt)); }
    }
    setProgress((i + 1) / total * 30, "رفع الملف…");
  }
  await fetch(`${API_BASE}/uploads/${init.upload_id}/complete`, { method: "POST" });
  return init.upload_id;
}

async function startJob(preview) {
  const urlMode = !$("tab-url").classList.contains("hidden");
  const url = $("urlInput").value.trim();
  if (urlMode && !url) return toast("أدخل الرابط أولاً");
  if (!urlMode && !state.file) return toast("اختر ملفاً أولاً");

  $("progressCard").classList.remove("hidden");
  $("resultCard").classList.add("hidden");
  setProgress(0, "تجهيز…");
  setBusy(true);

  try {
    if (!API_BASE) await demoJob(preview);
    else await realJob(preview, urlMode, url);
  } catch (e) {
    console.error(e);
    toast("حدث خطأ: " + e.message);
  } finally {
    setBusy(false);
    $("progressCard").classList.add("hidden");
  }
}

async function realJob(preview, urlMode, url) {
  const body = { options: readOptions(), preview };
  if (urlMode) body.url = url;
  else body.upload_id = await chunkedUpload(state.file);

  const job = await fetch(API_BASE + "/jobs", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then((r) => r.json());
  state.jobId = job.job_id;
  await pollJob();
}

// متابعة حالة المهمة كل ثانيتين
async function pollJob() {
  while (true) {
    const j = await fetch(`${API_BASE}/jobs/${state.jobId}`).then((r) => r.json());
    setProgress(30 + (j.progress || 0) * 0.7, j.stage || "معالجة…");
    if (j.status === "failed") throw new Error(j.error || "فشلت المعالجة");
    if (j.status === "done") {
      const blob = await fetch(API_BASE + j.result_url).then((r) => r.blob());
      state.segments = j.segments || [];
      state.duration = j.duration || 60;
      showResult(blob, state.file ? state.file.name : "download", j.subtitles_url);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/* ---------- 6) الوضع التجريبي ---------- */
async function demoJob(preview) {
  const stages = ["تحميل الملف", "كشف الأشخاص (YOLO)", "تشويش المناطق", "عزل الصوت (Demucs)", "دمج الناتج"];
  for (let i = 0; i < stages.length; i++) {
    for (let p = 0; p <= 100; p += 25) {
      setProgress((i + p / 100) / stages.length * 100, stages[i]);
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  if (!state.file) throw new Error("الوضع التجريبي يتطلب رفع ملف");
  state.duration = 60;
  state.segments = [{ start: 5, end: 12, type: "blur" }, { start: 30, end: 33, type: "mute" }];
  showResult(state.file, state.file.name, null, true);
}

/* ---------- 7) النتيجة والمحرر ---------- */
function showResult(blob, name, subsUrl, demo) {
  state.resultBlob = blob;
  state.resultName = "safemedia-" + name.replace(/\.[^.]+$/, "");
  const isAudio = (blob.type || "").startsWith("audio") || $("quality").value === "audio";
  const src = URL.createObjectURL(blob);
  $("player").innerHTML = `<${isAudio ? "audio" : "video"} controls playsinline src="${src}"></${isAudio ? "audio" : "video"}>`;
  const media = $("player").firstChild;
  media.addEventListener("loadedmetadata", () => { if (isFinite(media.duration)) { state.duration = media.duration; renderTimeline(); } });
  $("downloadLink").href = src;
  $("downloadLink").download = state.resultName + (isAudio ? ".mp3" : ".mp4");
  $("demoNote").classList.toggle("hidden", !demo);
  if (subsUrl) { $("subsLink").href = API_BASE + subsUrl; $("subsLink").classList.remove("hidden"); }
  else $("subsLink").classList.add("hidden");
  $("resultCard").classList.remove("hidden");
  renderTimeline();
  $("resultCard").scrollIntoView({ behavior: "smooth" });
}

// رسم الشريط الزمني
function renderTimeline() {
  const tl = $("timeline");
  tl.innerHTML = "";
  state.segments.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "seg " + s.type;
    el.style.left = (s.start / state.duration * 100) + "%";
    el.style.width = Math.max(1, (s.end - s.start) / state.duration * 100) + "%";
    el.title = `${s.type} ${s.start}–${s.end}ث (اضغط للحذف)`;
    el.onclick = () => { state.segments.splice(i, 1); renderTimeline(); };
    tl.appendChild(el);
  });
}

$("addSeg").addEventListener("click", () => {
  const start = +$("segStart").value, end = +$("segEnd").value;
  if (!(end > start)) return toast("المدى غير صحيح");
  state.segments.push({ start, end, type: $("segType").value });
  renderTimeline();
});

// إرسال التعديلات اليدوية للسيرفر لإعادة التصدير
$("applyEdits").addEventListener("click", async () => {
  if (!API_BASE) return toast("التعديل الفعلي يحتاج سيرفراً (الوضع التجريبي)");
  try {
    $("progressCard").classList.remove("hidden");
    setProgress(30, "تطبيق التعديلات…");
    await fetch(`${API_BASE}/jobs/${state.jobId}/edits`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segments: state.segments }),
    });
    await pollJob();
  } catch (e) { toast("خطأ: " + e.message); }
  $("progressCard").classList.add("hidden");
});

function setBusy(b) { $("processBtn").disabled = b; $("previewBtn").disabled = b; }
$("previewBtn").addEventListener("click", () => startJob(true));
$("processBtn").addEventListener("click", () => startJob(false));

/* ---------- 8) المكتبة المحفوظة ---------- */
$("saveOffline").addEventListener("click", async () => {
  if (!state.resultBlob) return;
  try {
    await dbAdd({ name: state.resultName, blob: state.resultBlob, type: state.resultBlob.type, date: Date.now() });
    toast("تم الحفظ للأوفلاين ✔");
    renderLibrary();
  } catch (e) { toast("تعذّر الحفظ (المساحة ممتلئة؟)"); }
});

async function renderLibrary() {
  const items = await dbAll();
  const ul = $("library");
  ul.innerHTML = "";
  $("libEmpty").classList.toggle("hidden", items.length > 0);
  items.reverse().forEach((it) => {
    const li = document.createElement("li");
    li.className = "lib-item";
    li.innerHTML = `<span class="truncate text-sm"><i class="fa-solid ${it.type.startsWith("audio") ? "fa-music" : "fa-film"} ml-1"></i>${it.name} <small class="text-slate-400">${(it.blob.size / 1048576).toFixed(1)}MB</small></span>
      <span class="flex gap-1"><button data-play="${it.id}"><i class="fa-solid fa-play"></i></button><button class="del" data-del="${it.id}"><i class="fa-solid fa-trash"></i></button></span>`;
    ul.appendChild(li);
  });
}
$("library").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.del) { await dbDel(+b.dataset.del); renderLibrary(); }
  if (b.dataset.play) {
    const it = await dbGet(+b.dataset.play);
    state.segments = []; state.jobId = null;
    showResult(it.blob, it.name);
  }
});
renderLibrary();
