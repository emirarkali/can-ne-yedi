/**
 * Can Ne Yedi? - Kesintisiz Hafızalı İnteraktif Telegram Botu
 * 
 * Özellikler:
 * - 📅 Tarih sorma (Bugün, dün, 21 Ekim, Salı vb.)
 * - 🔤 Otomatik Baş Harf Büyütme (Türkçe kurallarına uygun: hamburger -> Hamburger)
 * - 🍽️ "Yemedim" desteği (Sadece içecek içildiyse tek başına kaydeder)
 * - 🥤 "İçmedim" desteği (Sadece yemek yendiyse tek başına kaydeder)
 * - ✏️ /duzenle <no> : Tarih, yemek, içecek, mekan ve fiyatı sorar ('aynı' desteğiyle)
 * - ➕ /ekle         : Adım adım sorarak ekler.
 * - 🚫 /iptal        : Devam eden işlemi iptal eder.
 * - 📋 /liste ve 🗑️ /sil <no>
 * - 🕒 Türkiye Yerel Saati (Europe/Istanbul UTC+3)
 */

const REPO_OWNER = "emirarkali";
const REPO_NAME = "can-ne-yedi";
const FILE_PATH = "data/meals.json";
const GITHUB_BRANCH = "main";

const userSessions = new Map();

function getTurkeyTimeInfo(offsetDays = 0) {
  const now = new Date();
  if (offsetDays !== 0) {
    now.setDate(now.getDate() + offsetDays);
  }
  const trDateStr = now.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const dayNamesTr = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const trDateObj = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const trDayName = dayNamesTr[trDateObj.getDay()];
  return { date: trDateStr, day: trDayName };
}

// Türkçe kurallarına göre kelimelerin ilk harfini büyüt
function capitalizeTr(str) {
  if (!str) return "";
  return str.trim().split(/\s+/).map(word => {
    if (!word) return "";
    const firstChar = word.charAt(0).toLocaleUpperCase("tr-TR");
    const rest = word.slice(1).toLocaleLowerCase("tr-TR");
    return firstChar + rest;
  }).join(" ");
}

