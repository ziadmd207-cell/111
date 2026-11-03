# ZEUS — رفيقك الذكي في رحلة التعلّم

## الاختبارات

- اختبارات الواجهة: `npm test`
- فحص التنسيق: `npm run lint`
- بناء الإنتاج: `npm run build`
- اختبارات المتصفح الحية: `npm run test:e2e`

لتشغيل اختبارات المتصفح، شغّل الواجهة وواجهة API على قاعدة بيانات اختبارية معزولة، واضبط `VITE_API_PROXY_TARGET` لعنوان الـAPI و`E2E_ADMIN_EMAIL` و`E2E_ADMIN_PASSWORD` لحساب مدير الاختبار. عند غياب Chromium، ثبّته باستخدام `npx playwright install chromium`.
