/**
 * Can Ne Yedi? - Gelişmiş İnteraktif Telegram Botu
 * 
 * Özellikler:
 * - 💰 Fiyat girmek ZORUNLU (Fiyatsız öğün kaydedilmez)
 * - 📋 /liste   : Son öğünleri numaralı listeler
 * - 🗑️ /sil <no> : İstenen öğünü siler
 * - ✏️ /duzenle <no> <bilgiler> : İstenen öğünü günceller
 * - ➕ /ekle <yemek> | <mekan> | <fiyat> : Manuel tek komutla ekleme
 * - 🤖 Doğal dil ile ekleme (fiyat belirterek)
 * - 🕒 Türkiye Yerel Saati (Europe/Istanbul)
 */

const REPO_OWNER = "emirarkali";
const REPO_NAME = "can-ne-yedi";
const FILE_PATH = "data/meals.json";
const GITHUB_BRANCH = "main";

function getTurkeyTimeInfo() {
  const now = new Date();
  const trDateStr = now.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const dayNamesTr = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const trDateObj = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const trDayName = dayNamesTr[trDateObj.getDay()];
  return { date: trDateStr, day: trDayName };
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Can Ne Yedi Telegram Bot Webhook Active! 🍔", { status: 200 });
    }

    let currentChatId = null;

    try {
      const update = await request.json();
      if (!update.message || !update.message.text) {
        return new Response("OK", { status: 200 });
      }

      const chatId = update.message.chat.id;
      currentChatId = chatId;
      const userText = update.message.text.trim();

      // Güvenlik kontrolü
      if (env.ALLOWED_CHAT_ID && String(chatId) !== String(env.ALLOWED_CHAT_ID)) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⛔ Üzgünüm, bu bot sadece Can'ın yemeklerini kaydetmek için yetkilendirilmiştir.");
        return new Response("OK", { status: 200 });
      }

      // --- KOMUTLAR ---

      // 1. /start ve /yardim
      if (userText === "/start" || userText.toLowerCase() === "/yardim" || userText.toLowerCase() === "/help") {
        const helpMsg = 
          "🍔 *Can Ne Yedi? Yönetim Botu*\n\n" +
          "⚠️ *Kural:* Her öğünde *FİYAT* girmek zorunludur!\n\n" +
          "📌 *Kullanabileceğin Yöntemler:*\n\n" +
          "1️⃣ *Doğal Dille Yaz (AI):*\n" +
          "• `Mc donaldsda hamburger menü yedim 230 tl yanında fuse tea şeftali`\n" +
          "• `Yurtta tavuk dürüm ve kola gömdüm 140 lira`\n\n" +
          "2️⃣ *Manuel Hızlı Ekleme:*\n" +
          "• `/ekle Hamburger + Ayran | Jungle Burger | 250 TL`\n" +
          "• veya sadece: `Yemek | Mekan | Fiyat`\n\n" +
          "3️⃣ *Öğünleri Yönet:*\n" +
          "• `/liste` : Son öğünleri numaralarıyla gösterir\n" +
          "• `/sil 1` : 1 numaralı öğünü siteden siler\n" +
          "• `/duzenle 1 Yemek | Mekan | 200 TL` : Öğünü günceller\n\n" +
          "🌐 *Canlı Site:* https://" + REPO_OWNER + ".github.io/" + REPO_NAME + "/";
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, helpMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      // 2. /liste : Son öğünleri listele
      if (userText.toLowerCase() === "/liste" || userText.toLowerCase() === "/list") {
        const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
        const mealsList = JSON.parse(githubFile.content);
        const flatMeals = getFlattenedMeals(mealsList);

        if (flatMeals.length === 0) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "📭 Henüz kayıtlı öğün bulunmuyor.");
          return new Response("OK", { status: 200 });
        }

        let listMsg = "📋 *Son Eklenen Öğünler:*\n\n";
        flatMeals.slice(0, 10).forEach((item, index) => {
          const num = index + 1;
          const priceStr = item.meal.price ? ` - 💰 *${item.meal.price}*` : " - _(Fiyatsız)_";
          listMsg += `*#${num}* [${item.date}] ${item.meal.emoji || '🍽️'} *${item.meal.title}*\n`;
          listMsg += `   📍 ${item.meal.location}${priceStr}\n\n`;
        });

        listMsg += "💡 *İşlemler:*\n";
        listMsg += "• Silmek için: `/sil <numara>` (Örn: `/sil 1`)\n";
        listMsg += "• Düzenlemek için: `/duzenle <numara> Yeni Yemek | Mekan | Fiyat`";

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, listMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      // 3. /sil <numara>
      if (userText.toLowerCase().startsWith("/sil")) {
        const parts = userText.split(" ").filter(p => p.trim());
        const targetNum = parseInt(parts[1], 10);
        if (isNaN(targetNum) || targetNum < 1) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Lütfen silinecek öğünün numarasını yazın. Örn: `/sil 1`\nÖğün numaralarını görmek için `/liste` yazabilirsiniz.");
          return new Response("OK", { status: 200 });
        }

        const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
        let mealsList = JSON.parse(githubFile.content);
        const flatMeals = getFlattenedMeals(mealsList);

        if (targetNum > flatMeals.length) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Geçersiz numara! Listede toplam ${flatMeals.length} öğün var.`);
          return new Response("OK", { status: 200 });
        }

        const itemToDelete = flatMeals[targetNum - 1];
        
        // Öğünü mealsList içinden çıkar
        const dayEntry = mealsList.find(d => d.date === itemToDelete.date);
        if (dayEntry) {
          dayEntry.meals = dayEntry.meals.filter(m => m.id !== itemToDelete.meal.id);
          // Eğer günde hiç öğün kalmadıysa günü de sil
          if (dayEntry.meals.length === 0) {
            mealsList = mealsList.filter(d => d.date !== itemToDelete.date);
          }
        }

        const updatedJson = JSON.stringify(mealsList, null, 2);
        await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, updatedJson, `chore: silindi (${itemToDelete.meal.title})`);

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🗑️ *Öğün Silindi!*\n\n*${itemToDelete.meal.title}* (${itemToDelete.date}) siteden kaldırıldı.`);
        return new Response("OK", { status: 200 });
      }

      // 4. /duzenle <numara> <bilgiler>
      if (userText.toLowerCase().startsWith("/duzenle")) {
        const firstSpace = userText.indexOf(" ");
        if (firstSpace === -1) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Kullanım: `/duzenle <numara> Yemek | Mekan | Fiyat`\nÖrn: `/duzenle 1 Double Burger + Ayran | Jungle Burger | 280 TL`");
          return new Response("OK", { status: 200 });
        }

        const rest = userText.slice(firstSpace + 1).trim();
        const secondSpace = rest.indexOf(" ");
        const targetNum = parseInt(rest.slice(0, secondSpace !== -1 ? secondSpace : rest.length), 10);
        const newContent = secondSpace !== -1 ? rest.slice(secondSpace + 1).trim() : "";

        if (isNaN(targetNum) || !newContent || !newContent.includes("|")) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Lütfen yeni bilgileri `Yemek | Mekan | Fiyat` formatında girin.\nÖrn: `/duzenle 1 Hamburger Menü | McDonald's | 230 TL`");
          return new Response("OK", { status: 200 });
        }

        const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
        let mealsList = JSON.parse(githubFile.content);
        const flatMeals = getFlattenedMeals(mealsList);

        if (targetNum < 1 || targetNum > flatMeals.length) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Geçersiz öğün numarası. `/liste` yazarak kontrol edin.");
          return new Response("OK", { status: 200 });
        }

        const parsedEdit = parseManualFormat(newContent);
        if (!parsedEdit.meal.price) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ *Fiyat zorunludur!* Lütfen fiyatı da belirtin (örn: `220 TL`).");
          return new Response("OK", { status: 200 });
        }

        const oldItem = flatMeals[targetNum - 1];
        const dayEntry = mealsList.find(d => d.date === oldItem.date);
        if (dayEntry) {
          const mealIdx = dayEntry.meals.findIndex(m => m.id === oldItem.meal.id);
          if (mealIdx !== -1) {
            dayEntry.meals[mealIdx] = {
              ...dayEntry.meals[mealIdx],
              title: parsedEdit.meal.title,
              items: [parsedEdit.meal.title],
              location: parsedEdit.meal.location,
              price: parsedEdit.meal.price,
              category: parsedEdit.meal.category,
              emoji: parsedEdit.meal.emoji
            };
          }
        }

        const updatedJson = JSON.stringify(mealsList, null, 2);
        await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, updatedJson, `fix: düzenlendi (${parsedEdit.meal.title})`);

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✏️ *Öğün Güncellendi!*\n\n${parsedEdit.meal.emoji} *${parsedEdit.meal.title}*\n📍 ${parsedEdit.meal.location}\n💰 *${parsedEdit.meal.price}*\n\nSite güncellendi! 🌐`);
        return new Response("OK", { status: 200 });
      }

      // 5. Manuel Ekleme Komutu: /ekle veya doğrudan "Yemek | Mekan | Fiyat"
      let parsedData = null;

      if (userText.toLowerCase().startsWith("/ekle") || userText.includes("|")) {
        const cleanInput = userText.toLowerCase().startsWith("/ekle") ? userText.slice(5).trim() : userText;
        parsedData = parseManualFormat(cleanInput);

        // FİYAT ZORUNLULUĞU KONTROLÜ
        if (!parsedData.meal.price) {
          const warnMsg = 
            "⚠️ *Fiyat girmek zorunludur!*\n\n" +
            "Lütfen fiyatı da ekleyerek şu formatta yaz:\n" +
            "👉 `Yemek | Mekan | Fiyat`\n\n" +
            "*Örnek:* `Hamburger + Ayran | Jungle Burger | 240 TL`";
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, warnMsg, "Markdown");
          return new Response("OK", { status: 200 });
        }
      } else {
        // 6. Doğal Dil & AI ile Ekleme
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ Menü analiz ediliyor...");
        try {
          parsedData = await parseMealWithGemini(userText, env.GEMINI_API_KEY);
        } catch (aiErr) {
          const fallbackPrompt = 
            `⚠️ *Yapay zeka şu an meşgul.*\n\n` +
            `Öğünü manuel eklemek için şu formatta gönder:\n` +
            `👉 \`/ekle Yemek + İçecek | Mekan | Fiyat\`\n\n` +
            `*Örnek:*\n\`/ekle Dürüm Menü + Kola | McDonald's | 220 TL\``;
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, fallbackPrompt, "Markdown");
          return new Response("OK", { status: 200 });
        }

        // FİYAT ZORUNLULUĞU KONTROLÜ (AI Çıktısı İçin)
        if (!parsedData.meal.price) {
          const noPriceMsg = 
            `⚠️ *Fiyat girmek zorunludur!*\n\n` +
            `Menüyü anladım: *${parsedData.meal.title}* (${parsedData.meal.location})\n` +
            `Fakat fiyat belirtmemişsin.\n\n` +
            `Lütfen fiyatıyla birlikte tekrar yaz, örn:\n` +
            `👉 \`${userText} 220 TL\`\n` +
            `veya manuel:\n` +
            `👉 \`/ekle ${parsedData.meal.title} | ${parsedData.meal.location} | 220 TL\``;
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, noPriceMsg, "Markdown");
          return new Response("OK", { status: 200 });
        }
      }

      // --- SİTEYE KAYDETME (GitHub API) ---
      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      let mealsList = [];
      try {
        mealsList = JSON.parse(githubFile.content);
      } catch (e) {
        mealsList = [];
      }

      const targetDate = parsedData.date;
      const targetDay = parsedData.day;
      const newMeal = {
        id: `${targetDate}-${Date.now().toString().slice(-4)}`,
        title: parsedData.meal.title,
        items: parsedData.meal.items || [parsedData.meal.title],
        location: parsedData.meal.location || "Belirtilmedi",
        category: parsedData.meal.category || "Fast Food",
        emoji: parsedData.meal.emoji || "🍽️",
        price: parsedData.meal.price,
        note: parsedData.meal.note || ""
      };

      let dayEntry = mealsList.find(d => d.date === targetDate);
      if (dayEntry) {
        dayEntry.meals.push(newMeal);
      } else {
        mealsList.push({
          date: targetDate,
          day: targetDay,
          meals: [newMeal]
        });
      }

      mealsList.sort((a, b) => new Date(a.date) - new Date(b.date));

      const updatedJsonContent = JSON.stringify(mealsList, null, 2);
      const commitMessage = `feat: ${targetDay} öğünü eklendi (${newMeal.title} - ${newMeal.price})`;
      await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, updatedJsonContent, commitMessage);

      // Başarı Mesajı
      const successMsg = 
        `✅ *Harika, siteye eklendi!*\n\n` +
        `📅 *Tarih:* ${targetDay} (${targetDate})\n` +
        `${newMeal.emoji} *Öğün:* ${newMeal.title}\n` +
        `📍 *Konum:* ${newMeal.location}\n` +
        `💰 *Fiyat:* ${newMeal.price}\n` +
        `🏷️ *Kategori:* ${newMeal.category}\n` +
        (newMeal.note ? `💬 *Not:* ${newMeal.note}\n` : "") +
        `\n🌐 *Canlı Site:* https://${REPO_OWNER}.github.io/${REPO_NAME}/`;

      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, successMsg, "Markdown");
      return new Response("OK", { status: 200 });

    } catch (error) {
      console.error(error);
      if (currentChatId && env.TELEGRAM_BOT_TOKEN) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, currentChatId, `❌ Hata oluştu: ${error.message}`);
      }
      return new Response("Error: " + error.message, { status: 200 });
    }
  }
};

