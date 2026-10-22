#!/usr/bin/env python3
"""
Can Ne Yedi? - Yerel Telegram Botu (Polling Yöntemi)

Gereksinimler:
pip install requests

Kullanım:
export TELEGRAM_BOT_TOKEN="bot_tokeniniz"
export GEMINI_API_KEY="gemini_api_anahtariniz"
export ALLOWED_CHAT_ID="telegram_chat_id" (opsiyonel)

python3 telegram-bot/bot_local.py
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime
import requests

REPO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MEALS_JSON_PATH = os.path.join(REPO_DIR, "data", "meals.json")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
ALLOWED_CHAT_ID = os.environ.get("ALLOWED_CHAT_ID")

if not TELEGRAM_BOT_TOKEN or not GEMINI_API_KEY:
    print("UYARI: TELEGRAM_BOT_TOKEN veya GEMINI_API_KEY ortam değişkeni ayarlanmamış!")
    print("Lütfen bu değişkenleri ayarlayıp tekrar çalıştırın.")

def send_telegram_msg(chat_id, text, parse_mode="Markdown"):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    try:
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        print(f"Telegram mesaj gönderme hatası: {e}")

def parse_with_gemini(user_text):
    now = datetime.now()
    day_names = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
    today_date = now.strftime("%Y-%m-%d")
    today_day = day_names[now.weekday()]

    prompt = f"""
Sen bir yemek günlüğü asistanısın. Kullanıcının Türkçe yazdığı metinden yediği öğünü analiz edeceksin.
Bugünün tarihi: {today_date} ({today_day}).

Kurallar:
1. "location": Mekan adını normalize et. Örn: "yurtta", "yurttayım" -> "Yurt". "mc", "mcdonalds", "mc donalds" -> "McDonald's". "jungle" -> "Jungle Burger". Belirtilmemişse "Bilinmiyor".
2. "title": Yiyecek ve içeceği özetle, örn: "Hamburger + Fuse Tea Şeftali" veya "Tavuk Dürüm + Ayran".
3. "items": Yiyecek ve içeceklerin listesi dizi olarak, örn: ["Hamburger", "Fuse Tea Şeftali"].
4. "category": Uygun bir kategori, örn: "Fast Food", "Dürüm", "Ev Yemeği", "Gurme Burger", "Tatlı".
5. "emoji": Yemeğe en uygun tek bir emoji, örn: 🍔, 🌯, 🍕, 🍗, ☕.
6. "date": Eğer kullanıcı "dün" demediyse bugünün tarihi ({today_date}). "dün" dediyse dünün tarihi.
7. "day": Türkçe gün adı.

SADECE geçerli bir JSON çıktısı ver. Markdown bloğu veya açıklama yazma:
{{
  "date": "{today_date}",
  "day": "{today_day}",
  "meal": {{
    "title": "Hamburger + Fuse Tea Şeftali",
    "items": ["Hamburger", "Fuse Tea Şeftali"],
    "location": "McDonald's",
    "category": "Fast Food",
    "emoji": "🍔",
    "note": ""
  }}
}}
"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    body = {
        "contents": [{"parts": [{"text": f"{prompt}\n\nKullanıcı: \"{user_text}\""}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }
    resp = requests.post(url, json=body, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    raw_json = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(raw_json)

def update_meals_and_push(parsed):
    with open(MEALS_JSON_PATH, "r", encoding="utf-8") as f:
        meals_data = json.load(f)

    target_date = parsed["date"]
    target_day = parsed["day"]
    meal_obj = parsed["meal"]
    meal_obj["id"] = f"{target_date}-{int(time.time()) % 10000}"

    day_entry = next((d for d in meals_data if d["date"] == target_date), None)
    if day_entry:
        day_entry["meals"].append(meal_obj)
    else:
        meals_data.append({
            "date": target_date,
            "day": target_day,
            "meals": [meal_obj]
        })

    meals_data.sort(key=lambda x: x["date"])

    with open(MEALS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(meals_data, f, ensure_ascii=False, indent=2)

    # Git commit & push
    commit_msg = f"feat: {target_day} öğünü eklendi ({meal_obj['title']} - {meal_obj['location']})"
    subprocess.run(["git", "add", "data/meals.json"], cwd=REPO_DIR, check=True)
    subprocess.run(["git", "commit", "-m", commit_msg], cwd=REPO_DIR, check=True)
    subprocess.run(["git", "push", "origin", "main"], cwd=REPO_DIR, check=True)
    return meal_obj

def poll_updates():
    offset = 0
    print("🚀 Telegram botu başlatıldı ve mesajlar dinleniyor...")
    while True:
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates?offset={offset}&timeout=30"
            res = requests.get(url, timeout=35).json()
            if not res.get("ok"):
                time.sleep(3)
                continue

            for update in res.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message")
                if not msg or "text" not in msg:
                    continue

                chat_id = msg["chat"]["id"]
                user_text = msg["text"].strip()

                if ALLOWED_CHAT_ID and str(chat_id) != str(ALLOWED_CHAT_ID):
                    send_telegram_msg(chat_id, "⛔ Bu bot sadece yetkili kullanıcı içindir.")
                    continue

                if user_text in ["/start", "/yardim"]:
                    send_telegram_msg(chat_id, "🍔 *Can Ne Yedi? Botu*\nNe yediğini doğal dille yaz, siteye otomatik ekleyeyim!\nÖrn: `Yurtta tavuk dürüm ve kola gömdüm`")
                    continue

                send_telegram_msg(chat_id, "⏳ Öğünün analiz ediliyor ve siteye kaydediliyor...")
                try:
                    parsed = parse_with_gemini(user_text)
                    meal = update_meals_and_push(parsed)
                    success_text = (
                        f"✅ *Harika, siteye eklendi!*\n\n"
                        f"📅 *Tarih:* {parsed['day']} ({parsed['date']})\n"
                        f"{meal.get('emoji', '🍽️')} *Öğün:* {meal['title']}\n"
                        f"📍 *Konum:* {meal['location']}\n"
                        f"🏷️ *Kategori:* {meal['category']}\n\n"
                        f"🌐 https://emirarkali.github.io/can-ne-yedi/"
                    )
                    send_telegram_msg(chat_id, success_text)
                except Exception as err:
                    print("Hata:", err)
                    send_telegram_msg(chat_id, f"❌ Bir hata oluştu: {err}")

        except Exception as e:
            print(f"Polling loop hatası: {e}")
            time.sleep(3)

if __name__ == "__main__":
    poll_updates()
