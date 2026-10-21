# Pure Audio PWA

ملفات مسطحة (Flat) جاهزة لـ GitHub Pages: `index.html` · `style.css` · `script.js` · `sw.js` · `manifest.json` + `logo.png` + `icon*.png`.

## النشر
1. ارفع كل الملفات إلى جذر المستودع، ثم Settings → Pages → فرع `main` والمجلد `/ (root)`.
2. أضف صورة `qr.png` في الجذر (إن لم توجد يولّد التطبيق رمز QR تلقائياً من رابط الموقع).
3. افتح الرابط على الهاتف: زر «تثبيت» (أندرويد/كمبيوتر) يطلب التثبيت من المتصفح، وعلى الآيفون اتبع شرح Safari داخل التطبيق.

## الأمان
- CSP عبر وسم meta (تحقق منها من CSP داخل index.html). ملاحظة: `frame-ancestors` لا تعمل عبر meta، وGitHub Pages لا يتيح ترويسات مخصصة.
- لا `eval` ولا `innerHTML`؛ كل النصوص تُعرض بـ textContent بعد التعقيم، والروابط تُقبل http/https فقط.
- المحفوظات مشفّرة AES-256-GCM بمفتاح غير قابل للتصدير داخل IndexedDB. هذا يحمي الملفات من الاطلاع المباشر على القرص، لكنه لا يحمي من سكربت خبيث يعمل داخل الصفحة نفسها، لذلك أبقينا CSP صارمة.
- عند ضبط `API_BASE` أضف عنوان السيرفر إلى `connect-src` في CSP.

## السيرفر
`server_example.py` هيكل FastAPI فقط (دوال YOLO/Demucs/Whisper/FFmpeg مكتوبة كـ TODO). عقد الـ API: `/uploads/init` · `/uploads/{id}/chunk` · `/uploads/{id}/complete` · `/jobs` · `/jobs/{id}` · `/jobs/{id}/edits`.