/**
 * Öğünleri en yeniden en eskiye tek düze listeye çevirir (numaralandırma için)
 */
function getFlattenedMeals(mealsList) {
  const result = [];
  // En yeni gün en başta olsun
  const sortedDays = [...mealsList].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const day of sortedDays) {
    const reversedMeals = [...(day.meals || [])].reverse();
    for (const meal of reversedMeals) {
      result.push({
        date: day.date,
        day: day.day,
        meal
      });
    }
  }
  return result;
}

/**
 * Manuel Format Çözücü: "Yemek | Mekan | Fiyat"
 */
function parseManualFormat(text) {
  const parts = text.split("|").map(p => p.trim());
  const { date, day } = getTurkeyTimeInfo();
  
  const title = parts[0] || "Öğün";
  const location = parts[1] || "Yurt";
  let rawPrice = parts[2] ? parts[2].trim() : null;
  let price = null;
  if (rawPrice) {
    price = (rawPrice.includes("TL") || rawPrice.includes("₺")) ? rawPrice : `${rawPrice} TL`;
  }

  let emoji = "🍽️";
  let category = "Fast Food";
  const lower = title.toLowerCase();
  if (lower.includes("burger") || lower.includes("hamburger")) { emoji = "🍔"; category = "Fast Food"; }
  else if (lower.includes("dürüm") || lower.includes("zater")) { emoji = "🌯"; category = "Dürüm"; }
  else if (lower.includes("pizza")) { emoji = "🍕"; category = "Fast Food"; }
  else if (lower.includes("kahve")) { emoji = "☕"; category = "İçecek"; }

  return {
    date,
    day,
    meal: {
      title,
      items: [title],
      location,
      price,
      category,
      emoji,
      note: ""
    }
  };
}

