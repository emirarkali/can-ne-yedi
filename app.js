// Default fallback data in case meals.json is opened via file:// or network error
const fallbackData = [
  {
    "date": "2026-10-19",
    "day": "Pazartesi",
    "meals": [
      {
        "id": "2026-10-19-1",
        "title": "Hamburger + Ayran",
        "items": ["Hamburger", "Ayran"],
        "location": "Yurtta",
        "category": "Fast Food",
        "emoji": "🍔",
        "note": "Haftanın açılış klasiği"
      }
    ]
  },
  {
    "date": "2026-10-20",
    "day": "Salı",
    "meals": [
      {
        "id": "2026-10-20-1",
        "title": "Hamburger + Kola",
        "items": ["Hamburger", "Kola"],
        "location": "McDonald's",
        "category": "Fast Food",
        "emoji": "🍔",
        "note": "McDonald's menüsü"
      }
    ]
  },
  {
    "date": "2026-10-21",
    "day": "Çarşamba",
    "meals": [
      {
        "id": "2026-10-21-1",
        "title": "Hamburger + Kola",
        "items": ["Hamburger", "Kola"],
        "location": "McDonald's",
        "category": "Fast Food",
        "emoji": "🍔",
        "note": "İstikrar bozulmuyor"
      }
    ]
  },
  {
    "date": "2026-10-22",
    "day": "Perşembe",
    "meals": [
      {
        "id": "2026-10-22-1",
        "title": "Zater + Kola",
        "items": ["Zater", "Kola"],
        "location": "Yurtta",
        "category": "Fırın / Börek",
        "emoji": "🫓",
        "note": "Günün ilk lezzeti"
      },
      {
        "id": "2026-10-22-2",
        "title": "Hamburger + Ayran",
        "items": ["Hamburger", "Ayran"],
        "location": "Jungle Burger",
        "category": "Gurme Burger",
        "emoji": "🍔",
        "note": "Jungle Burger kapanış"
      }
    ]
  }
];

let allDaysData = [];
let selectedLocation = 'all';
let searchQuery = '';

// Location color palette mapping for badges
const locationColors = {
  "McDonald's": "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  "Yurtta": "bg-blue-500/10 text-blue-400 border-blue-500/30",
  "Jungle Burger": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
};

function getLocationBadgeClass(loc) {
  return locationColors[loc] || "bg-purple-500/10 text-purple-400 border-purple-500/30";
}

