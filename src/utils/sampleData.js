/**
 * Sample data for dashboard / profile widgets that don't yet have a backing
 * API endpoint (daily challenges, live activity, friends, tournaments,
 * achievements, match history). Swap each function body for a real
 * `api.get(...)` call once the corresponding server route exists —
 * the shapes below are intentionally what those endpoints should return.
 */

export function getDailyChallenges() {
  return [
    { id: 'c1', name: 'سه برد متوالی', progress: 2, target: 3, reward: '۲۵۰ سکه' },
    { id: 'c2', name: '۱۰ راند بازی کنید', progress: 7, target: 10, reward: '۱۲۰ XP' },
    { id: 'c3', name: 'یک بازی بدون باخت', progress: 0, target: 1, reward: '۳۰۰ سکه' },
  ];
}

export function getLiveActivity() {
  return [
    { id: 'a1', icon: '🏆', text: 'سارا به سطح ۱۲ رسید', time: '۲ دقیقه پیش' },
    { id: 'a2', icon: '⚔️', text: 'آرش یک مسابقه رتبه‌بندی را برد', time: '۸ دقیقه پیش' },
    { id: 'a3', icon: '🎖️', text: 'نیلوفر نشان «استاد حدس» را گرفت', time: '۲۲ دقیقه پیش' },
  ];
}

export function getFriendsOnline() {
  return [
    { id: 'f1', name: 'سارا احمدی', status: 'online', activity: 'در منو' },
    { id: 'f2', name: 'آرش کریمی', status: 'ingame', activity: 'در حال بازی' },
    { id: 'f3', name: 'نیلوفر رضایی', status: 'online', activity: 'در صف' },
  ];
}

export function getSeasonProgress(user) {
  const level = user?.level ?? 1;
  return {
    tier: level >= 20 ? 'الماس' : level >= 12 ? 'طلایی' : level >= 6 ? 'نقره‌ای' : 'برنزی',
    percent: Math.min(100, ((level % 6) / 6) * 100 || 40),
    daysLeft: 9,
  };
}

export function getUpcomingTournaments() {
  return [
    { id: 't1', name: 'کاپ هفتگی دست یا خالی', startsInMin: 47, prizePool: '۵۰,۰۰۰ سکه' },
    { id: 't2', name: 'مسابقه فصلی برتر', startsInMin: 1380, prizePool: '۲۰۰,۰۰۰ سکه' },
  ];
}

export function getRecommendedModes() {
  return [
    { id: 'm1', icon: '⚡', name: 'کلاسیک رتبه‌بندی', desc: 'سریع و رقابتی' },
    { id: 'm2', icon: '🎯', name: 'حذفی سه‌راند', desc: 'فشرده و پرهیجان' },
    { id: 'm3', icon: '🤝', name: 'دوستانه', desc: 'بدون فشار امتیاز' },
    { id: 'm4', icon: '👥', name: 'تیمی ۲ نفره', desc: 'با یک دوست بازی کنید' },
  ];
}

export function getMatchHistory() {
  return [
    { id: 'h1', opponent: 'سارا احمدی', result: 'win', ratingChange: 18, durationSec: 142, mode: 'کلاسیک', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
    { id: 'h2', opponent: 'آرش کریمی', result: 'loss', ratingChange: -12, durationSec: 98, mode: 'حذفی', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'h3', opponent: 'نیلوفر رضایی', result: 'win', ratingChange: 21, durationSec: 176, mode: 'کلاسیک', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString() },
    { id: 'h4', opponent: 'محمد توکلی', result: 'win', ratingChange: 15, durationSec: 110, mode: 'دوستانه', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString() },
  ];
}

export function getAchievements() {
  return [
    { id: 'ach1', name: 'اولین پیروزی', icon: '🥇', rarity: 'common', unlocked: true },
    { id: 'ach2', name: 'برنده ۱۰ بازی', icon: '🔥', rarity: 'rare', unlocked: true },
    { id: 'ach3', name: 'استاد حدس', icon: '🧠', rarity: 'epic', unlocked: true },
    { id: 'ach4', name: 'بدون شکست (۲۰ برد)', icon: '👑', rarity: 'legendary', unlocked: false, progress: 14, target: 20 },
    { id: 'ach5', name: 'محبوب جمع', icon: '💎', rarity: 'epic', unlocked: false, progress: 6, target: 10 },
    { id: 'ach6', name: 'بازیکن وفادار', icon: '🛡️', rarity: 'rare', unlocked: true },
  ];
}
