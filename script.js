/* =====================================================================
   Pure Audio – منطق التطبيق (script.js)
   ---------------------------------------------------------------------
   1) الإعدادات والأدوات الآمنة (بدون innerHTML / eval)
   2) المقدمة السينمائية
   3) التنقل بين الأقسام
   4) الإعدادات المحفوظة
   5) التثبيت (PWA) والمشاركة وQR
   6) التخزين المشفّر (IndexedDB + AES-GCM)
   7) المعالجة (سيرفر / وضع تجريبي)
   8) النتيجة والمحرر اليدوي والمحفوظات
   9) تسجيل Service Worker
   ===================================================================== */
"use strict";

/* ---------- 1) الإعدادات والأدوات ---------- */
// عنوان سيرفر المعالجة (فارغ = وضع تجريبي). عند ضبطه أضفه إلى connect-src في CSP داخل index.html.
const API_BASE = "";
const CHUNK_SIZE = 5 * 1024 * 1024;
const $ = (id) => document.getElementById(id);
const state = { file: null, jobId: null, resultBlob: null, resultName: "pure-audio", segments: [], duration: 60, objUrl: null };

// تعقيم النص: إزالة محارف التحكم وقصّه (يُعرض دائماً عبر textContent وليس innerHTML)
const clean = (s, max = 120) => String(s ?? "").replace(/[\u0000-\u001f\u007f<>"'`]/g, "").trim().slice(0, max);
// السماح فقط بروابط http/https
function safeUrl(u) {
  try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
}
// بناء عناصر DOM بأمان
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v; else if (k === "text") n.textContent = v; else n.setAttribute(k, v);
  }
  kids.forEach((c) => c && n.append(c));
  return n;
}
// أيقونة من الـ sprite المدمج
function icon(id, cls = "") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("class", "ico " + cls);
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "#" + id); s.append(u); return s;
}
function toast(msg) {
  const t = $("toast"); t.textContent = clean(msg, 160); t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), 3200);
}
// معالجة آمنة للأخطاء: تفاصيل للمطوّر فقط، رسالة عامة للمستخدم
function fail(e, userMsg = "حدث خطأ غير متوقع، حاول مرة أخرى") { console.warn("[PureAudio]", e && e.name); toast(userMsg); }

/* ---------- 2) المقدمة السينمائية ---------- */
function runIntro(force) {
  const intro = $("intro");
  if (!force && sessionStorage.getItem("introSeen")) { intro.remove(); return; }
  intro.classList.remove("out"); intro.style.display = "";
  document.querySelectorAll(".intro *").forEach((n) => { n.style.animation = "none"; void n.offsetWidth; n.style.animation = ""; });
  const done = () => { intro.classList.add("out"); sessionStorage.setItem("introSeen", "1"); setTimeout(() => { intro.style.display = "none"; }, 900); };
  clearTimeout(runIntro._t); runIntro._t = setTimeout(done, 4200);
  $("introSkip").onclick = () => { clearTimeout(runIntro._t); done(); };
}

/* ---------- 3) التنقل ---------- */
function go(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === view));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.go === view));
  window.scrollTo({ top: 0 });
  if (view === "library") renderLibrary();
}
document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));

document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active")); btn.classList.add("active");
  $("tab-upload").classList.toggle("hidden", btn.dataset.tab !== "upload");
  $("tab-url").classList.toggle("hidden", btn.dataset.tab !== "url");
}));
$("blurLevel").addEventListener("input", (e) => ($("blurVal").textContent = e.target.value));
function updateOnline() { $("offlineBar").classList.toggle("hidden", navigator.onLine); }
addEventListener("online", updateOnline); addEventListener("offline", updateOnline); updateOnline();