// Kullanıcının girdiği tarihi çözümle ("bugün", "dün", "21 Ekim", "2026-10-21" vb.)
function parseCustomDate(input) {
  if (!input) return getTurkeyTimeInfo();
  const clean = input.trim().toLowerCase();

  if (clean === "bugün" || clean === "bugun" || clean === "today" || clean === "aynı" || clean === "ayni") {
    return getTurkeyTimeInfo(0);
  }
  if (clean === "dün" || clean === "dun" || clean === "yesterday") {
    return getTurkeyTimeInfo(-1);
  }
  if (clean === "evvelsi gün" || clean === "önceki gün" || clean === "onraki gun") {
    return getTurkeyTimeInfo(-2);
  }

  const dayNamesTr = ["pazar", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi"];
  const foundDayIndex = dayNamesTr.findIndex(d => clean.includes(d));
  if (foundDayIndex !== -1) {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const currentDayIndex = today.getDay();
    let diff = foundDayIndex - currentDayIndex;
    if (diff > 0) diff -= 7; // Geçmişteki o gün
    return getTurkeyTimeInfo(diff);
  }

  // "21 Ekim" veya "21 Ekim 2026"
  const monthNames = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
  const parts = clean.split(/[\s.-]+/);
  if (parts.length >= 2) {
    const dayNum = parseInt(parts[0], 10);
    const monthPart = parts[1];
    let monthNum = monthNames.findIndex(m => monthPart.includes(m));
    if (monthNum === -1 && !isNaN(parseInt(monthPart, 10))) {
      monthNum = parseInt(monthPart, 10) - 1;
    }
    const year = parts[2] ? parseInt(parts[2], 10) : 2026;

    if (!isNaN(dayNum) && monthNum !== -1) {
      const monthStr = String(monthNum + 1).padStart(2, "0");
      const dayStr = String(dayNum).padStart(2, "0");
      const dateStr = `${year}-${monthStr}-${dayStr}`;
      const dObj = new Date(`${dateStr}T12:00:00Z`);
      const trDays = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
      return { date: dateStr, day: trDays[dObj.getDay()] };
    }
  }

  return getTurkeyTimeInfo(0);
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

      // /iptal komutu
      if (userText.toLowerCase() === "/iptal" || userText.toLowerCase() === "iptal") {
        userSessions.delete(chatId);
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "🚫 İşlem iptal edildi.");
        return new Response("OK", { status: 200 });
      }

      const session = userSessions.get(chatId);

      // ============================================================
      // 1. /ekle ADIMLARI
      // ============================================================
      if ((session && session.action === "ekle") || replyToText.includes("[EKLE-ADIM")) {
        let step = session ? session.step : 1;
        if (replyToText.includes("[EKLE-ADIM 1]")) step = 1;
        if (replyToText.includes("[EKLE-ADIM 2]")) step = 2;
        if (replyToText.includes("[EKLE-ADIM 3]")) step = 3;
        if (replyToText.includes("[EKLE-ADIM 4]")) step = 4;
        if (replyToText.includes("[EKLE-ADIM 5]")) step = 5;

        // ADIM 1: Tarih seçildi -> Yemeği sor
        if (step === 1) {
          const dateInfo = parseCustomDate(userText);
          userSessions.set(chatId, { action: "ekle", step: 2, dateInfo });

          const q2 = 
            `➕ [EKLE-ADIM 2]\n` +
            `[DATE:${dateInfo.date}|${dateInfo.day}]\n\n` +
            `📅 Seçilen Gün: *${dateInfo.day} (${dateInfo.date})*\n\n` +
            `2️⃣ *Ne yedin? (Yemek)*\n` +
            `_(Örn: Hamburger, Tavuk Dürüm, Pizza)_\n\n` +
            `💡 Eğer yemek yemediysen *yemedim* yaz.`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q2, "Örn: Hamburger veya yemedim");
          return new Response("OK", { status: 200 });
        }

        // ADIM 2: Yemek yazıldı -> İçeceği sor
        if (step === 2) {
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const food = isNoFood(userText) ? "" : capitalizeTr(userText);
          userSessions.set(chatId, { action: "ekle", step: 3, dateInfo, food });

          const q3 = 
            `➕ [EKLE-ADIM 3]\n` +
            `[DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${food}]\n\n` +
            `3️⃣ *Yanında ne içtin? (İçecek)*\n` +
            `_(Örn: Kola, Ayran, Fuse Tea Şeftali)_\n\n` +
            `💡 Eğer içmediysen *içmedim* yaz.`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q3, "Örn: Ayran veya içmedim");
          return new Response("OK", { status: 200 });
        }

        // ADIM 3: İçecek yazıldı -> Mekanı sor
        if (step === 3) {
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
          const drink = isNoDrink(userText) ? "" : capitalizeTr(userText);

          if (!food && !drink) {
            userSessions.delete(chatId);
            await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Hem yemek yemedim hem içecek içmedim dedin, kaydedilecek bir şey yok! İşlem iptal edildi.");
            return new Response("OK", { status: 200 });
          }

          userSessions.set(chatId, { action: "ekle", step: 4, dateInfo, food, drink });

          const q4 = 
            `➕ [EKLE-ADIM 4]\n` +
            `[DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${food}] [DRINK:${drink}]\n\n` +
            `4️⃣ *Nerede yedin / Konum neresi?*\n` +
            `_(Örn: Jungle Burger, Yurt, McDonald's)_`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q4, "Örn: Jungle Burger");
          return new Response("OK", { status: 200 });
        }

        // ADIM 4: Mekan yazıldı -> Fiyatı sor
        if (step === 4) {
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
          const drink = (session && session.drink !== undefined) ? session.drink : extractTag(replyToText, "DRINK");
          const loc = normalizeLocation(userText);
          userSessions.set(chatId, { action: "ekle", step: 5, dateInfo, food, drink, loc });

          const q5 = 
            `➕ [EKLE-ADIM 5]\n` +
            `[DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${food}] [DRINK:${drink}] [LOC:${loc}]\n\n` +
            `5️⃣ *Fiyatı ne kadar tuttu?*\n` +
            `_(Örn: 240 TL)_`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q5, "Örn: 240 TL");
          return new Response("OK", { status: 200 });
        }

        // ADIM 5: Fiyat yazıldı -> Kaydet!
        if (step === 5) {
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
          const drink = (session && session.drink !== undefined) ? session.drink : extractTag(replyToText, "DRINK");
          const loc = (session && session.loc) || extractTag(replyToText, "LOC");
          const price = formatPrice(userText);

          if (!price) {
            await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Lütfen geçerli bir fiyat yazın (Örn: 240 TL):`, "Örn: 240 TL");
            return new Response("OK", { status: 200 });
          }

          userSessions.delete(chatId);

          let fullTitle = food;
          let items = [food];
          if (food && drink) {
            fullTitle = `${food} + ${drink}`;
            items = [food, drink];
          } else if (!food && drink) {
            fullTitle = drink;
            items = [drink];
          }

          const primaryItem = food || drink;

          await saveNewMealToGitHub(env.GITHUB_TOKEN, {
            title: fullTitle,
            items: items,
            location: loc,
            price: price,
            category: guessCategory(primaryItem),
            emoji: guessEmoji(primaryItem)
          }, dateInfo.date, dateInfo.day);

          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ *Siteye Eklendi!*\n\n📅 ${dateInfo.day} (${dateInfo.date})\n${guessEmoji(primaryItem)} *${fullTitle}*\n📍 *Konum:* ${loc}\n💰 *Fiyat:* ${price}\n\n🌐 https://${REPO_OWNER}.github.io/${REPO_NAME}/`);
          return new Response("OK", { status: 200 });
        }
      }

      // ============================================================
      // 2. /duzenle ADIMLARI
      // ============================================================
      if ((session && session.action === "duzenle") || replyToText.includes("[DÜZENLE-ADIM")) {
        let step = session ? session.step : 1;
        if (replyToText.includes("[DÜZENLE-ADIM 1]")) step = 1;
        if (replyToText.includes("[DÜZENLE-ADIM 2]")) step = 2;
        if (replyToText.includes("[DÜZENLE-ADIM 3]")) step = 3;
        if (replyToText.includes("[DÜZENLE-ADIM 4]")) step = 4;
        if (replyToText.includes("[DÜZENLE-ADIM 5]")) step = 5;

        // DÜZENLE ADIM 1: Tarih cevabı geldi -> Yemeği sor
        if (step === 1) {
          const mealNum = (session && session.mealNum) || extractTag(replyToText, "NO");
          const oldDate = (session && session.oldDate) || extractTag(replyToText, "DATE");
          const oldDay = (session && session.oldDay) || extractTag(replyToText, "DAY");
          const oldFood = (session && session.oldFood) || extractTag(replyToText, "FOOD");
          const oldDrink = (session && session.oldDrink) || extractTag(replyToText, "DRINK");
          const oldLoc = (session && session.oldLoc) || extractTag(replyToText, "LOC");
          const oldPrice = (session && session.oldPrice) || extractTag(replyToText, "PRICE");

          const newDateInfo = isSame(userText) ? { date: oldDate, day: oldDay } : parseCustomDate(userText);
          userSessions.set(chatId, { action: "duzenle", step: 2, mealNum, dateInfo: newDateInfo, oldFood, oldDrink, oldLoc, oldPrice });

          const q2 = 
            `✏️ [DÜZENLE-ADIM 2]\n` +
            `[NO:${mealNum}] [DATE:${newDateInfo.date}|${newDateInfo.day}] [FOOD:${oldFood}] [DRINK:${oldDrink}] [LOC:${oldLoc}] [PRICE:${oldPrice}]\n\n` +
            `2️⃣ *Ne yedin? (Yemek)*\n` +
            `Şu anki: _${oldFood || 'Yok'}_\n` +
            `_(Örn: Hamburger, Tavuk Dürüm)_\n\n` +
            `💡 Değiştirmek istemiyorsan *aynı*, yemek yoksa *yemedim* yaz.`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q2, "Örn: Hamburger veya aynı");
          return new Response("OK", { status: 200 });
        }

        // DÜZENLE ADIM 2: Yemek cevabı geldi -> İçeceği sor
        if (step === 2) {
          const mealNum = (session && session.mealNum) || extractTag(replyToText, "NO");
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const oldFood = (session && session.oldFood) || extractTag(replyToText, "FOOD");
          const oldDrink = (session && session.oldDrink) || extractTag(replyToText, "DRINK");
          const oldLoc = (session && session.oldLoc) || extractTag(replyToText, "LOC");
          const oldPrice = (session && session.oldPrice) || extractTag(replyToText, "PRICE");

          let newFood = oldFood;
          if (isNoFood(userText)) newFood = "";
          else if (!isSame(userText)) newFood = capitalizeTr(userText);

          userSessions.set(chatId, { action: "duzenle", step: 3, mealNum, dateInfo, food: newFood, oldDrink, oldLoc, oldPrice });

          const q3 = 
            `✏️ [DÜZENLE-ADIM 3]\n` +
            `[NO:${mealNum}] [DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${newFood}] [DRINK:${oldDrink}] [LOC:${oldLoc}] [PRICE:${oldPrice}]\n\n` +
            `3️⃣ *Yanında ne içtin? (İçecek)*\n` +
            `Şu anki: _${oldDrink || 'İçilmedi'}_\n` +
            `_(Örn: Kola, Ayran, Fuse Tea Şeftali)_\n\n` +
            `💡 Değiştirmek istemiyorsan *aynı*, içmediysen *içmedim* yaz.`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q3, "Örn: Ayran veya aynı");
          return new Response("OK", { status: 200 });
        }

        // DÜZENLE ADIM 3: İçecek cevabı geldi -> Mekanı sor
        if (step === 3) {
          const mealNum = (session && session.mealNum) || extractTag(replyToText, "NO");
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
          const oldDrink = (session && session.oldDrink) || extractTag(replyToText, "DRINK");
          const oldLoc = (session && session.oldLoc) || extractTag(replyToText, "LOC");
          const oldPrice = (session && session.oldPrice) || extractTag(replyToText, "PRICE");

          let newDrink = oldDrink;
          if (isNoDrink(userText)) newDrink = "";
          else if (!isSame(userText)) newDrink = capitalizeTr(userText);

          userSessions.set(chatId, { action: "duzenle", step: 4, mealNum, dateInfo, food, drink: newDrink, oldLoc, oldPrice });

          const q4 = 
            `✏️ [DÜZENLE-ADIM 4]\n` +
            `[NO:${mealNum}] [DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${food}] [DRINK:${newDrink}] [LOC:${oldLoc}] [PRICE:${oldPrice}]\n\n` +
            `4️⃣ *Nerede yedin / Konum neresi?*\n` +
            `Şu anki: _${oldLoc}_\n` +
            `_(Örn: Jungle Burger, Yurt, McDonald's)_\n\n` +
            `💡 Değiştirmek istemiyorsan *aynı* yaz.`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q4, "Örn: Jungle Burger veya aynı");
          return new Response("OK", { status: 200 });
        }

        // DÜZENLE ADIM 4: Mekan cevabı geldi -> Fiyatı sor
        if (step === 4) {
          const mealNum = (session && session.mealNum) || extractTag(replyToText, "NO");
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
          const drink = (session && session.drink !== undefined) ? session.drink : extractTag(replyToText, "DRINK");
          const oldLoc = (session && session.oldLoc) || extractTag(replyToText, "LOC");
          const oldPrice = (session && session.oldPrice) || extractTag(replyToText, "PRICE");

          const newLoc = isSame(userText) ? oldLoc : normalizeLocation(userText);
          userSessions.set(chatId, { action: "duzenle", step: 5, mealNum, dateInfo, food, drink, loc: newLoc, oldPrice });

          const q5 = 
            `✏️ [DÜZENLE-ADIM 5]\n` +
            `[NO:${mealNum}] [DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${food}] [DRINK:${drink}] [LOC:${newLoc}] [PRICE:${oldPrice}]\n\n` +
            `5️⃣ *Fiyatı ne kadar tuttu?*\n` +
            `Şu anki: _${oldPrice}_\n` +
            `_(Örn: 240 TL)_\n\n` +
            `💡 Değiştirmek istemiyorsan *aynı* yaz.`;
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q5, "Örn: 240 TL veya aynı");
          return new Response("OK", { status: 200 });
        }

        // DÜZENLE ADIM 5: Fiyat cevabı geldi -> Kaydet!
        if (step === 5) {
          const mealNum = parseInt((session && session.mealNum) || extractTag(replyToText, "NO"), 10);
          const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
          const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
          const drink = (session && session.drink !== undefined) ? session.drink : extractTag(replyToText, "DRINK");
          const loc = (session && session.loc) || extractTag(replyToText, "LOC");
          const oldPrice = (session && session.oldPrice) || extractTag(replyToText, "PRICE");

          let price = isSame(userText) ? oldPrice : formatPrice(userText);
          if (!price || price === "null") {
            await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Lütfen fiyatı yazın (örn: 220 TL):`, "Örn: 220 TL");
            return new Response("OK", { status: 200 });
          }

          userSessions.delete(chatId);

          let fullTitle = food;
          let items = [food];
          if (food && drink) {
            fullTitle = `${food} + ${drink}`;
            items = [food, drink];
          } else if (!food && drink) {
            fullTitle = drink;
            items = [drink];
          }
          const primaryItem = food || drink;

          const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
          let mealsList = JSON.parse(githubFile.content);
          const flatMeals = getFlattenedMeals(mealsList);

          if (mealNum < 1 || mealNum > flatMeals.length) {
            await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Düzenlenecek öğün bulunamadı.");
            return new Response("OK", { status: 200 });
          }

          const oldItem = flatMeals[mealNum - 1];
          // Eski günden çıkar
          const oldDayEntry = mealsList.find(d => d.date === oldItem.date);
          if (oldDayEntry) {
            oldDayEntry.meals = oldDayEntry.meals.filter(m => m.id !== oldItem.meal.id);
            if (oldDayEntry.meals.length === 0) {
              mealsList = mealsList.filter(d => d.date !== oldItem.date);
            }
          }

          // Yeni güne ekle
          const updatedMeal = {
            id: `${dateInfo.date}-${Date.now().toString().slice(-4)}`,
            title: fullTitle,
            items: items,
            location: loc,
            price: price,
            emoji: guessEmoji(primaryItem),
            category: guessCategory(primaryItem),
            note: ""
          };

          let targetDayEntry = mealsList.find(d => d.date === dateInfo.date);
          if (targetDayEntry) {
            targetDayEntry.meals.push(updatedMeal);
          } else {
            mealsList.push({
              date: dateInfo.date,
              day: dateInfo.day,
              meals: [updatedMeal]
            });
          }

          mealsList.sort((a, b) => new Date(a.date) - new Date(b.date));

          await updateGitHubFile(env.GITHUB_TOKEN, githubFile.sha, JSON.stringify(mealsList, null, 2), `fix: düzenlendi #${mealNum} (${fullTitle})`);
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ *Öğün Başarıyla Güncellendi!*\n\n📅 ${dateInfo.day} (${dateInfo.date})\n${guessEmoji(primaryItem)} *${fullTitle}*\n📍 *Konum:* ${loc}\n💰 *Fiyat:* ${price}\n\nSite güncellendi! 🌐`);
          return new Response("OK", { status: 200 });
        }
      }

      // ============================================================
      // 3. ANA KOMUTLAR
      // ============================================================

      // /start ve /yardim
      if (userText === "/start" || userText.toLowerCase() === "/yardim" || userText.toLowerCase() === "/help") {
        const helpMsg = 
          "🍔 *Can Ne Yedi? Yönetim Asistanı*\n\n" +
          "📌 *Komutlar:*\n" +
          "• `/ekle` : Tarih, yemek, içecek, mekan ve fiyatı adım adım sorarak ekler.\n" +
          "• `/duzenle 1` : 1 numaralı öğünü adım adım düzenler (değiştirmek istemediğine 'aynı' yazabilirsin).\n" +
          "• `/liste` : Son öğünleri numaralarıyla gösterir.\n" +
          "• `/sil 1` : 1 numaralı öğünü siler.\n" +
          "• `/iptal` : Devam eden işlemi iptal eder.\n\n" +
          "🤖 *Doğal Dil ile Hızlı Ekleme:*\n" +
          "• `Mc donaldsda hamburger menü yedim 230 tl yanında fuse tea şeftali`";
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, helpMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      // /ekle (Adım adım ekleme başlat)
      if (userText.toLowerCase() === "/ekle" || userText.toLowerCase() === "/yeni") {
        userSessions.set(chatId, { action: "ekle", step: 1 });
        const { date: todayDate, day: todayDay } = getTurkeyTimeInfo();
        const step1Msg = 
          `➕ [EKLE-ADIM 1]\n\n` +
          `1️⃣ *Hangi gün için ekliyorsun?*\n` +
          `_(Örn: 'bugün', 'dün', '21 Ekim' veya 'Salı')_\n\n` +
          `💡 Bugün için doğrudan *bugün* yazabilirsin (${todayDay}).`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, step1Msg, "Örn: bugün veya dün");
        return new Response("OK", { status: 200 });
      }

      // /liste
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

      // /duzenle <no>
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
        let existingFood = item.meal.title;
        let existingDrink = "";
        if (item.meal.title.includes("+")) {
          const split = item.meal.title.split("+");
          existingFood = split[0].trim();
          existingDrink = split.slice(1).join("+").trim();
        }

        userSessions.set(chatId, {
          action: "duzenle",
          step: 1,
          mealNum: targetNum,
          oldDate: item.date,
          oldDay: item.day,
          oldFood: existingFood,
          oldDrink: existingDrink,
          oldLoc: item.meal.location,
          oldPrice: item.meal.price || "null"
        });

        const step1Msg = 
          `✏️ [DÜZENLE-ADIM 1]\n` +
          `[NO:${targetNum}] [DATE:${item.date}] [DAY:${item.day}] [FOOD:${existingFood}] [DRINK:${existingDrink}] [LOC:${item.meal.location}] [PRICE:${item.meal.price || 'null'}]\n\n` +
          `1️⃣ *Hangi gün için düzenliyorsun?*\n` +
          `Şu anki: _${item.day} (${item.date})_\n` +
          `_(Örn: 'aynı', 'bugün', 'dün' veya '21 Ekim')_\n\n` +
          `💡 Değiştirmek istemiyorsan *aynı* yaz.`;

        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, step1Msg, "Örn: aynı veya dün");
        return new Response("OK", { status: 200 });
      }

      // /sil <no>
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

      // ============================================================
      // 4. Doğal Dil ile Ekleme (AI)
      // ============================================================
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

      if (!parsedData.meal.price) {
        const noPriceMsg = 
          `⚠️ Menüyü anladım: *${parsedData.meal.title}* (${parsedData.meal.location})\n` +
          `Fakat fiyat belirtmemişsin.\n\n` +
          `Lütfen fiyatıyla birlikte tekrar yaz, örn:\n` +
          `👉 \`${userText} 220 TL\`\n` +
          `veya adım adım eklemek için: **/ekle**`;
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, noPriceMsg, "Markdown");
        return new Response("OK", { status: 200 });
      }

      // Baş harfleri büyüt
      parsedData.meal.title = capitalizeTr(parsedData.meal.title);
      parsedData.meal.location = normalizeLocation(parsedData.meal.location);

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

