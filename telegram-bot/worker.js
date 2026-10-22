/**
 * Can Ne Yedi? - Adım Adım İnteraktif Telegram Botu
 * 
 * Özellikler:
 * - 🍽️ "Ne yedin?" ve 🥤 "Ne içtin?" ayrı sorular (İçmediyse "içmedim" yazabilir)
 * - ✏️ /duzenle <no> : Yemek, içecek, mekan ve fiyatı tek tek sorar. Değiştirmek istemiyorsa "aynı" yazar.
 * - ➕ /ekle         : 4 adımda tek tek sorarak ekler.
 * - 💰 Fiyat girmek zorunludur.
 * - 📋 /liste ve 🗑️ /sil <no>
 * - 🤖 Doğal dil desteği (Tek cümleyle fiyat belirterek yazma)
 * - 🕒 Türkiye Yerel Saati (Europe/Istanbul UTC+3)
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
      const replyToText = update.message.reply_to_message ? update.message.reply_to_message.text : "";

      // Güvenlik kontrolü
      if (env.ALLOWED_CHAT_ID && String(chatId) !== String(env.ALLOWED_CHAT_ID)) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⛔ Üzgünüm, bu bot sadece Can'ın yemeklerini kaydetmek için yetkilendirilmiştir.");
        return new Response("OK", { status: 200 });
      }

      // --- ADIM ADIM İNTERAKTİF DİYALOG KONTROLÜ ---

      // ==========================================
      // A) /duzenle ADIMLARI
      // ==========================================

      // DÜZENLE ADIM 1: Yemek cevabı geldi -> İçeceği sor
      if (replyToText.includes("✏️ [DÜZENLE-ADIM 1]")) {
        const mealNum = extractTag(replyToText, "NO");
        const oldFood = extractTag(replyToText, "FOOD");
        const oldDrink = extractTag(replyToText, "DRINK");
        const oldLoc = extractTag(replyToText, "LOC");
        const oldPrice = extractTag(replyToText, "PRICE");

        const newFood = isSame(userText) ? oldFood : userText;

        const nextMsg = 
          `✏️ [DÜZENLE-ADIM 2]\n` +
          `[NO:${mealNum}] [FOOD:${newFood}] [DRINK:${oldDrink}] [LOC:${oldLoc}] [PRICE:${oldPrice}]\n\n` +
          `2️⃣ *Yanında ne içtin?*\n` +
          `Şu anki: _${oldDrink || 'İçilmedi'}_\n` +
          `_(Örn: Kola, Ayran, Fuse Tea Şeftali)_\n\n` +
          `💡 Değiştirmek istemiyorsan *aynı*, içecek içmediysen *içmedim* yaz.`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, nextMsg);
        return new Response("OK", { status: 200 });
      }

      // DÜZENLE ADIM 2: İçecek cevabı geldi -> Mekanı sor
      if (replyToText.includes("✏️ [DÜZENLE-ADIM 2]")) {
        const mealNum = extractTag(replyToText, "NO");
        const food = extractTag(replyToText, "FOOD");
        const oldDrink = extractTag(replyToText, "DRINK");
        const oldLoc = extractTag(replyToText, "LOC");
        const oldPrice = extractTag(replyToText, "PRICE");

        let newDrink = oldDrink;
        if (isNoDrink(userText)) {
          newDrink = "";
        } else if (!isSame(userText)) {
          newDrink = userText;
        }

        const nextMsg = 
          `✏️ [DÜZENLE-ADIM 3]\n` +
          `[NO:${mealNum}] [FOOD:${food}] [DRINK:${newDrink}] [LOC:${oldLoc}] [PRICE:${oldPrice}]\n\n` +
          `3️⃣ *Nerede yedin / Konum neresi?*\n` +
          `Şu anki: _${oldLoc}_\n` +
          `_(Örn: Jungle Burger, Yurt, McDonald's)_\n\n` +
          `💡 Değiştirmek istemiyorsan *aynı* yaz.`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, nextMsg);
        return new Response("OK", { status: 200 });
      }

      // DÜZENLE ADIM 3: Mekan cevabı geldi -> Fiyatı sor
      if (replyToText.includes("✏️ [DÜZENLE-ADIM 3]")) {
        const mealNum = extractTag(replyToText, "NO");
        const food = extractTag(replyToText, "FOOD");
        const drink = extractTag(replyToText, "DRINK");
        const oldLoc = extractTag(replyToText, "LOC");
        const oldPrice = extractTag(replyToText, "PRICE");

        const newLoc = isSame(userText) ? oldLoc : normalizeLocation(userText);

        const nextMsg = 
          `✏️ [DÜZENLE-ADIM 4]\n` +
          `[NO:${mealNum}] [FOOD:${food}] [DRINK:${drink}] [LOC:${newLoc}] [PRICE:${oldPrice}]\n\n` +
          `4️⃣ *Fiyatı ne kadar tuttu?* *(Zorunlu)*\n` +
          `Şu anki: _${oldPrice}_\n` +
          `_(Örn: 240 TL)_\n\n` +
          `💡 Değiştirmek istemiyorsan *aynı* yaz.`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, nextMsg);
        return new Response("OK", { status: 200 });
      }

      // DÜZENLE ADIM 4: Fiyat cevabı geldi -> GitHub'a kaydet!
      if (replyToText.includes("✏️ [DÜZENLE-ADIM 4]")) {
        const mealNum = parseInt(extractTag(replyToText, "NO"), 10);
        const food = extractTag(replyToText, "FOOD");
        const drink = extractTag(replyToText, "DRINK");
        const loc = extractTag(replyToText, "LOC");
        const oldPrice = extractTag(replyToText, "PRICE");

        let price = isSame(userText) ? oldPrice : formatPrice(userText);
        if (!price || price === "null") {
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Fiyat girmek zorunludur! Lütfen fiyatı yaz (örn: 220 TL):\n\n${replyToText}`);
          return new Response("OK", { status: 200 });
        }

        const fullTitle = drink ? `${food} + ${drink}` : food;
        const items = drink ? [food, drink] : [food];

        const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
        let mealsList = JSON.parse(githubFile.content);
        const flatMeals = getFlattenedMeals(mealsList);

        if (mealNum < 1 || mealNum > flatMeals.length) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Düzenlenecek öğün bulunamadı.");
          return new Response("OK", { status: 200 });
        }

        const oldItem = flatMeals[mealNum - 1];
        const dayEntry = mealsList.find(d => d.date === oldItem.date);
        if (dayEntry) {
          const mIdx = dayEntry.meals.findIndex(m => m.id === oldItem.meal.id);
          if (mIdx !== -1) {
            dayEntry.meals[mIdx] = {
              ...dayEntry.meals[mIdx],
              title: fullTitle,
              items: items,
              location: loc,
              price: price,
              emoji: guessEmoji(food),
              category: guessCategory(food)
            };
          }
        }

        await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, JSON.stringify(mealsList, null, 2), `fix: düzenlendi #${mealNum} (${fullTitle})`);

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ *Öğün Başarıyla Güncellendi!*\n\n${guessEmoji(food)} *${fullTitle}*\n📍 *Konum:* ${loc}\n💰 *Fiyat:* ${price}\n\nSite güncellendi! 🌐`);
        return new Response("OK", { status: 200 });
      }

      // ==========================================
      // B) /ekle ADIMLARI
      // ==========================================

      // EKLE ADIM 1: Yemek cevabı geldi -> İçeceği sor
      if (replyToText.includes("➕ [EKLE-ADIM 1]")) {
        const food = userText;
        const nextMsg = 
          `➕ [EKLE-ADIM 2]\n` +
          `[FOOD:${food}]\n\n` +
          `2️⃣ *Yanında ne içtin?*\n` +
          `_(Örn: Kola, Ayran, Fuse Tea Şeftali)_\n\n` +
          `💡 Eğer içmediysen *içmedim* yaz.`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, nextMsg);
        return new Response("OK", { status: 200 });
      }

      // EKLE ADIM 2: İçecek cevabı geldi -> Mekanı sor
      if (replyToText.includes("➕ [EKLE-ADIM 2]")) {
        const food = extractTag(replyToText, "FOOD");
        const drink = isNoDrink(userText) ? "" : userText;

        const nextMsg = 
          `➕ [EKLE-ADIM 3]\n` +
          `[FOOD:${food}] [DRINK:${drink}]\n\n` +
          `3️⃣ *Nerede yedin / Konum neresi?*\n` +
          `_(Örn: Jungle Burger, Yurt, McDonald's)_`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, nextMsg);
        return new Response("OK", { status: 200 });
      }

      // EKLE ADIM 3: Mekan cevabı geldi -> Fiyatı sor
      if (replyToText.includes("➕ [EKLE-ADIM 3]")) {
        const food = extractTag(replyToText, "FOOD");
        const drink = extractTag(replyToText, "DRINK");
        const loc = normalizeLocation(userText);

        const nextMsg = 
          `➕ [EKLE-ADIM 4]\n` +
          `[FOOD:${food}] [DRINK:${drink}] [LOC:${loc}]\n\n` +
          `4️⃣ *Fiyatı ne kadar tuttu?* *(Zorunlu)*\n` +
          `_(Örn: 240 TL)_`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, nextMsg);
        return new Response("OK", { status: 200 });
      }

      // EKLE ADIM 4: Fiyat cevabı geldi -> Kaydet!
      if (replyToText.includes("➕ [EKLE-ADIM 4]")) {
        const food = extractTag(replyToText, "FOOD");
        const drink = extractTag(replyToText, "DRINK");
        const loc = extractTag(replyToText, "LOC");
        const price = formatPrice(userText);

        if (!price) {
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Fiyat girmek zorunludur! Lütfen geçerli bir fiyat yaz (Örn: 240 TL):\n\n${replyToText}`);
          return new Response("OK", { status: 200 });
        }

        const fullTitle = drink ? `${food} + ${drink}` : food;
        const items = drink ? [food, drink] : [food];

        await saveNewMealToGitHub(env.GITHUB_TOKEN, {
          title: fullTitle,
          items: items,
          location: loc,
          price: price,
          category: guessCategory(food),
          emoji: guessEmoji(food)
        });

        const { date, day } = getTurkeyTimeInfo();
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ *Siteye Eklendi!*\n\n📅 ${day} (${date})\n${guessEmoji(food)} *${fullTitle}*\n📍 *Konum:* ${loc}\n💰 *Fiyat:* ${price}\n\n🌐 https://${REPO_OWNER}.github.io/${REPO_NAME}/`);
        return new Response("OK", { status: 200 });
      }

      // --- ANA KOMUTLAR ---

      // 1. /start ve /yardim
      if (userText === "/start" || userText.toLowerCase() === "/yardim" || userText.toLowerCase() === "/help") {
        const helpMsg = 
          "🍔 *Can Ne Yedi? Yönetim Asistanı*\n\n" +
          "Artık yemek ve içecek ayrı ayrı sorulur!\n\n" +
          "📌 *Komutlar:*\n" +
          "• `/ekle` : Yemek, içecek, mekan ve fiyatı adım adım sorarak ekler.\n" +
          "• `/duzenle 1` : 1 numaralı öğünü adım adım düzenler (değiştirmek istemediğine 'aynı', içmediğine 'içmedim' yazabilirsin).\n" +
          "• `/liste` : Son öğünleri numaralarıyla gösterir.\n" +
          "• `/sil 1` : 1 numaralı öğünü siler.\n\n" +
          "🤖 *Doğal Dil ile Hızlı Ekleme:*\n" +
          "• `Mc donaldsda hamburger menü yedim 230 tl yanında fuse tea şeftali`\n\n" +
          "⚠️ *Kural:* Fiyat girmek her zaman zorunludur!";
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, helpMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      // 2. /ekle (Adım adım ekleme başlat)
      if (userText.toLowerCase() === "/ekle" || userText.toLowerCase() === "/yeni") {
        const step1Msg = 
          `➕ [EKLE-ADIM 1]\n\n` +
          `1️⃣ *Ne yedin? (Yemek)*\n` +
          `_(Örn: Hamburger, Tavuk Dürüm, Pizza)_`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, step1Msg);
        return new Response("OK", { status: 200 });
      }

      // 3. /liste
      if (userText.toLowerCase() === "/liste" || userText.toLowerCase() === "/list") {
        const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
        const mealsList = JSON.parse(githubFile.content);
        const flatMeals = getFlattenedMeals(mealsList);

        if (flatMeals.length === 0) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "📭 Henüz kayıtlı öğün bulunmuyor.");
          return new Response("OK", { status: 200 });
        }

        let listMsg = "📋 *Son Eklenen Öğünler:*\n\n";
        flatMeals.slice(0, 8).forEach((item, index) => {
          const num = index + 1;
          const priceStr = item.meal.price ? ` - 💰 *${item.meal.price}*` : "";
          listMsg += `*#${num}* [${item.day}] ${item.meal.emoji || '🍽️'} *${item.meal.title}*\n`;
          listMsg += `   📍 ${item.meal.location}${priceStr}\n\n`;
        });

        listMsg += "💡 *İşlemler:*\n";
        listMsg += "• Düzenlemek için: `/duzenle 1`\n";
        listMsg += "• Silmek için: `/sil 1`";

        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, listMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      // 4. /duzenle <no> (Adım adım düzenleme başlat)
      if (userText.toLowerCase().startsWith("/duzenle")) {
        const parts = userText.split(" ").filter(p => p.trim());
        const targetNum = parseInt(parts[1], 10);
        if (isNaN(targetNum) || targetNum < 1) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Lütfen düzenlemek istediğin öğünün numarasını yaz.\nÖrn: `/duzenle 1`\n(Numaraları görmek için: `/liste`)");
          return new Response("OK", { status: 200 });
        }

        const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
        const mealsList = JSON.parse(githubFile.content);
        const flatMeals = getFlattenedMeals(mealsList);

        if (targetNum > flatMeals.length) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Geçersiz numara! Listede ${flatMeals.length} öğün var.`);
          return new Response("OK", { status: 200 });
        }

        const item = flatMeals[targetNum - 1];
        // Başlığı yemek ve içecek olarak ayırmaya çalış
        let existingFood = item.meal.title;
        let existingDrink = "";
        if (item.meal.title.includes("+")) {
          const split = item.meal.title.split("+");
          existingFood = split[0].trim();
          existingDrink = split.slice(1).join("+").trim();
        }

        const step1Msg = 
          `✏️ [DÜZENLE-ADIM 1]\n` +
          `[NO:${targetNum}] [FOOD:${existingFood}] [DRINK:${existingDrink}] [LOC:${item.meal.location}] [PRICE:${item.meal.price || 'null'}]\n\n` +
          `1️⃣ *Ne yedin? (Yemek)*\n` +
          `Şu anki: _${existingFood}_\n` +
          `_(Örn: Hamburger, Tavuk Dürüm)_\n\n` +
          `💡 Değiştirmek istemiyorsan *aynı* yaz.`;

        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, step1Msg);
        return new Response("OK", { status: 200 });
      }

      // 5. /sil <no>
      if (userText.toLowerCase().startsWith("/sil")) {
        const parts = userText.split(" ").filter(p => p.trim());
        const targetNum = parseInt(parts[1], 10);
        if (isNaN(targetNum) || targetNum < 1) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Lütfen silinecek öğünün numarasını yaz. Örn: `/sil 1`");
          return new Response("OK", { status: 200 });
        }

        const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
        let mealsList = JSON.parse(githubFile.content);
        const flatMeals = getFlattenedMeals(mealsList);

        if (targetNum > flatMeals.length) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Geçersiz numara! Toplam ${flatMeals.length} öğün var.`);
          return new Response("OK", { status: 200 });
        }

        const itemToDelete = flatMeals[targetNum - 1];
        const dayEntry = mealsList.find(d => d.date === itemToDelete.date);
        if (dayEntry) {
          dayEntry.meals = dayEntry.meals.filter(m => m.id !== itemToDelete.meal.id);
          if (dayEntry.meals.length === 0) {
            mealsList = mealsList.filter(d => d.date !== itemToDelete.date);
          }
        }

        await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, JSON.stringify(mealsList, null, 2), `chore: silindi #${targetNum}`);
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `🗑️ *Öğün Silindi!*\n\n*${itemToDelete.meal.title}* siteden kaldırıldı.`);
        return new Response("OK", { status: 200 });
      }

      // 6. Doğal Dil ile Ekleme (AI)
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ Menü analiz ediliyor...");
      let parsedData = null;
      try {
        parsedData = await parseMealWithGemini(userText, env.GEMINI_API_KEY);
      } catch (aiErr) {
        const fallbackMsg = 
          `⚠️ Yapay zeka şu an meşgul.\n` +
          `Öğünü adım adım eklemek için **/ekle** yazabilirsin!`;
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, fallbackMsg);
        return new Response("OK", { status: 200 });
      }

      // Fiyat zorunluluğu
      if (!parsedData.meal.price) {
        const noPriceMsg = 
          `⚠️ *Fiyat girmek zorunludur!*\n\n` +
          `Menüyü anladım: *${parsedData.meal.title}* (${parsedData.meal.location})\n` +
          `Fakat fiyat belirtmemişsin.\n\n` +
          `Lütfen fiyatıyla birlikte tekrar yaz, örn:\n` +
          `👉 \`${userText} 220 TL\`\n` +
          `veya adım adım eklemek için: **/ekle**`;
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, noPriceMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      await saveNewMealToGitHub(env.GITHUB_TOKEN, parsedData.meal, parsedData.date, parsedData.day);

      const successMsg = 
        `✅ *Harika, siteye eklendi!*\n\n` +
        `📅 *Tarih:* ${parsedData.day} (${parsedData.date})\n` +
        `${parsedData.meal.emoji} *Öğün:* ${parsedData.meal.title}\n` +
        `📍 *Konum:* ${parsedData.meal.location}\n` +
        `💰 *Fiyat:* ${parsedData.meal.price}\n\n` +
        `🌐 https://${REPO_OWNER}.github.io/${REPO_NAME}/`;

      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, successMsg, "Markdown");
      return new Response("OK", { status: 200 });

    } catch (error) {
      console.error(error);
      if (currentChatId && env.TELEGRAM_BOT_TOKEN) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, currentChatId, `❌ Hata: ${error.message}`);
      }
      return new Response("Error: " + error.message, { status: 200 });
    }
  }
};

