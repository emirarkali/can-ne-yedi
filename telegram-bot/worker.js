/**
 * Can Ne Yedi? - Telegram & Gemini Destekli Cloudflare Worker
 */

const REPO_OWNER = "emirarkali";
const REPO_NAME = "can-ne-yedi";
const FILE_PATH = "data/meals.json";
const GITHUB_BRANCH = "main";

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

      // /start veya /yardim komutu
      if (userText === "/start" || userText.toLowerCase() === "/yardim") {
        const welcomeMsg = 
          "🍔 *Can Ne Yedi? Botuna Hoş Geldin!*\n\n" +
          "Bana doğal dille ne yediğini ve nerede yediğini yazman yeterli.\n\n" +
          "*Örnekler:*\n" +
          "• `Öğlen mc donaldsda hamburger yedim yanında fuse tea şeftali içtim`\n" +
          "• `Yurtta tavuk dürüm ve kola gömdüm`\n" +
          "• `Jungle burgerde double burger ayran patates`\n\n" +
          "Yapay zeka bunu anlayıp otomatik olarak siteye ekleyecek! 🚀";
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, welcomeMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      // Durum mesajı
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ Menü analiz ediliyor ve siteye kaydediliyor...");

      // 1. Gemini Flash API ile Doğal Dil Analizi
      const parsedData = await parseMealWithGemini(userText, env.GEMINI_API_KEY);
      if (!parsedData || !parsedData.meal) {
        throw new Error("Yemek bilgisi anlaşılamadı. Lütfen yiyecek ve mekan belirterek tekrar yazın.");
      }

      // 2. GitHub'dan mevcut meals.json dosyasını çek
      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      let mealsList = [];
      try {
        mealsList = JSON.parse(githubFile.content);
      } catch (e) {
        mealsList = [];
      }

      // 3. Tarihe göre listeye ekle
      const targetDate = parsedData.date; // YYYY-MM-DD
      const targetDay = parsedData.day;   // Pazartesi, Salı, etc.
      const newMeal = {
        id: `${targetDate}-${Date.now().toString().slice(-4)}`,
        title: parsedData.meal.title,
        items: parsedData.meal.items || [parsedData.meal.title],
        location: parsedData.meal.location || "Belirtilmedi",
        category: parsedData.meal.category || "Fast Food",
        emoji: parsedData.meal.emoji || "🍽️",
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

      // 4. GitHub'a yeni commit at
      const updatedJsonContent = JSON.stringify(mealsList, null, 2);
      const commitMessage = `feat: ${targetDay} öğünü eklendi (${newMeal.title} - ${newMeal.location})`;
      await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, updatedJsonContent, commitMessage);

      // 5. Telegram'a başarı mesajı yolla
      const successMsg = 
        `✅ *Harika, siteye eklendi!*\n\n` +
        `📅 *Tarih:* ${targetDay} (${targetDate})\n` +
        `${newMeal.emoji} *Öğün:* ${newMeal.title}\n` +
        `📍 *Konum:* ${newMeal.location}\n` +
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
 * Gemini Flash API Çağrısı (2.0-flash / 2.5-flash)
 */
async function parseMealWithGemini(userMessage, apiKey) {
  const today = new Date();
  const dayNamesTr = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const todayDateStr = today.toISOString().split("T")[0];
  const todayDayName = dayNamesTr[today.getDay()];

  const systemPrompt = `
Sen bir yemek günlüğü asistanısın. Kullanıcının Türkçe yazdığı metinden yediği öğünü analiz edeceksin.
Bugünün tarihi: ${todayDateStr} (${todayDayName}).

Kurallar:
1. "location": Mekan adını normalize et. Örn: "yurtta", "yurttayım" -> "Yurt". "mc", "mcdonalds", "mc donalds" -> "McDonald's". "jungle" -> "Jungle Burger". Belirtilmemişse "Bilinmiyor".
2. "title": Yiyecek ve içeceği özetle, örn: "Hamburger + Fuse Tea Şeftali" veya "Tavuk Dürüm + Ayran".
3. "items": Yiyecek ve içeceklerin listesi dizi olarak, örn: ["Hamburger", "Fuse Tea Şeftali"].
4. "category": Uygun bir kategori, örn: "Fast Food", "Dürüm", "Ev Yemeği", "Gurme Burger", "Tatlı".
5. "emoji": Yemeğe en uygun tek bir emoji, örn: 🍔, 🌯, 🍕, 🍗, ☕.
6. "date": Eğer kullanıcı "dün" demediyse bugünün tarihi (${todayDateStr}). "dün" dediyse dünün tarihi.
7. "day": Tarihe denk gelen Türkçe gün adı (${todayDayName}).

SADECE geçerli bir JSON yanıtı döndür. Markdown bloğu veya açıklama yazma:
{
  "date": "${todayDateStr}",
  "day": "${todayDayName}",
  "meal": {
    "title": "Hamburger + Fuse Tea Şeftali",
    "items": ["Hamburger", "Fuse Tea Şeftali"],
    "location": "McDonald's",
    "category": "Fast Food",
    "emoji": "🍔",
    "note": ""
  }
}
`;

  const modelsToTry = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash-latest"];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
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

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${model} Hatası (${response.status}): ${errText}`);
      }

      const result = await response.json();
      const textOutput = result.candidates[0].content.parts[0].text;
      return JSON.parse(textOutput);
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("Gemini API modellerine ulaşılamadı.");
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
