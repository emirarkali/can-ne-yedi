# Can Ne Yedi? 🍔

Can'ın haftalık yemek günlüğü, kesintisiz yemek zinciri ve gurme durakları takip platformu.

🌐 **Canlı Site:** [https://emirarkali.github.io/can-ne-yedi/](https://emirarkali.github.io/can-ne-yedi/)

---

## ✨ Özellikler

- 🔥 **Yemek Zinciri (Streak):** Gün gün ne yediyse zincir halinde kesintisiz takip.
- 📱 **Mobil Uyumlu & Modern Arayüz:** Modern dark mode gurme teması, Tailwind CSS ve akıcı animasyonlar.
- 📍 **Konum ve Mekan Odaklı:** Yurt, McDonald's, Jungle Burger gibi öğünün nerede yendiği bilgisi.
- 🥤 **Çoklu Öğün Desteği:** Bir günde birden fazla öğün yendiğinde (örn. Perşembe günü zater + kola ve hamburger + ayran) alt alta kartlar halinde listeleme.
- 🔍 **Arama ve Mekan Filtreleri:** Mekana veya yiyeceğe göre anlık filtreleme.
- ⚡ **Kolay Güncelleme:** `data/meals.json` dosyasına yeni bir gün objesi ekleyip pushlamak yeterli!

---

## 📅 Mevcut Veriler (19 Ekim 2026'dan İtibaren)

| Tarih | Gün | Öğün(ler) | Konum |
| :--- | :--- | :--- | :--- |
| **19 Ekim 2026** | Pazartesi | Hamburger + Ayran | Yurtta |
| **20 Ekim 2026** | Salı | Hamburger + Kola | McDonald's |
| **21 Ekim 2026** | Çarşamba | Hamburger + Kola | McDonald's |
| **22 Ekim 2026** | Perşembe | 1. Zater + Kola<br>2. Hamburger + Ayran | Yurtta<br>Jungle Burger |

---

## 🚀 Yeni Gün Nasıl Eklenir?

Yeni bir gün eklemek için tek yapmanız gereken [`data/meals.json`](data/meals.json) dosyasının en altına (veya uygun tarih sırasına) yeni bir gün eklemektir:

```json
{
  "date": "2026-10-23",
  "day": "Cuma",
  "meals": [
    {
      "id": "2026-10-23-1",
      "title": "Hamburger + Kola",
      "items": ["Hamburger", "Kola"],
      "location": "McDonald's",
      "category": "Fast Food",
      "emoji": "🍔",
      "note": "İstikrar devam ediyor"
    }
  ]
}
```

Değişikliği kaydedip pushladıktan sonra site otomatik olarak güncellenir:

```bash
git add data/meals.json
git commit -m "feat: 23 Ekim Cuma öğünü eklendi"
git push origin main
```

---

Geliştirici: [@emirarkali](https://github.com/emirarkali)