function isNoFood(text) {
  const t = text.trim().toLowerCase();
  return (
    t === "yemedim" || t === "yemedım" || t === "yemedm" || t === "yok" ||
    t === "yoktu" || t === "hayır" || t === "hayir" || t === "hiçbir şey" ||
    t === "hicbir sey" || t === "-"
  );
}

function extractTag(text, tag) {
  const match = text.match(new RegExp(`\\[${tag}:(.*?)\\]`));
  return match ? match[1].trim() : "";
}

function normalizeLocation(loc) {
  if (!loc) return "Yurt";
  const l = loc.trim().toLowerCase();
  if (l.includes("yurt")) return "Yurt";
  if (l.includes("mc") || l.includes("donald")) return "McDonald's";
  if (l.includes("jungle")) return "Jungle Burger";
  if (l.includes("burger king")) return "Burger King";
  return capitalizeTr(loc);
}

function formatPrice(p) {
  if (!p) return null;
  const clean = p.trim();
  if (clean.includes("TL") || clean.includes("₺")) return clean;
  return `${clean} TL`;
}

function guessEmoji(title) {
  if (!title) return "🍽️";
  const l = title.toLowerCase();
  if (l.includes("burger")) return "🍔";
  if (l.includes("dürüm") || l.includes("zater")) return "🌯";
  if (l.includes("pizza")) return "🍕";
  if (l.includes("kahve") || l.includes("kola") || l.includes("ayran") || l.includes("tea")) return "🥤";
  if (l.includes("tavuk")) return "🍗";
  return "🍽️";
}

function guessCategory(title) {
  if (!title) return "Fast Food";
  const l = title.toLowerCase();
  if (l.includes("burger")) return "Fast Food";
  if (l.includes("dürüm") || l.includes("zater")) return "Dürüm";
  if (l.includes("pizza")) return "Fast Food";
  if (l.includes("kahve") || l.includes("kola") || l.includes("ayran") || l.includes("tea")) return "İçecek";
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

async function sendForceReplyMessage(botToken, chatId, text, placeholder = "") {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      force_reply: true,
      input_field_placeholder: placeholder
    }
  };
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