// --- YARDIMCI FONKSİYONLAR ---

function isSame(text) {
  const t = text.trim().toLowerCase();
  return t === "aynı" || t === "ayni" || t === "aynisı" || t === "aynisi" || t === "same";
}

function isNoDrink(text) {
  const t = text.trim().toLowerCase();
  return (
    t === "içmedim" || t === "icmedim" || t === "içmedım" || t === "icmedım" ||
    t === "içmedm" || t === "yok" || t === "yoktu" || t === "hayır" || t === "hayir" ||
    t === "su" || t === "hiçbir şey" || t === "hicbir sey" || t === "-"
  );
}

function extractTag(text, tag) {
  const match = text.match(new RegExp(`\\[${tag}:(.*?)\\]`));
  return match ? match[1].trim() : "";
}

function normalizeLocation(loc) {
  const l = loc.trim().toLowerCase();
  if (l.includes("yurt")) return "Yurt";
  if (l.includes("mc") || l.includes("donald")) return "McDonald's";
  if (l.includes("jungle")) return "Jungle Burger";
  if (l.includes("burger king")) return "Burger King";
  return loc.trim();
}

function formatPrice(p) {
  if (!p) return null;
  const clean = p.trim();
  if (clean.includes("TL") || clean.includes("₺")) return clean;
  return `${clean} TL`;
}