/**
 * Gemini Flash API Çağrısı
 */
async function parseMealWithGemini(userMessage, apiKey) {
  const { date: todayDateStr, day: todayDayName } = getTurkeyTimeInfo();

  const systemPrompt = `
Sen bir yemek günlüğü asistanısın. Kullanıcının Türkçe yazdığı metinden yediği öğünü analiz edeceksin.
Türkiye Yerel Saatine göre bugünün tarihi: ${todayDateStr} (${todayDayName}).

Kurallar:
1. "location": Mekan adını normalize et. Örn: "yurtta", "yurttayım" -> "Yurt". "mc", "mcdonalds", "mc donalds" -> "McDonald's". "jungle" -> "Jungle Burger". Belirtilmemişse "Bilinmiyor".
2. "title": Yiyecek ve içeceği özetle, örn: "Hamburger + Fuse Tea Şeftali" veya "Tavuk Dürüm + Ayran".
3. "items": Yiyecek ve içeceklerin listesi dizi olarak, örn: ["Hamburger", "Fuse Tea Şeftali"].
4. "price": Kullanıcının belirttiği fiyat/tutar bilgisini örn: "220 TL" formatında çıkar. Eğer KESİNLİKLE hiçbir fiyat belirtmediyse null yap.
5. "category": Uygun bir kategori, örn: "Fast Food", "Dürüm", "Ev Yemeği", "Gurme Burger", "Tatlı".
6. "emoji": Yemeğe en uygun tek bir emoji, örn: 🍔, 🌯, 🍕, 🍗, ☕.
7. "date": Eğer kullanıcı "dün" demediyse bugünün tarihi (${todayDateStr}). "dün" dediyse dünün tarihi.
8. "day": Türkçe gün adı (${todayDayName}).

SADECE geçerli bir JSON yanıtı döndür:
{
  "date": "${todayDateStr}",
  "day": "${todayDayName}",
  "meal": {
    "title": "Hamburger + Fuse Tea Şeftali",
    "items": ["Hamburger", "Fuse Tea Şeftali"],
    "location": "McDonald's",
    "price": "220 TL",
    "category": "Fast Food",
    "emoji": "🍔",
    "note": ""
  }
}
`;

  const modelsToTry = ["gemini-3.8-flash", "gemini-3.8-flash-lite"];
  let lastError = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 1500));
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: `${systemPrompt}\n\nKullanıcı Mesajı: "${userMessage}"` }]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (response.status === 503) {
          lastError = new Error(`${model} yoğun (503)`);
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`${model} Hatası (${response.status}): ${errText}`);
        }

        const result = await response.json();
        const textOutput = result.candidates[0].content.parts[0].text;
        return JSON.parse(textOutput);
      } catch (err) {
        lastError = err;
      }
    }
  }

  throw lastError || new Error("Gemini servisi şu an yoğun.");
}

/**
 * GitHub API: Dosya İçeriğini ve SHA değerini al
 */
async function getGitHubFile(token) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${GITHUB_BRANCH}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Can-Ne-Yedi-Worker",
      "Accept": "application/vnd.github.v3+json"
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GitHub getFile Hatası (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const decodedContent = new TextDecoder().decode(Uint8Array.from(atob(data.content), c => c.charCodeAt(0)));
  return {
    sha: data.sha,
    content: decodedContent
  };
}

/**
 * GitHub API: Dosyayı güncelle ve commit at
 */
async function updateGitHubFile(token, sha, content, message) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const utf8Bytes = new TextEncoder().encode(content);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const base64Content = btoa(binary);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Can-Ne-Yedi-Worker",
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: message,
      content: base64Content,
      sha: sha,
      branch: GITHUB_BRANCH
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GitHub updateFile Hatası (${response.status}): ${errText}`);
  }

  return await response.json();
}

/**
 * Telegram API: Mesaj Gönder
 */
async function sendTelegramMessage(botToken, chatId, text, parseMode = null) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text
  };
  if (parseMode) body.parse_mode = parseMode;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
