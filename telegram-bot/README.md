# 🤖 Can Ne Yedi? - Telegram Botu (Yapay Zeka Destekli)

Telefondan Telegram'a doğal dille yazdığınız yemekleri otomatik olarak Gemini AI ile analiz edip `data/meals.json` dosyasına ekleyen ve GitHub Pages sitenizi güncelleyen bot.

---

## ⚡ Gereken 3 Anahtar (Tamamen Ücretsiz)

1. **Telegram Bot Token:**
   - Telegram'da [@BotFather](https://t.me/botfather)'a gidin.
   - `/newbot` yazın, bir isim verin ve size verilen `HTTP API token`ı kopyalayın.

2. **Gemini API Key:**
   - [Google AI Studio](https://aistudio.google.com/app/apikey) adresine gidin.
   - "Create API Key" butonuna tıklayıp ücretsiz anahtarınızı alın.

3. **GitHub Token (Sadece Cloudflare Worker için):**
   - GitHub > Settings > Developer settings > Personal access tokens (classic).
   - `repo` yetkisi seçip token oluşturun.

---

## 🚀 Seçenek 1: Cloudflare Workers (Sunucusuz, 7/24 Açık & Ücretsiz)

Hiçbir bilgisayarı açık bırakmaya gerek kalmadan Cloudflare üzerinde ücretsiz çalışır.

### Adımlar:
1. [Cloudflare Dashboard](https://dash.cloudflare.com)'a giriş yapın.
2. **Workers & Pages** > **Create application** > **Create Worker** deyin.
3. Bir isim verin (örn: `can-ne-yedi-bot`) ve **Deploy**'a tıklayın.
4. **Edit code** butonuna basıp bu klasördeki [`worker.js`](worker.js) kodunu yapıştırın ve **Save and Deploy** deyin.
5. Worker sayfasında **Settings** > **Variables and Secrets** kısmına gelin ve şu Secret'ları ekleyin:
   - `TELEGRAM_BOT_TOKEN`: @BotFather'dan aldığınız token
   - `GITHUB_TOKEN`: GitHub Personal Access Token
   - `GEMINI_API_KEY`: Google AI Studio'dan aldığınız anahtar
   - `ALLOWED_CHAT_ID`: (Opsiyonel) Sadece sizin ekleme yapabilmeniz için kendi Telegram Chat ID'niz (öğrenmek için Telegram'da `@userinfobot`'a mesaj atabilirsiniz).
6. **Telegram Webhook Ayarlayın:**
   Tarayıcınızın adres çubuğuna şu linki yapıştırıp Enter'a basın:
   ```
   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<WORKER-ADRESINIZ>.workers.dev
   ```
   (`{"ok":true,"result":true,"description":"Webhook was set"}` cevabını görmelisiniz).

Bitti! Artık Telegram'dan botunuza ne yazarsanız anında sitenize eklenir.

---

## 💻 Seçenek 2: Kendi Bilgisayarında / Terminalde Çalıştırma (Yerel Bot)

Cloudflare ile uğraşmak istemiyorsanız doğrudan bilgisayarınızda çalıştırabilirsiniz:

```bash
# Gerekli kütüphaneyi kurun:
pip install requests

# Ortam değişkenlerini verin:
export TELEGRAM_BOT_TOKEN="BOT_TOKENINIZ"
export GEMINI_API_KEY="GEMINI_API_KEYINIZ"
export ALLOWED_CHAT_ID="TELEGRAM_CHAT_ID" # opsiyonel

# Botu başlatın:
python3 telegram-bot/bot_local.py
```

---

## 💬 Örnek Kullanımlar

Telegram'dan bota dilediğiniz gibi yazabilirsiniz:
- *"Bugün yurtta tavuk dürüm ve kola gömdüm"*
- *"Öğlen mc donaldsda hamburger menü aldım içecek fuse tea şeftali"*
- *"Jungle burgerde double burger ve ayran patates"*
- *"Dün akşam yurtta pizza yedim"*

Bot bunları anlar, emojisini ve kategorisini seçip siteye otomatik işler!
