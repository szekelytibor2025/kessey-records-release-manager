/**
 * Calculates priority for a track based on global rules.
 * Higher number = higher priority.
 */
export function getTrackPriority(track, rules) {
  let maxPriority = 0;
  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase();
    if (
      track.original_title?.toLowerCase().includes(kw) ||
      track.product_title?.toLowerCase().includes(kw)
    ) {
      maxPriority = Math.max(maxPriority, rule.priority);
    }
  }
  return maxPriority;
}

/**
 * Groups tracks by catalog_no and returns unique catalog entries
 * with the highest priority among their tracks.
 */
export function groupByCatalog(tracks, rules) {
  const groups = {};
  for (const track of tracks) {
    const key = track.catalog_no || "UNKNOWN";
    if (!groups[key]) {
      groups[key] = {
        catalog_no: key,
        tracks: [],
        priority: 0,
        product_title: track.product_title,
        genre: track.genre,
        release_date: track.release_date,
        label: track.label,
      };
    }
    groups[key].tracks.push(track);
    const p = getTrackPriority(track, rules);
    groups[key].priority = Math.max(groups[key].priority, p);
  }
  return Object.values(groups);
}

/**
 * Builds a monthly schedule from pending catalog groups.
 * BASE_QUOTA releases per month, ordered by priority (desc), then release_date (asc).
 */
export function buildSchedule(catalogGroups, startMonth, baseQuota = 3) {
  const sorted = [...catalogGroups].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.release_date || "").localeCompare(b.release_date || "");
  });

  const schedule = [];
  let currentMonth = startMonth;

  let idx = 0;
  while (idx < sorted.length) {
    const monthBatch = [];
    for (let slot = 0; slot < baseQuota && idx < sorted.length; slot++) {
      monthBatch.push(sorted[idx]);
      idx++;
    }
    schedule.push({ month: currentMonth, releases: monthBatch });
    currentMonth = nextMonth(currentMonth);
  }

  return schedule;
}

function nextMonth(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m, 1); // m is already 0-indexed + 1
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonth(yyyymm) {
  const [y, m] = yyyymm.split("-").map(Number);
  const months = [
    "Január", "Február", "Március", "Április", "Május", "Június",
    "Július", "Augusztus", "Szeptember", "Október", "November", "December"
  ];
  return `${y}. ${months[m - 1]}`;
}