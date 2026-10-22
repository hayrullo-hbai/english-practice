# English Practice

Inglizcha savollar orqali yozma mashq qilish uchun Docker Compose ilovasi. Frontend minimalist, mobilga mos HTML/CSS/JavaScript; backend FastAPI, ma’lumotlar bazasi PostgreSQL.

## Ishga tushirish

```bash
cp .env.example .env
docker compose up --build
```

Ilova `http://localhost:8080`, API hujjatlari `http://localhost:8000/docs` manzilida ochiladi. To‘xtatish uchun `docker compose down` buyrug‘ini ishlating. Ma’lumotlar `postgres_data` nomli Docker volume’da saqlanadi.

## Hozirgi imkoniyatlar

- Savol, javob, hint va boshlang‘ich bosqich kiritish, tahrirlash hamda o‘chirish.
- Mashq boshlashdan oldin 1-, 2- yoki 3-bosqichni tanlash; har safar faqat tanlangan bosqich savollarini olish.
- Savolni tasodifiy tanlab, matn ko‘rinishida ko‘rsatish yoki brauzer orqali inglizcha ovozda eshittirish.
- 3-bosqich savollarini faqat audio orqali berish.
- Javobni uch urinishgacha tekshirish; ikkinchi xatodan keyin hint, uchinchi xatodan so‘ng javobni ko‘rsatish.
- Savol bo‘yicha ball yig‘ish, bosqich almashtirish va chegaralarni sozlash.
- Dashboardda 7 kun, 30 kun yoki barcha vaqt bo‘yicha natijalar, savollar va mashq vaqtining o‘sish grafiklari, kunlik Growth Trend taqqoslashlari, faol kunlar hamda o‘rtacha javob tezligini ko‘rish. Barcha vaqt ko‘rinishi jadvalni oylar bo‘yicha jamlaydi.

Dashboard faol vaqtni mashq oynasi ko‘rinib turgan paytda o‘lchaydi. Vaqt kuzatuvi yangi mashqlardan boshlab ishlaydi; oldingi urinishlarda vaqt ma’lumoti saqlanmagan. Javoblar katta-kichik harf va tinish belgilari hamda bo‘shliqlar farqini hisobga olmasdan solishtiriladi; sinonimlar hozircha qo‘llanmaydi. Audio sintezi brauzerning Web Speech imkoniyatiga bog‘liq.