function setFile(f) {
  if (!f) return;
  if (!/^(video|audio)\//.test(f.type) && !/\.(mp4|mov|mp3|wav|m4a)$/i.test(f.name)) return toast("نوع الملف غير مدعوم");
  state.file = f;
  const p = $("fileName"); p.textContent = "✔ " + clean(f.name) + " (" + (f.size / 1048576).toFixed(1) + " MB)"; p.classList.remove("hidden");
}
$("fileInput").addEventListener("change", (e) => setFile(e.target.files[0]));
const dz = $("dropzone");
["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

/* ---------- 4) الإعدادات المحفوظة (غير حساسة فقط) ---------- */
const PREF_KEY = "pa_prefs";
const prefIds = ["optVideo", "optText", "optMusic", "optProfanity", "optSubs", "blurLevel", "musicReplace", "quality"];
function loadPrefs() {
  let p = {}; try { p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { /* تجاهل */ }
  prefIds.forEach((id) => { if (id in p) { const e = $(id); if (e.type === "checkbox") e.checked = !!p[id]; else e.value = p[id]; } });
  if (p.cover) { const r = document.querySelector(`input[name="coverType"][value="${clean(p.cover, 10)}"]`); if (r) r.checked = true; }
  $("blurVal").textContent = $("blurLevel").value;
  $("setSaveDefaults").checked = p.save !== false;
  $("setReduceMotion").checked = !!p.reduce;
  document.documentElement.classList.toggle("reduce-motion", !!p.reduce);
}
function savePrefs() {
  const p = { save: $("setSaveDefaults").checked, reduce: $("setReduceMotion").checked };
  if (p.save) {
    prefIds.forEach((id) => { const e = $(id); p[id] = e.type === "checkbox" ? e.checked : e.value; });
    p.cover = document.querySelector('input[name="coverType"]:checked').value;
  }
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* تجاهل */ }
  document.documentElement.classList.toggle("reduce-motion", p.reduce);
}
document.querySelectorAll("#view input, [data-view] input, [data-view] select").forEach((e) => e.addEventListener("change", savePrefs));
loadPrefs();
$("replayIntro").addEventListener("click", () => { go("home"); runIntro(true); });

/* ---------- 5) التثبيت والمشاركة وQR ---------- */
const ua = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
let deferredPrompt = null;

function refreshInstallUI() {
  const btn = $("installBtn"), label = $("installLabel"), msg = $("installMsg");
  if (isStandalone()) { btn.disabled = true; label.textContent = "التطبيق مثبّت ✔"; msg.textContent = "أنت تستخدم التطبيق المثبّت الآن."; $("installTop").classList.add("hidden"); return; }
  btn.disabled = false; label.textContent = "تثبيت التطبيق";
  msg.textContent = deferredPrompt ? "اضغط الزر وسيطلب المتصفح تأكيد التثبيت." : isIOS ? "على الآيفون يتم التثبيت من Safari يدوياً — اتبع الخطوات أدناه." : "إن لم تظهر نافذة التثبيت اتبع الخطوات أدناه.";
}
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("installTop").classList.remove("hidden"); refreshInstallUI(); });
addEventListener("appinstalled", () => { deferredPrompt = null; toast("تم تثبيت التطبيق ✔"); refreshInstallUI(); });

async function doInstall() {
  if (deferredPrompt) {                       // أندرويد / كمبيوتر: يطلب التثبيت من المتصفح مباشرة
    try { deferredPrompt.prompt(); const r = await deferredPrompt.userChoice; if (r.outcome === "accepted") toast("جارٍ التثبيت…"); }
    catch (e) { fail(e); }
    deferredPrompt = null; $("installTop").classList.add("hidden"); refreshInstallUI(); return;
  }
  go("install");                              // iOS أو متصفح لا يدعم: نفتح الشرح المناسب
  const g = isIOS ? "g-ios" : /android/i.test(ua) ? "g-android" : "g-pc";
  document.querySelectorAll(".guide").forEach((d) => (d.open = d.id === g));
  toast(isIOS ? "اتبع خطوات آيفون أدناه" : "اتبع خطوات التثبيت أدناه");
}
$("installBtn").addEventListener("click", doInstall);
$("installTop").addEventListener("click", doInstall);
refreshInstallUI();
document.getElementById(isIOS ? "g-ios" : /android/i.test(ua) ? "g-android" : "g-pc").open = true;

