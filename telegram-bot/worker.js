/**
 * Can Ne Yedi? - Tek Dokunuşla Şablonlu Düzenleme & Telegram Botu
 * 
 * Özellikler:
 * - ✏️ /duzenle : Argümansız listeyi açar, numarayı seçtirir.
 * - 📋 Seçilen öğünün parametrelerini tek tıkla kopyalanabilir hazır şablon olarak verir!
 *    Kullanıcı mesaj kutusuna yapıştırıp istediği satırı değiştirip gönderir.
 * - 🗑️ /sil     : Listeyi açar, numara ile sildirir.
 * - ➕ /ekle     : Adım adım sorarak ekler.
 * - 🔒 Sadece @emirarkali ve @fiFonee
 * - 🕒 Türkiye Yerel Saati (Europe/Istanbul UTC+3)
 */

const REPO_OWNER = "emirarkali";
const REPO_NAME = "can-ne-yedi";
const FILE_PATH = "data/meals.json";
const GITHUB_BRANCH = "main";

const ALLOWED_USERNAMES = ["emirarkali", "fifonee"];
const userSessions = new Map();
const processedUpdateIds = new Set();

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

function capitalizeTr(str) {
  if (!str) return "";
  return str.trim().split(/\s+/).map(word => {
    if (!word) return "";
    const firstChar = word.charAt(0).toLocaleUpperCase("tr-TR");
    const rest = word.slice(1).toLocaleLowerCase("tr-TR");
    return firstChar + rest;
  }).join(" ");
}

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
    if (diff > 0) diff -= 7;
    return getTurkeyTimeInfo(diff);
  }

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
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Can Ne Yedi Telegram Bot Webhook Active! 🍔", { status: 200 });
    }

    try {
      const update = await request.json();
      
      if (update.update_id && processedUpdateIds.has(update.update_id)) {
        return new Response("OK", { status: 200 });
      }
      if (update.update_id) {
        processedUpdateIds.add(update.update_id);
        if (processedUpdateIds.size > 200) {
          const first = processedUpdateIds.values().next().value;
          processedUpdateIds.delete(first);
        }
      }

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(handleIncomingUpdate(update, env));
      } else {
        await handleIncomingUpdate(update, env);
      }

      return new Response("OK", { status: 200 });
    } catch (e) {
      console.error("Webhook fetch error:", e);
      return new Response("OK", { status: 200 });
    }
  }
};

