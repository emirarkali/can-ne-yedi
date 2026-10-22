/**
 * Can Ne Yedi? - Telegram & Gemini Destekli Cloudflare Worker
 * 
 * Özellikler:
 * - Türkiye Saat Dilimi (Europe/Istanbul UTC+3)
 * - Fiyat Takibi (TL / ₺)
 * - Yapay Zeka (Gemini 3.8 Flash / Lite)
 * - AI Hata Durumunda Manuel Fallback (Pipe '|' formatı desteği)
 */

const REPO_OWNER = "emirarkali";
const REPO_NAME = "can-ne-yedi";
const FILE_PATH = "data/meals.json";
const GITHUB_BRANCH = "main";

function getTurkeyTimeInfo() {
  const now = new Date();
  // YYYY-MM-DD formatında Türkiye tarihi
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

      // /start veya /yardim
      if (userText === "/start" || userText.toLowerCase() === "/yardim") {
        const welcomeMsg = 
          "🍔 *Can Ne Yedi? Botuna Hoş Geldin!*\n\n" +
          "Bana doğal dille ne yediğini, mekanı ve varsa fiyatı yazabilirsin:\n\n" +
          "*Örnekler:*\n" +
          "• `Öğlen mc donaldsda hamburger menü yedim 230 tl tuttu yanında fuse tea şeftali içtim`\n" +
          "• `Yurtta tavuk dürüm ve kola gömdüm 140 tl`\n" +
          "• `Jungle burgerde double burger ayran 280 tl`\n\n" +
          "💡 *Yedek Manuel Format:* Eğer yapay zeka meşgulse doğrudan şöyle de yazabilirsin:\n" +
          "`Yemek Adı | Mekan | Fiyat`\n" +
          "Örn: `Hamburger + Ayran | Jungle Burger | 250 TL`";
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, welcomeMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      let parsedData = null;

      // 1. Manuel Yedek Mod Kontrolü (Kullanıcı '|' kullanarak girdiyse yapay zekasız ekle)
      if (userText.includes("|")) {
        parsedData = parseManualFormat(userText);
      } else {
        // 2. Doğal Dil & Gemini AI ile Analiz
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ Menü analiz ediliyor ve siteye kaydediliyor...");
        try {
          parsedData = await parseMealWithGemini(userText, env.GEMINI_API_KEY);
        } catch (aiErr) {
          console.error("Gemini AI Hatası: ", aiErr);
          // AI meşgulse kullanıcıya anlaşılır yedek şablonu sor
          const fallbackPrompt = 
            `⚠️ *Yapay zeka şu an meşgul (${aiErr.message.slice(0, 50)}...)*\n\n` +
            `Öğünü hemen eklemek için şu formatta yazıp tekrar gönderebilirsin:\n\n` +
            `👉 \`Yemek + İçecek | Mekan | Fiyat\`\n\n` +
            `*Örnek:*\n\`Dürüm Menü + Kola | McDonald's | 220 TL\``;
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, fallbackPrompt, "Markdown");
          return new Response("OK", { status: 200 });
        }
      }

      if (!parsedData || !parsedData.meal) {
        throw new Error("Yemek bilgisi anlaşılamadı. Lütfen yiyecek ve mekan belirterek tekrar yazın.");
      }

      // 3. GitHub'dan mevcut meals.json dosyasını çek
      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      let mealsList = [];
      try {
        mealsList = JSON.parse(githubFile.content);
      } catch (e) {
        mealsList = [];
      }

      // 4. Türkiye saatine göre listeye ekle
      const targetDate = parsedData.date;
      const targetDay = parsedData.day;
      const newMeal = {
        id: `${targetDate}-${Date.now().toString().slice(-4)}`,
        title: parsedData.meal.title,
        items: parsedData.meal.items || [parsedData.meal.title],
        location: parsedData.meal.location || "Belirtilmedi",
        category: parsedData.meal.category || "Fast Food",
        emoji: parsedData.meal.emoji || "🍽️",
        price: parsedData.meal.price || null,
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

      // Tarihe göre sıralı tut
      mealsList.sort((a, b) => new Date(a.date) - new Date(b.date));

      // 5. GitHub'a yeni commit at
      const updatedJsonContent = JSON.stringify(mealsList, null, 2);
      const commitMessage = `feat: ${targetDay} öğünü eklendi (${newMeal.title} - ${newMeal.location})`;
      await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, updatedJsonContent, commitMessage);

      // 6. Telegram'a başarı mesajı yolla
      const successMsg = 
        `✅ *Harika, siteye eklendi!*\n\n` +
        `📅 *Tarih:* ${targetDay} (${targetDate})\n` +
        `${newMeal.emoji} *Öğün:* ${newMeal.title}\n` +
        `📍 *Konum:* ${newMeal.location}\n` +
        (newMeal.price ? `💰 *Fiyat:* ${newMeal.price}\n` : "") +
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
 * Manuel Format Çözücü: "Yemek | Mekan | Fiyat"
 */
function parseManualFormat(text) {
  const parts = text.split("|").map(p => p.trim());
  const { date, day } = getTurkeyTimeInfo();
  
  const title = parts[0] || "Öğün";
  const location = parts[1] || "Yurt";
  const price = parts[2] ? (parts[2].includes("TL") || parts[2].includes("₺") ? parts[2] : `${parts[2]} TL`) : null;

  // Basit kategori ve emoji tahmini
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
 * Gemini Flash API Çağrısı (Türkiye Saati & Fiyat Destekli)
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
4. "price": Eğer kullanıcı bir fiyat veya tutar belirttiyse (örn: "200 tl", "150 lira", "250₺"), bunu örn: "200 TL" olarak yaz. Belirtmediyse null yap.
5. "category": Uygun bir kategori, örn: "Fast Food", "Dürüm", "Ev Yemeği", "Gurme Burger", "Tatlı".
6. "emoji": Yemeğe en uygun tek bir emoji, örn: 🍔, 🌯, 🍕, 🍗, ☕.
7. "date": Eğer kullanıcı "dün" demediyse bugünün tarihi (${todayDateStr}). "dün" dediyse dünün tarihi.
8. "day": Tarihe denk gelen Türkçe gün adı (${todayDayName}).

SADECE geçerli bir JSON yanıtı döndür. Markdown bloğu veya açıklama yazma:
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