// رابط التطبيق للمشاركة (بدون hash أو معاملات)
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, "");
$("shareBtn").addEventListener("click", async () => {
  const data = { title: "Pure Audio", text: "جرّب تطبيق Pure Audio لتنقية الفيديو والصوت", url: appUrl() };
  if (navigator.share) { try { await navigator.share(data); } catch (e) { if (e.name !== "AbortError") fail(e); } }
  else copyLink();
});
async function copyLink() {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(appUrl());
    else { const t = el("textarea", { readonly: "" }); t.value = appUrl(); t.style.cssText = "position:fixed;opacity:0"; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
    toast("تم نسخ الرابط ✔");
  } catch (e) { fail(e, "تعذّر النسخ، انسخ الرابط يدوياً"); }
}
$("copyBtn").addEventListener("click", copyLink);

// QR: نستخدم qr.png إن وُجدت، وإلا نولّد رمزاً تلقائياً من رابط الموقع
$("qrImg").addEventListener("error", () => {
  $("qrImg").classList.add("hidden");
  const box = $("qrFallback"); box.classList.remove("hidden");
  try { new QRCode(box, { text: appUrl(), width: 200, height: 200, colorDark: "#0b4ea2", colorLight: "#ffffff" }); }
  catch { box.textContent = "ضع الصورة qr.png في المسار الرئيسي"; }
});
if ($("qrImg").complete && $("qrImg").naturalWidth === 0) $("qrImg").dispatchEvent(new Event("error"));

/* ---------- 6) التخزين المشفّر ---------- */
const DB_NAME = "pureaudio";
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("media", { keyPath: "id", autoIncrement: true }); r.result.createObjectStore("keys"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbOp(store, mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode); const req = fn(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); res(req.result); }; tx.onerror = () => { db.close(); rej(tx.error); };
  });
}
// مفتاح AES-256 غير قابل للتصدير يُخزَّن داخل IndexedDB نفسها
async function getKey() {
  if (!(window.crypto && crypto.subtle)) throw new Error("no-crypto");
  let k = await dbOp("keys", "readonly", (s) => s.get("main"));
  if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await dbOp("keys", "readwrite", (s) => s.put(k, "main")); }
  return k;
}
async function encryptBlob(blob) {
  const key = await getKey(), iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await blob.arrayBuffer());
  return { iv, data };
}
async function decryptItem(it) {
  const key = await getKey();
  return new Blob([await crypto.subtle.decrypt({ name: "AES-GCM", iv: it.iv }, key, it.data)], { type: it.type });
}

/* ---------- 7) المعالجة ---------- */
function readOptions() {
  return { video_blur: $("optVideo").checked, text_blur: $("optText").checked, remove_music: $("optMusic").checked,
    profanity_mute: $("optProfanity").checked, subtitles: $("optSubs").checked,
    cover_type: document.querySelector('input[name="coverType"]:checked').value, blur_level: +$("blurLevel").value,
    music_replace: $("musicReplace").value, quality: $("quality").value };
}
function setProgress(pct, text) {
  $("barFill").style.width = Math.max(0, Math.min(100, pct)) + "%"; $("barPct").textContent = Math.round(pct) + "%";
  if (text) $("stageText").textContent = clean(text, 80);
}
const setBusy = (b) => { $("processBtn").disabled = b; $("previewBtn").disabled = b; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chunkedUpload(file) {
  const init = await fetch(API_BASE + "/uploads/init", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: clean(file.name), size: file.size, type: file.type }) }).then((r) => r.json());
  const total = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < total; i++) {
    const part = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    for (let a = 1; ; a++) {                       // إعادة المحاولة لكل جزء (استئناف)
      try { const r = await fetch(`${API_BASE}/uploads/${encodeURIComponent(init.upload_id)}/chunk?index=${i}`, { method: "PUT", body: part }); if (!r.ok) throw new Error("chunk"); break; }
      catch (e) { if (a >= 3) throw e; await sleep(1500 * a); }
    }
    setProgress(((i + 1) / total) * 30, "رفع الملف…");
  }
  await fetch(`${API_BASE}/uploads/${encodeURIComponent(init.upload_id)}/complete`, { method: "POST" });
  return init.upload_id;
}