async function handleIncomingUpdate(update, env) {
  if (!update.message || !update.message.text) return;

  const chatId = update.message.chat.id;
  const userText = update.message.text.trim();
  const replyToText = update.message.reply_to_message ? update.message.reply_to_message.text : "";

  try {
    // 🔒 Yetki Kontrolü
    const fromUsername = update.message.from && update.message.from.username 
      ? update.message.from.username.toLowerCase().replace("@", "") 
      : "";

    const isAuthorized = ALLOWED_USERNAMES.includes(fromUsername) || 
      (env.ALLOWED_CHAT_ID && String(chatId) === String(env.ALLOWED_CHAT_ID));

    if (!isAuthorized) {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⛔ Üzgünüm, bu bot sadece yetkili kullanıcılar (@emirarkali ve @fiFonee) tarafından kullanılabilir.");
      return;
    }

    // /iptal
    if (userText.toLowerCase() === "/iptal" || userText.toLowerCase() === "iptal") {
      userSessions.delete(chatId);
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "🚫 İşlem iptal edildi.");
      return;
    }

    const session = userSessions.get(chatId);

    // ============================================================
    // A) /duzenle - ADIM 2: KULLANICI DÜZENLENMİŞ METNİ GÖNDERDİĞİNDE
    // ============================================================
    if ((session && session.action === "duzenle_submit") || replyToText.includes("[DÜZENLEME ŞABLONU]")) {
      const mealNum = (session && session.mealNum) || parseInt(extractTag(replyToText, "NO"), 10);
      const originalDate = (session && session.originalDate) || extractTag(replyToText, "ORIG_DATE");

      const lines = userText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      
      let food = "";
      let drink = "";
      let loc = "Yurt";
      let price = "";
      let customDate = originalDate;

      // Kullanıcı etiketli mi yazdı ("Yemek: ...") yoksa düz 4 satır mı?
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith("yemek:")) food = line.slice(6).trim();
        else if (lower.startsWith("içecek:") || lower.startsWith("icecek:")) drink = line.slice(7).trim();
        else if (lower.startsWith("konum:") || lower.startsWith("mekan:")) loc = line.slice(6).trim();
        else if (lower.startsWith("fiyat:")) price = line.slice(6).trim();
        else if (lower.startsWith("tarih:")) customDate = line.slice(6).trim();
      }

      // Eğer etiketli yazılmadıysa sırayla satırları al
      if (!food && lines.length >= 1) {
        food = lines[0];
        if (lines.length >= 2) drink = lines[1];
        if (lines.length >= 3) loc = lines[2];
        if (lines.length >= 4) price = lines[3];
        if (lines.length >= 5) customDate = lines[4];
      }

      // Temizlikler
      if (isNoFood(food)) food = "";
      else food = capitalizeTr(food);

      if (isNoDrink(drink)) drink = "";
      else drink = capitalizeTr(drink);

      loc = normalizeLocation(loc);
      price = formatPrice(price);

      if (!food && !drink) {
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Yemek veya içecekten en az birini yazmalısın. Lütfen tekrar düzenleyip gönderin:\n\n[DÜZENLEME ŞABLONU]");
        return;
      }

      if (!price) {
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Fiyat zorunludur! Lütfen fiyatı da ekleyerek tekrar gönderin (Örn: 220 TL):\n\n[DÜZENLEME ŞABLONU]");
        return;
      }

      const dateInfo = parseCustomDate(customDate);
      userSessions.delete(chatId);

      const statusMsg = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ Düzenleme siteye kaydediliyor...");
      const statusMsgId = statusMsg ? statusMsg.message_id : null;

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

      if (isNaN(mealNum) || mealNum < 1 || mealNum > flatMeals.length) {
        await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, statusMsgId, "⚠️ Düzenlenecek öğün numarası bulunamadı.");
        return;
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
      const okText = `✅ *#${mealNum} Numaralı Öğün Güncellendi!*\n\n📅 ${dateInfo.day} (${dateInfo.date})\n${guessEmoji(primaryItem)} *${fullTitle}*\n📍 *Konum:* ${loc}\n💰 *Fiyat:* ${price}\n\nSite güncellendi! 🌐`;
      await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, statusMsgId, okText);
      return;
    }

    // ============================================================
    // B) /duzenle - ADIM 1: KULLANICI NUMARAYI SEÇTİĞİNDE
    // ============================================================
    if (session && session.action === "duzenle_select_num") {
      const targetNum = parseInt(userText, 10);
      if (isNaN(targetNum) || targetNum < 1) {
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Lütfen düzenlemek istediğin öğünün sadece numarasını yaz (Örn: 1):", "Örn: 1");
        return;
      }

      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      const mealsList = JSON.parse(githubFile.content);
      const flatMeals = getFlattenedMeals(mealsList);

      if (targetNum > flatMeals.length) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Geçersiz numara! Listede ${flatMeals.length} öğün var.`);
        return;
      }

      const item = flatMeals[targetNum - 1];
      let existingFood = item.meal.title;
      let existingDrink = "içmedim";
      if (item.meal.title.includes("+")) {
        const split = item.meal.title.split("+");
        existingFood = split[0].trim();
        existingDrink = split.slice(1).join("+").trim();
      }

      // Kullanıcının oturumunu güncelle: artık şablonu bekliyoruz
      userSessions.set(chatId, {
        action: "duzenle_submit",
        mealNum: targetNum,
        originalDate: item.date
      });

      // Tek dokunuşla kopyalanabilir hazır şablon
      const templateText = 
        `Yemek: ${existingFood}\n` +
        `İçecek: ${existingDrink}\n` +
        `Konum: ${item.meal.location}\n` +
        `Fiyat: ${item.meal.price || '200 TL'}\n` +
        `Tarih: ${item.date}`;

      const promptMsg = 
        `✏️ *#${targetNum} Numaralı Öğün Seçildi!*\n\n` +
        `Aşağıdaki gri kutucuğa **tek dokunarak kopyala**, mesaj kutuna yapıştır, istediğin satırı değiştirip gönder:\n\n` +
        `\`\`\`\n${templateText}\n\`\`\`\n\n` +
        `[DÜZENLEME ŞABLONU] [NO:${targetNum}] [ORIG_DATE:${item.date}]\n` +
        `💡 İçecek yoksa "içmedim" yazabilirsin. İptal için: /iptal`;

      await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, promptMsg, "Şablonu yapıştırıp düzenleyin...");
      return;
    }

    // ============================================================
    // 0. /sil BEKLEME MODU
    // ============================================================
    if ((session && session.action === "sil") || replyToText.includes("[SİLME MODU]")) {
      const targetNum = parseInt(userText, 10);
      if (isNaN(targetNum) || targetNum < 1) {
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Lütfen silmek istediğin öğünün sadece numarasını yaz (Örn: 1):\n\n[SİLME MODU]", "Örn: 1");
        return;
      }

      userSessions.delete(chatId);

      const statusMsg = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ Öğün siteden siliniyor...");
      const statusMsgId = statusMsg ? statusMsg.message_id : null;

      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      let mealsList = JSON.parse(githubFile.content);
      const flatMeals = getFlattenedMeals(mealsList);

      if (targetNum > flatMeals.length) {
        await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, statusMsgId, `⚠️ Geçersiz numara! Listede toplam ${flatMeals.length} öğün var.`);
        return;
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
      await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, statusMsgId, `🗑️ *Öğün Silindi!*\n\n*${itemToDelete.meal.title}* siteden kaldırıldı.`);
      return;
    }

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

      if (step === 1) {
        const dateInfo = parseCustomDate(userText);
        userSessions.set(chatId, { action: "ekle", step: 2, dateInfo });

        const q2 = 
          `➕ [EKLE-ADIM 2]\n` +
          `[DATE:${dateInfo.date}|${dateInfo.day}]\n\n` +
          `📅 Seçilen Gün: *${dateInfo.day} (${dateInfo.date})*\n\n` +
          `2️⃣ *Ne yedin? (Yemek)*\n` +
          `_(Örn: Hamburger, Çiğ Köfte, Pizza)_\n\n` +
          `💡 Eğer yemek yemediysen *yemedim* yaz.`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q2, "Örn: Hamburger veya yemedim");
        return;
      }

      if (step === 2) {
        const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
        const food = isNoFood(userText) ? "" : capitalizeTr(userText);
        userSessions.set(chatId, { action: "ekle", step: 3, dateInfo, food });

        const q3 = 
          `➕ [EKLE-ADIM 3]\n` +
          `[DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${food}]\n\n` +
          `3️⃣ *Yanında ne içtin? (İçecek)*\n` +
          `_(Örn: Şalgam, Ayran, Kola, Fuse Tea)_\n\n` +
          `💡 Eğer içmediysen *içmedim* yaz.`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q3, "Örn: Şalgam veya içmedim");
        return;
      }

      if (step === 3) {
        const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
        const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
        const drink = isNoDrink(userText) ? "" : capitalizeTr(userText);

        if (!food && !drink) {
          userSessions.delete(chatId);
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⚠️ Hem yemek yemedim hem içecek içmedim dedin, kaydedilecek bir şey yok! İşlem iptal edildi.");
          return;
        }

        userSessions.set(chatId, { action: "ekle", step: 4, dateInfo, food, drink });

        const q4 = 
          `➕ [EKLE-ADIM 4]\n` +
          `[DATE:${dateInfo.date}|${dateInfo.day}] [FOOD:${food}] [DRINK:${drink}]\n\n` +
          `4️⃣ *Nerede yedin / Konum neresi?*\n` +
          `_(Örn: Yurt, Jungle Burger, McDonald's)_`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q4, "Örn: Yurt");
        return;
      }

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
          `_(Örn: 140 TL)_`;
        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, q5, "Örn: 140 TL");
        return;
      }

      if (step === 5) {
        const dateInfo = (session && session.dateInfo) || parseCustomDate(extractTag(replyToText, "DATE"));
        const food = (session && session.food !== undefined) ? session.food : extractTag(replyToText, "FOOD");
        const drink = (session && session.drink !== undefined) ? session.drink : extractTag(replyToText, "DRINK");
        const loc = (session && session.loc) || extractTag(replyToText, "LOC");
        const price = formatPrice(userText);

        if (!price) {
          await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Lütfen geçerli bir fiyat yazın (Örn: 140 TL):`, "Örn: 140 TL");
          return;
        }

        userSessions.delete(chatId);

        const statusMsg = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ Siteye kaydediliyor...");
        const statusMsgId = statusMsg ? statusMsg.message_id : null;

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

        const okText = `✅ *Siteye Eklendi!*\n\n📅 ${dateInfo.day} (${dateInfo.date})\n${guessEmoji(primaryItem)} *${fullTitle}*\n📍 *Konum:* ${loc}\n💰 *Fiyat:* ${price}\n\n🌐 https://${REPO_OWNER}.github.io/${REPO_NAME}/`;
        await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, statusMsgId, okText);
        return;
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
        "• `/ekle` : Adım adım sorarak yeni öğün ekler.\n" +
        "• `/duzenle` : Listeyi açar, seçtiğin öğünün parametrelerini kopyalanabilir şablon olarak verir!\n" +
        "• `/liste` : Son öğünleri numaralarıyla gösterir.\n" +
        "• `/sil` : Listeyi açar ve numarasını sorarak sildirir.\n" +
        "• `/iptal` : Devam eden işlemi iptal eder.\n\n" +
        "🤖 *Doğal Dil ile Hızlı Ekleme:*\n" +
        "• `Mc donaldsda hamburger menü yedim 230 tl yanında fuse tea şeftali`";
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, helpMsg, "Markdown");
      return;
    }

    // /ekle
    if (userText.toLowerCase() === "/ekle" || userText.toLowerCase() === "/yeni") {
      userSessions.set(chatId, { action: "ekle", step: 1 });
      const { date: todayDate, day: todayDay } = getTurkeyTimeInfo();
      const step1Msg = 
        `➕ [EKLE-ADIM 1]\n\n` +
        `1️⃣ *Hangi gün için ekliyorsun?*\n` +
        `_(Örn: 'bugün', 'dün', '21 Ekim' veya 'Salı')_\n\n` +
        `💡 Bugün için doğrudan *bugün* yazabilirsin (${todayDay}).`;
      await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, step1Msg, "Örn: bugün veya dün");
      return;
    }

    // /liste
    if (userText.toLowerCase() === "/liste" || userText.toLowerCase() === "/list") {
      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      const mealsList = JSON.parse(githubFile.content);
      const flatMeals = getFlattenedMeals(mealsList);

      if (flatMeals.length === 0) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "📭 Henüz kayıtlı öğün bulunmuyor.");
        return;
      }

      let listMsg = "📋 *Son Eklenen Öğünler:*\n\n";
      flatMeals.slice(0, 8).forEach((item, index) => {
        const num = index + 1;
        const priceStr = item.meal.price ? ` - 💰 *${item.meal.price}*` : "";
        listMsg += `*#${num}* [${item.day}] ${item.meal.emoji || '🍽️'} *${item.meal.title}*\n`;
        listMsg += `   📍 ${item.meal.location}${priceStr}\n\n`;
      });

      listMsg += "💡 *İşlemler:*\n";
      listMsg += "• Düzenlemek için: `/duzenle`\n";
      listMsg += "• Silmek için: `/sil`";

      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, listMsg, "Markdown");
      return;
    }

    // /duzenle (ARGÜMANSIZ: Önce listeyi açar, numarayı seçtirir!)
    if (userText.toLowerCase() === "/duzenle" || userText.toLowerCase().startsWith("/duzenle ")) {
      const parts = userText.split(" ").filter(p => p.trim());
      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      const mealsList = JSON.parse(githubFile.content);
      const flatMeals = getFlattenedMeals(mealsList);

      if (flatMeals.length === 0) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "📭 Düzenlenecek kayıtlı öğün bulunmuyor.");
        return;
      }

      // Eğer kullanıcı doğrudan "/duzenle 3" yazdıysa o öğünün şablonunu hemen aç
      if (parts.length > 1 && !isNaN(parseInt(parts[1], 10))) {
        const targetNum = parseInt(parts[1], 10);
        if (targetNum > flatMeals.length || targetNum < 1) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Geçersiz numara! Listede ${flatMeals.length} öğün var.`);
          return;
        }

        const item = flatMeals[targetNum - 1];
        let existingFood = item.meal.title;
        let existingDrink = "içmedim";
        if (item.meal.title.includes("+")) {
          const split = item.meal.title.split("+");
          existingFood = split[0].trim();
          existingDrink = split.slice(1).join("+").trim();
        }

        userSessions.set(chatId, {
          action: "duzenle_submit",
          mealNum: targetNum,
          originalDate: item.date
        });

        const templateText = 
          `Yemek: ${existingFood}\n` +
          `İçecek: ${existingDrink}\n` +
          `Konum: ${item.meal.location}\n` +
          `Fiyat: ${item.meal.price || '200 TL'}\n` +
          `Tarih: ${item.date}`;

        const promptMsg = 
          `✏️ *#${targetNum} Numaralı Öğün Seçildi!*\n\n` +
          `Aşağıdaki gri kutucuğa **tek dokunarak kopyala**, mesaj kutuna yapıştır, istediğin satırı değiştirip gönder:\n\n` +
          `\`\`\`\n${templateText}\n\`\`\`\n\n` +
          `[DÜZENLEME ŞABLONU] [NO:${targetNum}] [ORIG_DATE:${item.date}]\n` +
          `💡 İçecek yoksa "içmedim" yazabilirsin. İptal için: /iptal`;

        await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, promptMsg, "Şablonu yapıştırıp düzenleyin...");
        return;
      }

      // Sadece "/duzenle" yazıldıysa: Listeyi göster ve numarayı sor
      userSessions.set(chatId, { action: "duzenle_select_num" });

      let listMsg = "✏️ [DÜZENLEME MODU]\n\n📋 *Mevcut Öğünler:*\n\n";
      flatMeals.slice(0, 8).forEach((item, index) => {
        const num = index + 1;
        const priceStr = item.meal.price ? ` - 💰 ${item.meal.price}` : "";
        listMsg += `*#${num}* [${item.day}] ${item.meal.emoji || '🍽️'} *${item.meal.title}* (${item.meal.location}${priceStr})\n`;
      });

      listMsg += "\n👉 *Hangi numaralı öğünü düzenlemek istiyorsun?*\n_(Sadece numarasını yaz, örn: 1 veya 3)_\n💡 Vazgeçmek için: /iptal";
      await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, listMsg, "Örn: 1");
      return;
    }

    // /sil (Argümansız /sil -> Önce listeyi açar ve numarayı sorar!)
    if (userText.toLowerCase() === "/sil" || userText.toLowerCase().startsWith("/sil ")) {
      const parts = userText.split(" ").filter(p => p.trim());
      const githubFile = await getGitHubFile(env.GITHUB_TOKEN);
      let mealsList = JSON.parse(githubFile.content);
      const flatMeals = getFlattenedMeals(mealsList);

      if (flatMeals.length === 0) {
        await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "📭 Silinecek kayıtlı öğün bulunmuyor.");
        return;
      }

      if (parts.length > 1 && !isNaN(parseInt(parts[1], 10))) {
        const targetNum = parseInt(parts[1], 10);
        if (targetNum > flatMeals.length || targetNum < 1) {
          await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Geçersiz numara! Toplam ${flatMeals.length} öğün var.`);
          return;
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
        return;
      }

      userSessions.set(chatId, { action: "sil" });

      let listMsg = "🗑️ [SİLME MODU]\n\n📋 *Mevcut Öğünler:*\n\n";
      flatMeals.slice(0, 8).forEach((item, index) => {
        const num = index + 1;
        const priceStr = item.meal.price ? ` - 💰 ${item.meal.price}` : "";
        listMsg += `*#${num}* [${item.day}] ${item.meal.emoji || '🍽️'} *${item.meal.title}* (${item.meal.location}${priceStr})\n`;
      });

      listMsg += "\n👉 *Hangi numaralı öğünü silmek istiyorsun?*\n_(Sadece numarasını yaz, örn: 1 veya 2)_\n💡 Vazgeçmek için /iptal yazabilirsin.";
      await sendForceReplyMessage(env.TELEGRAM_BOT_TOKEN, chatId, listMsg, "Örn: 1");
      return;
    }

    // ============================================================
    // 4. Bilinmeyen Komut Kontrolü (/ ile başlıyorsa AI'ya sorma!)
    // ============================================================
    if (userText.startsWith("/")) {
      const unknownMsg = 
        `❓ *Bilinmeyen bir komut yazdın:* \`${userText}\`\n\n` +
        `Kullanabileceğin komutları görmek için: **/yardim**`;
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, unknownMsg, "Markdown");
      return;
    }

    // ============================================================
    // 5. Doğal Dil ile Ekleme (CANLI İLERLEME GÖSTERGELİ!)
    // ============================================================
    const liveMsg = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "⏳ [1/2] Yapay zeka menünü çözümlüyor...");
    const liveMsgId = liveMsg ? liveMsg.message_id : null;

    let parsedData = null;
    try {
      parsedData = await parseMealWithGeminiFast(userText, env.GEMINI_API_KEY);
    } catch (aiErr) {
      await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, liveMsgId, `⚠️ Yapay zeka şu an meşgul.\nÖğünü hemen eklemek için **/ekle** yazabilirsin!`);
      return;
    }

    if (!parsedData.meal.price) {
      const noPriceMsg = 
        `⚠️ Menüyü anladım: *${parsedData.meal.title}* (${parsedData.meal.location})\n` +
        `Fakat fiyat belirtmemişsin.\n\n` +
        `Lütfen fiyatıyla birlikte tekrar yaz, örn:\n` +
        `👉 \`${userText} 140 TL\`\n` +
        `veya adım adım eklemek için: **/ekle**`;
      await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, liveMsgId, noPriceMsg);
      return;
    }

    parsedData.meal.title = capitalizeTr(parsedData.meal.title);
    parsedData.meal.location = normalizeLocation(parsedData.meal.location);

    await editTelegramMessage(
      env.TELEGRAM_BOT_TOKEN, 
      chatId, 
      liveMsgId, 
      `📝 [2/2] *${parsedData.meal.title}* (${parsedData.meal.price}) anlaşıldı ➔ GitHub'a kaydediliyor...`
    );

    await saveNewMealToGitHub(env.GITHUB_TOKEN, parsedData.meal, parsedData.date, parsedData.day);

    const finalSuccessMsg = 
      `✅ *Harika, siteye eklendi!*\n\n` +
      `📅 *Tarih:* ${parsedData.day} (${parsedData.date})\n` +
      `${parsedData.meal.emoji} *Öğün:* ${parsedData.meal.title}\n` +
      `📍 *Konum:* ${parsedData.meal.location}\n` +
      `💰 *Fiyat:* ${parsedData.meal.price}\n\n` +
      `🌐 https://${REPO_OWNER}.github.io/${REPO_NAME}/`;

    await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, liveMsgId, finalSuccessMsg);

  } catch (error) {
    console.error("handleIncomingUpdate error:", error);
    if (chatId && env.TELEGRAM_BOT_TOKEN) {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Hata: ${error.message}`);
    }
  }
}

// --- YARDIMCI FONKSİYONLAR ---

function isSame(text) {
  const t = text.trim().toLowerCase();
  return t === "aynı" || t === "ayni" || t === "aynisı" || t === "aynisi" || t === "same";
}

function isNoDrink(text) {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  return (
    t === "içmedim" || t === "icmedim" || t === "içmedım" || t === "icmedım" ||
    t === "içmedm" || t === "yok" || t === "yoktu" || t === "hayır" || t === "hayir" ||
    t === "su" || t === "hiçbir şey" || t === "hicbir sey" || t === "-"
  );
}

function isNoFood(text) {
  if (!text) return true;
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
  if (l.includes("dürüm") || l.includes("zater") || l.includes("köfte") || l.includes("kofte")) return "🌯";
  if (l.includes("pizza")) return "🍕";
  if (l.includes("kahve") || l.includes("kola") || l.includes("ayran") || l.includes("şalgam") || l.includes("salgam") || l.includes("tea")) return "🥤";
  if (l.includes("tavuk")) return "🍗";
  return "🍽️";
}

function guessCategory(title) {
  if (!title) return "Fast Food";
  const l = title.toLowerCase();
  if (l.includes("burger")) return "Fast Food";
  if (l.includes("dürüm") || l.includes("zater") || l.includes("köfte") || l.includes("kofte")) return "Dürüm / Çiğ Köfte";
  if (l.includes("pizza")) return "Fast Food";
  if (l.includes("kahve") || l.includes("kola") || l.includes("ayran") || l.includes("şalgam") || l.includes("salgam")) return "İçecek";
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

async function parseMealWithGeminiFast(userMessage, apiKey) {
  const { date: todayDateStr, day: todayDayName } = getTurkeyTimeInfo();

  const systemPrompt = `
Kullanıcının Türkçe yemek cümlesini analiz et.
Bugünün tarihi: ${todayDateStr} (${todayDayName}).

Çıktı SADECE şu JSON formatında olmalıdır:
{
  "date": "YYYY-MM-DD (dün dediyse dünün tarihi)",
  "day": "Türkçe gün adı",
  "meal": {
    "title": "Çiğ Köfte + Şalgam",
    "items": ["Çiğ Köfte", "Şalgam"],
    "location": "Yurt",
    "price": "140 TL",
    "category": "Dürüm / Çiğ Köfte",
    "emoji": "🌯",
    "note": ""
  }
}
`;

  const models = ["gemini-3.8-flash-lite", "gemini-3.8-flash"];
  for (const m of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(7000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nKullanıcı: "${userMessage}"` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 200
          }
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    const data = await res.json();
    return data.result;
  }
  return null;
}

async function editTelegramMessage(botToken, chatId, messageId, text) {
  if (!messageId) {
    return await sendTelegramMessage(botToken, chatId, text, "Markdown");
  }
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown"
  };
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