function guessEmoji(title) {
  const l = title.toLowerCase();
  if (l.includes("burger")) return "🍔";
  if (l.includes("dürüm") || l.includes("zater")) return "🌯";
  if (l.includes("pizza")) return "🍕";
  if (l.includes("kahve")) return "☕";
  if (l.includes("tavuk")) return "🍗";
  return "🍽️";
}

function guessCategory(title) {
  const l = title.toLowerCase();
  if (l.includes("burger")) return "Fast Food";
  if (l.includes("dürüm") || l.includes("zater")) return "Dürüm";
  if (l.includes("pizza")) return "Fast Food";
  if (l.includes("kahve")) return "İçecek";
  return "Fast Food";
}

function getFlattenedMeals(mealsList) {
  const result = [];
  const sortedDays = [...mealsList].sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const day of sortedDays) {
    const reversedMeals = [...(day.meals || [])].reverse();
    for (const meal of reversedMeals) {
      result.push({ date: day.date, day: day.day, meal });
    }
  }
  return result;
}

async function saveNewMealToGitHub(token, meal, customDate = null, customDay = null) {
  const githubFile = await getGitHubFile(token);
  let mealsList = JSON.parse(githubFile.content);

  const { date: trDate, day: trDay } = getTurkeyTimeInfo();
  const targetDate = customDate || trDate;
  const targetDay = customDay || trDay;

  const newMeal = {
    id: `${targetDate}-${Date.now().toString().slice(-4)}`,
    title: meal.title,
    items: meal.items || [meal.title],
    location: meal.location || "Yurt",
    category: meal.category || "Fast Food",
    emoji: meal.emoji || "🍽️",
    price: meal.price || null,
    note: meal.note || ""
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
  await updateGitHubFile(token, githubFile.sha, JSON.stringify(mealsList, null, 2), `feat: ${targetDay} öğünü eklendi (${newMeal.title} - ${newMeal.price})`);
}

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

  const models = ["gemini-3.8-flash", "gemini-3.8-flash-lite"];
  for (const m of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nKullanıcı: "${userMessage}"` }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      if (res.ok) {
        const json = await res.json();
        return JSON.parse(json.candidates[0].content.parts[0].text);
      }
    } catch (e) {}
  }
  throw new Error("Gemini servisi meşgul.");
}

async function getGitHubFile(token) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${GITHUB_BRANCH}`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Can-Ne-Yedi-Worker",
      "Accept": "application/vnd.github.v3+json"
    }
  });
  if (!response.ok) throw new Error(`GitHub getFile Hatası: ${response.status}`);
  const data = await response.json();
  const decodedContent = new TextDecoder().decode(Uint8Array.from(atob(data.content), c => c.charCodeAt(0)));
  return { sha: data.sha, content: decodedContent };
}

async function updateGitHubFile(token, sha, content, message) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
  const utf8Bytes = new TextEncoder().encode(content);
  let binary = "";
  for (let i = 0; i < utf8Bytes.length; i++) binary += String.fromCharCode(utf8Bytes[i]);
  const base64Content = btoa(binary);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "Can-Ne-Yedi-Worker",
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message, content: base64Content, sha, branch: GITHUB_BRANCH })
  });
  if (!response.ok) throw new Error(`GitHub updateFile Hatası: ${response.status}`);
  return await response.json();
}

async function sendTelegramMessage(botToken, chatId, text, parseMode = null) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function sendForceReplyMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      force_reply: true,
      selective: true
    }
  };
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