async function startJob(preview) {
  const urlMode = !$("tab-url").classList.contains("hidden");
  const url = safeUrl($("urlInput").value);
  if (urlMode && !url) return toast("أدخل رابطاً صحيحاً يبدأ بـ https://");
  if (!urlMode && !state.file) return toast("اختر ملفاً أولاً");
  $("progressCard").classList.remove("hidden"); $("resultCard").classList.add("hidden"); setProgress(0, "تجهيز…"); setBusy(true);
  try { if (!API_BASE) await demoJob(preview); else await realJob(preview, urlMode, url); }
  catch (e) { fail(e, "تعذّرت المعالجة، تحقق من الاتصال وحاول مجدداً"); }
  finally { setBusy(false); $("progressCard").classList.add("hidden"); }
}
async function realJob(preview, urlMode, url) {
  const body = { options: readOptions(), preview };
  if (urlMode) body.url = url; else body.upload_id = await chunkedUpload(state.file);
  const job = await fetch(API_BASE + "/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  state.jobId = job.job_id; await pollJob();
}
async function pollJob() {
  for (;;) {
    const j = await fetch(`${API_BASE}/jobs/${encodeURIComponent(state.jobId)}`).then((r) => r.json());
    setProgress(30 + (j.progress || 0) * 0.7, j.stage || "معالجة…");
    if (j.status === "failed") throw new Error("job-failed");
    if (j.status === "done") {
      const blob = await fetch(API_BASE + j.result_url).then((r) => r.blob());
      state.segments = (j.segments || []).map((s) => ({ start: +s.start || 0, end: +s.end || 0, type: s.type === "mute" ? "mute" : "blur" }));
      state.duration = +j.duration || 60;
      return showResult(blob, state.file ? state.file.name : "download", j.subtitles_url);
    }
    await sleep(2000);
  }
}
// وضع تجريبي بدون سيرفر
async function demoJob() {
  const stages = ["تحميل الملف", "كشف الأشخاص (YOLO)", "تشويش المناطق", "عزل الصوت (Demucs)", "دمج الناتج"];
  for (let i = 0; i < stages.length; i++) for (let p = 0; p <= 100; p += 25) { setProgress(((i + p / 100) / stages.length) * 100, stages[i]); await sleep(110); }
  if (!state.file) throw new Error("demo-needs-file");
  state.duration = 60; state.segments = [{ start: 5, end: 12, type: "blur" }, { start: 30, end: 33, type: "mute" }];
  showResult(state.file, state.file.name, null, true);
}

/* ---------- 8) النتيجة والمحرر والمحفوظات ---------- */
function showResult(blob, name, subsUrl, demo) {
  state.resultBlob = blob;
  state.resultName = "pure-audio-" + clean(name, 60).replace(/\.[^.]+$/, "").replace(/[^\w\u0600-\u06FF-]+/g, "_");
  const isAudio = (blob.type || "").startsWith("audio") || $("quality").value === "audio";
  if (state.objUrl) URL.revokeObjectURL(state.objUrl);
  state.objUrl = URL.createObjectURL(blob);
  const media = el(isAudio ? "audio" : "video", { controls: "", playsinline: "", src: state.objUrl });
  media.addEventListener("loadedmetadata", () => { if (isFinite(media.duration) && media.duration > 0) { state.duration = media.duration; renderTimeline(); } });
  $("player").replaceChildren(media);
  const dl = $("downloadLink"); dl.href = state.objUrl; dl.download = state.resultName + (isAudio ? ".mp3" : ".mp4");
  $("demoNote").classList.toggle("hidden", !demo);
  const sl = $("subsLink");
  const su = subsUrl && API_BASE ? safeUrl(API_BASE + subsUrl) : null;
  if (su) { sl.href = su; sl.classList.remove("hidden"); } else sl.classList.add("hidden");
  $("resultCard").classList.remove("hidden"); renderTimeline(); $("resultCard").scrollIntoView({ behavior: "smooth" });
}
function renderTimeline() {
  const tl = $("timeline"); tl.replaceChildren();
  state.segments.forEach((s, i) => {
    const b = el("button", { class: "seg " + s.type, type: "button", title: `${s.type} ${s.start}–${s.end}s — اضغط للحذف`, "aria-label": "حذف المقطع" });
    b.style.left = (s.start / state.duration) * 100 + "%"; b.style.width = Math.max(1, ((s.end - s.start) / state.duration) * 100) + "%";
    b.addEventListener("click", () => { state.segments.splice(i, 1); renderTimeline(); }); tl.append(b);
  });
}
$("addSeg").addEventListener("click", () => {
  const start = Math.max(0, +$("segStart").value), end = +$("segEnd").value;
  if (!(end > start)) return toast("المدى غير صحيح");
  state.segments.push({ start, end, type: $("segType").value === "mute" ? "mute" : "blur" }); renderTimeline();
});
$("applyEdits").addEventListener("click", async () => {
  if (!API_BASE) return toast("إعادة التصدير الفعلية تحتاج سيرفراً (الوضع التجريبي)");
  try {
    $("progressCard").classList.remove("hidden"); setProgress(30, "تطبيق التعديلات…");
    await fetch(`${API_BASE}/jobs/${encodeURIComponent(state.jobId)}/edits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segments: state.segments }) });
    await pollJob();
  } catch (e) { fail(e); }
  $("progressCard").classList.add("hidden");
});
$("previewBtn").addEventListener("click", () => startJob(true));
$("processBtn").addEventListener("click", () => startJob(false));

$("saveOffline").addEventListener("click", async () => {
  if (!state.resultBlob) return;
  try {
    const { iv, data } = await encryptBlob(state.resultBlob);
    await dbOp("media", "readwrite", (s) => s.add({ name: state.resultName, type: state.resultBlob.type, size: state.resultBlob.size, date: Date.now(), iv, data }));
    toast("تم الحفظ مشفّراً ✔"); renderLibrary();
  } catch (e) { fail(e, "تعذّر الحفظ (المساحة ممتلئة أو التشفير غير متاح)"); }
});
async function renderLibrary() {
  const ul = $("library"); ul.replaceChildren();
  let items = []; try { items = await dbOp("media", "readonly", (s) => s.getAll()); } catch (e) { fail(e); }
  $("libEmpty").classList.toggle("hidden", items.length > 0);
  items.reverse().forEach((it) => {
    const name = el("span", { class: "lib-name" }, icon(it.type.startsWith("audio") ? "i-music" : "i-film"), el("span", { text: clean(it.name, 50) }), el("small", { text: (it.size / 1048576).toFixed(1) + "MB" }));
    const play = el("button", { class: "icon-btn", type: "button", "aria-label": "تشغيل" }, icon("i-play"));
    const del = el("button", { class: "icon-btn del", type: "button", "aria-label": "حذف" }, icon("i-trash"));
    play.addEventListener("click", async () => { try { const b = await decryptItem(it); state.segments = []; state.jobId = null; go("home"); showResult(b, it.name); } catch (e) { fail(e, "تعذّر فك التشفير"); } });
    del.addEventListener("click", async () => { await dbOp("media", "readwrite", (s) => s.delete(it.id)); renderLibrary(); });
    ul.append(el("li", { class: "lib-item" }, name, el("span", { class: "lib-act" }, play, del)));
  });
}
// مسح كل البيانات المحلية
$("wipeData").addEventListener("click", async () => {
  if (!confirm("سيتم حذف كل المحفوظات والإعدادات. متابعة؟")) return;
  try {
    indexedDB.deleteDatabase(DB_NAME); localStorage.clear(); sessionStorage.clear();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    toast("تم مسح البيانات"); setTimeout(() => location.reload(), 900);
  } catch (e) { fail(e); }
});

/* ---------- 9) Service Worker ---------- */
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((e) => console.warn("[PureAudio] sw", e && e.name)));

runIntro(false);
