# SafeMedia PWA

واجهة PWA بملفات مسطحة (جاهزة لـ GitHub Pages): `index.html` · `style.css` · `script.js` · `sw.js` · `manifest.json` + أيقونات.

## النشر على GitHub Pages
1. ارفع كل الملفات إلى جذر مستودع GitHub.
2. Settings → Pages → اختر الفرع `main` والمجلد `/ (root)`.
3. افتح الرابط من الهاتف واختر «تثبيت التطبيق».

## الوضع التجريبي والسيرفر
- بدون سيرفر: تعمل الواجهة كاملة (رفع، إعدادات، محرر، حفظ أوفلاين) لكن الناتج هو الملف الأصلي.
- للمعالجة الفعلية: انشر `server_example.py` (يحتاج استكمال دوال الذكاء الاصطناعي) ثم ضع عنوانه في `API_BASE` داخل `script.js`.

## عقد الـ API
| الطريقة | المسار | الوظيفة |
|---|---|---|
| POST | /uploads/init | بدء رفع مجزأ → `upload_id` |
| PUT | /uploads/{id}/chunk?index=N | رفع جزء |
| POST | /uploads/{id}/complete | دمج الأجزاء |
| POST | /jobs | `{upload_id أو url, options, preview}` → `job_id` |
| GET | /jobs/{id} | `{status, progress, stage, result_url, segments, duration, subtitles_url}` |
| POST | /jobs/{id}/edits | `{segments:[{start,end,type}]}` لإعادة التصدير |

## ملاحظات
- GitHub Pages يستضيف الواجهة فقط؛ المعالجة تحتاج سيرفراً (يفضّل GPU).
- خدمة العمل بدون إنترنت تتطلب HTTPS (متوفر في GitHub Pages).
- Safari قد يمسح IndexedDB؛ احتفظ دائماً بنسخة عبر «تنزيل للجهاز».
- تأكد من حقوق استخدام المحتوى قبل تحميله عبر الروابط.