// Format ISO date to Turkish readable format
function formatDateTr(dateStr) {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthNames = [
        'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
      ];
      const month = monthNames[parseInt(parts[1], 10) - 1];
      const day = parseInt(parts[2], 10);
      return `${day} ${month} ${year}`;
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

// Fetch meals data
async function loadMeals() {
  try {
    const response = await fetch('data/meals.json?t=' + Date.now());
    if (!response.ok) throw new Error('Network error');
    allDaysData = await response.json();
  } catch (err) {
    console.warn('Could not fetch data/meals.json, using bundled data.', err);
    allDaysData = fallbackData;
  }

  // Calculate statistics
  computeStats();
  // Build location filter buttons
  setupLocationFilters();
  // Render timeline feed
  renderTimeline();
}

function computeStats() {
  const totalDays = allDaysData.length;
  let totalMeals = 0;
  let burgerCount = 0;
  const locationsSet = new Set();

  allDaysData.forEach(day => {
    (day.meals || []).forEach(meal => {
      totalMeals++;
      if (meal.location) locationsSet.add(meal.location.trim());
      
      const hasBurger = 
        (meal.title && meal.title.toLowerCase().includes('hamburger')) ||
        (meal.items && meal.items.some(item => item.toLowerCase().includes('hamburger')));
      
      if (hasBurger) burgerCount++;
    });
  });

  document.getElementById('totalDays').innerHTML = `<i data-lucide="calendar" class="w-4 h-4 text-brand-400"></i> ${totalDays} Gün`;
  document.getElementById('totalMeals').innerHTML = `<i data-lucide="utensils" class="w-4 h-4 text-emerald-400"></i> ${totalMeals} Öğün`;
  document.getElementById('burgerCountVal').innerText = `${burgerCount} Adet`;
  document.getElementById('totalLocations').innerHTML = `<i data-lucide="map-pin" class="w-4 h-4 text-rose-400"></i> ${locationsSet.size} Yer`;
  document.getElementById('streakCount').innerText = `${totalDays} Gün`;
}

function setupLocationFilters() {
  const filterContainer = document.getElementById('locationFilters');
  const locationsSet = new Set();
  
  allDaysData.forEach(day => {
    (day.meals || []).forEach(meal => {
      if (meal.location) locationsSet.add(meal.location.trim());
    });
  });

  const locations = ['all', ...Array.from(locationsSet)];

  filterContainer.innerHTML = locations.map(loc => {
    const isAll = loc === 'all';
    const label = isAll ? 'Tümü' : `📍 ${loc}`;
    const isActive = selectedLocation === loc;
    const activeClass = isActive 
      ? 'bg-brand-500 text-white border-brand-500 shadow-md shadow-brand-500/20' 
      : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800 hover:bg-slate-800';

    return `
      <button 
        onclick="setLocationFilter('${loc}')" 
        class="px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${activeClass}"
      >
        ${label}
      </button>
    `;
  }).join('');
}

window.setLocationFilter = function(loc) {
  selectedLocation = loc;
  setupLocationFilters();
  renderTimeline();
};

function renderTimeline() {
  const container = document.getElementById('timelineContainer');
  const filteredInfo = document.getElementById('mealsFilteredInfo');

  // Filter meals according to location and search query
  const filteredDays = allDaysData.map(day => {
    const filteredMeals = (day.meals || []).filter(meal => {
      // Location filter
      const matchesLocation = (selectedLocation === 'all') || (meal.location === selectedLocation);
      if (!matchesLocation) return false;

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const inTitle = meal.title && meal.title.toLowerCase().includes(q);
      const inLocation = meal.location && meal.location.toLowerCase().includes(q);
      const inItems = meal.items && meal.items.some(it => it.toLowerCase().includes(q));
      const inDay = day.day && day.day.toLowerCase().includes(q);
      return inTitle || inLocation || inItems || inDay;
    });

    return {
      ...day,
      meals: filteredMeals
    };
  }).filter(day => day.meals.length > 0);

  // Sort descending by date so most recent is first
  filteredDays.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (selectedLocation !== 'all' || searchQuery.trim()) {
    filteredInfo.textContent = `Filtrelendi (${filteredDays.reduce((acc, d) => acc + d.meals.length, 0)} öğün bulundu)`;
  } else {
    filteredInfo.textContent = 'En güncelden eskiye tüm günler';
  }

  if (filteredDays.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800 p-8">
        <div class="text-3xl mb-2">🔍</div>
        <h4 class="text-sm font-semibold text-white">Eşleşen öğün bulunamadı</h4>
        <p class="text-xs text-slate-500 mt-1">Arama filtrenizi temizleyip tekrar deneyin.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = filteredDays.map((day, dayIndex) => {
    const formattedDate = formatDateTr(day.date);
    const mealCount = day.meals.length;
    const isTodayOrLatest = dayIndex === 0;

    const mealsHtml = day.meals.map(meal => {
      const locBadgeClass = getLocationBadgeClass(meal.location);
      const itemsBadges = (meal.items || []).map(item => {
        const isDrink = ['ayran', 'kola', 'su', 'fanta', 'gazoz', 'kahve', 'çay'].some(d => item.toLowerCase().includes(d));
        return `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${isDrink ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'bg-slate-800 text-slate-200 border border-slate-700/60'}">
            ${isDrink ? '🥤' : '🍽️'} ${item}
          </span>
        `;
      }).join('');

      return `
        <div class="group relative bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 transition-all duration-200 shadow-sm hover:shadow-md">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3">
              <div class="w-11 h-11 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform flex-shrink-0">
                ${meal.emoji || '🍔'}
              </div>
              <div>
                <h4 class="text-base font-bold text-white group-hover:text-brand-400 transition-colors">
                  ${meal.title}
                </h4>
                <div class="flex flex-wrap items-center gap-2 mt-2">
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${locBadgeClass}">
                    <i data-lucide="map-pin" class="w-3 h-3"></i>
                    ${meal.location}
                  </span>
                  ${meal.category ? `
                    <span class="text-[11px] text-slate-400 font-medium">
                      • ${meal.category}
                    </span>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>

          <!-- Items pills & note -->
          <div class="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              ${itemsBadges}
            </div>
            ${meal.note ? `
              <span class="text-[11px] italic text-slate-500 flex items-center gap-1">
                <i data-lucide="message-square" class="w-3 h-3"></i> ${meal.note}
              </span>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="relative group">
        <!-- Timeline node dot -->
        <div class="absolute -left-[31px] sm:-left-[39px] top-1.5 w-6 h-6 rounded-full bg-slate-950 border-2 ${isTodayOrLatest ? 'border-brand-500 shadow-lg shadow-brand-500/50 ring-4 ring-brand-500/20' : 'border-slate-700'} flex items-center justify-center text-[10px]">
          ${isTodayOrLatest ? '🔥' : '✨'}
        </div>

        <!-- Day Header -->
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-sm font-extrabold text-white tracking-wide">
              ${day.day}
            </span>
            <span class="text-xs font-medium text-slate-400">
              ${formattedDate}
            </span>
            ${isTodayOrLatest ? `
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-500/20 text-brand-400 border border-brand-500/30 uppercase tracking-wider">
                Son Gün
              </span>
            ` : ''}
          </div>

          <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50">
            ${mealCount} ${mealCount > 1 ? 'farklı öğün' : 'öğün'}
          </span>
        </div>

        <!-- Meal Cards -->
        <div class="grid grid-cols-1 ${mealCount > 1 ? 'md:grid-cols-2' : ''} gap-3">
          ${mealsHtml}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Search input listener
document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderTimeline();
});

// Modal Logic
const modal = document.getElementById('infoModal');
const openModalBtn = document.getElementById('infoModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalDoneBtn = document.getElementById('modalDoneBtn');
const copySnippetBtn = document.getElementById('copySnippetBtn');
const copyText = document.getElementById('copyText');
const sampleSnippet = document.getElementById('sampleJsonSnippet');

function openModal() {
  modal.classList.remove('hidden');
}
function closeModal() {
  modal.classList.add('hidden');
}

openModalBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
modalDoneBtn.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

copySnippetBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(sampleSnippet.innerText);
    copyText.innerText = 'Kopyalandı! ✓';
    setTimeout(() => {
      copyText.innerText = 'Kopyala';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy: ', err);
  }
});

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
  loadMeals();
});
