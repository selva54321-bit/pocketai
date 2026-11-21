import {
  NotificationPayload,
  PrioritizedNotification,
  PriorityTier,
  ScoreBreakdown,
} from '../types';

// Regex Patterns for Category Identification
const SECURITY_REGEX = /\b(otp|one time password|verification code|security alert|login attempt|2fa|passcode|unauthorized|secret code|two-factor)\b/i;
const TRANSACTION_REGEX = /\b(debited|credited|paid|refund|transaction|spent|transferred|bank|atm|upi|rs\.?|inr|\$|payment|wallet|balance|salary)\b/i;
const COMMUNICATION_REGEX = /\b(call|missed call|incoming call|whatsapp|message|sms|telegram|signal|voicemail|dm|chat)\b/i;
const REALTIME_ALERT_REGEX = /\b(calendar|alarm|meeting|reminder|flight|train|cab|driver|arriving|delivery out|order out|order delivered|scheduled)\b/i;
const WORK_REGEX = /\b(email|gmail|outlook|slack|teams|github|pull request|jira|trello|assigned|build failed)\b/i;
const PROMO_REGEX = /\b(discount|sale|mega sale|flat \d+%|coupon|deal|hurry|cashback|win|lottery|exclusive offer|shop now|festive offer|off on|clearance)\b/i;

const URGENCY_WORDS = /\b(urgent|immediately|action required|emergency|critical|alert|expires in|warning)\b/i;
const MONEY_OR_CODE_REGEX = /(\b(?:rs\.?|inr|\$|€)\s*\d+(?:,\d+)*(?:\.\d+)?\b|\b\d{4,6}\b)/i;

// Recency half-life constant (half-life of 2.0 hours)
const RECENCY_HALF_LIFE_HOURS = 2.0;
const LAMBDA = Math.log(2) / RECENCY_HALF_LIFE_HOURS; // ~0.34657

export function scoreNotification(
  notif: NotificationPayload,
  currentTime: number = Date.now(),
  appFrequency: number = 1
): PrioritizedNotification {
  const combinedText = `${notif.title || ''} ${notif.text || ''} ${notif.subText || ''}`.trim();
  const reasons: string[] = [];

  // 1. Category Weight (0 to 40, or -20 for pure promo)
  let categoryScore = 10; // baseline
  if (SECURITY_REGEX.test(combinedText)) {
    categoryScore = 40;
    reasons.push('Security / OTP (+40)');
  } else if (TRANSACTION_REGEX.test(combinedText)) {
    categoryScore = 35;
    reasons.push('Financial Transaction (+35)');
  } else if (COMMUNICATION_REGEX.test(combinedText) || notif.category === 'call' || notif.category === 'msg') {
    categoryScore = 30;
    reasons.push('Direct Message / Call (+30)');
  } else if (REALTIME_ALERT_REGEX.test(combinedText) || notif.category === 'alarm' || notif.category === 'event') {
    categoryScore = 25;
    reasons.push('Real-Time Alert (+25)');
  } else if (WORK_REGEX.test(combinedText) || notif.category === 'email') {
    categoryScore = 18;
    reasons.push('Work & Productivity (+18)');
  } else if (PROMO_REGEX.test(combinedText) || notif.category === 'promo') {
    categoryScore = -15;
    reasons.push('Promotional Content (-15)');
  }

  // 2. Exponential Recency Decay (0 to 25)
  const postTime = notif.timestamp && notif.timestamp > 0 ? notif.timestamp : currentTime;
  const elapsedHours = Math.max(0, (currentTime - postTime) / (1000 * 60 * 60));
  const recencyScore = Math.round(25 * Math.exp(-LAMBDA * elapsedHours));
  if (elapsedHours < 0.25) {
    reasons.push(`Just now (+${recencyScore})`);
  } else if (elapsedHours < 1.0) {
    reasons.push(`< 1h ago (+${recencyScore})`);
  } else {
    reasons.push(`${Math.round(elapsedHours)}h ago (+${recencyScore})`);
  }

  // 3. App Channel Trust (0 to 20)
  let appScore = 8;
  const pkg = (notif.package_name || '').toLowerCase();
  if (
    pkg.includes('bank') ||
    pkg.includes('paisa') ||
    pkg.includes('phonepe') ||
    pkg.includes('paytm') ||
    pkg.includes('wallet') ||
    pkg.includes('hdfc') ||
    pkg.includes('sbi') ||
    pkg.includes('icici')
  ) {
    appScore = 20;
    reasons.push('Bank / UPI App (+20)');
  } else if (
    pkg.includes('whatsapp') ||
    pkg.includes('dialer') ||
    pkg.includes('messaging') ||
    pkg.includes('telegram') ||
    pkg.includes('signal')
  ) {
    appScore = 16;
    reasons.push('Primary Communication (+16)');
  } else if (
    pkg.includes('deskclock') ||
    pkg.includes('calendar') ||
    pkg.includes('uber') ||
    pkg.includes('ola') ||
    pkg.includes('swiggy') ||
    pkg.includes('zomato')
  ) {
    appScore = 12;
    reasons.push('Transit & Utility (+12)');
  } else if (
    pkg.includes('myntra') ||
    pkg.includes('flipkart') ||
    pkg.includes('amazon') ||
    pkg.includes('instagram') ||
    pkg.includes('facebook')
  ) {
    appScore = 2;
    reasons.push('Marketing Channel (+2)');
  }

  // 4. Content Signals & Urgency (-15 to +15)
  let contentScore = 0;
  if (URGENCY_WORDS.test(combinedText)) {
    contentScore += 10;
    reasons.push('High Urgency Keyword (+10)');
  }
  if (MONEY_OR_CODE_REGEX.test(combinedText)) {
    contentScore += 5;
    reasons.push('Currency / Code Extracted (+5)');
  }
  if (PROMO_REGEX.test(combinedText) && categoryScore > 0) {
    // If not already heavily penalized, subtract for promo keywords
    contentScore -= 12;
    reasons.push('Promo Language Detected (-12)');
  }

  // 5. Volume Saturation Penalty (0 to 15)
  // Penalize apps that spam many notifications
  const frequencyPenalty = Math.min(15, Math.max(0, appFrequency - 2) * 3);
  if (frequencyPenalty > 0) {
    reasons.push(`App Saturation x${appFrequency} (-${frequencyPenalty})`);
  }

  // Mathematical Sum & Clamp
  const rawScore = categoryScore + recencyScore + appScore + contentScore - frequencyPenalty;
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Tier Classification
  let tier: PriorityTier = 'LOW';
  if (finalScore >= 75) {
    tier = 'CRITICAL';
  } else if (finalScore >= 50) {
    tier = 'HIGH';
  } else if (finalScore >= 25) {
    tier = 'MEDIUM';
  } else {
    tier = 'LOW';
  }

  const breakdown: ScoreBreakdown = {
    categoryScore,
    recencyScore,
    appScore,
    contentScore,
    frequencyPenalty,
    reasons,
  };

  return {
    id: notif.id || `${notif.package_name}_${postTime}_${Math.random().toString(36).substring(7)}`,
    packageName: notif.package_name || 'unknown',
    title: notif.title || '(No Title)',
    text: notif.text || '',
    subText: notif.subText || '',
    postTime,
    score: finalScore,
    tier,
    breakdown,
    isOngoing: notif.isOngoing,
    isClearable: notif.isClearable,
  };
}

/**
 * Prioritizes an array of raw notifications, taking app frequency distribution into account,
 * and returning the items sorted by score descending (highest priority first).
 */
export function prioritizeNotifications(
  notifs: NotificationPayload[],
  currentTime: number = Date.now()
): PrioritizedNotification[] {
  // Count frequency of notifications per package
  const pkgCounts: Record<string, number> = {};
  for (const n of notifs) {
    const pkg = n.package_name || 'unknown';
    pkgCounts[pkg] = (pkgCounts[pkg] || 0) + 1;
  }

  const scored = notifs.map((n) => {
    const freq = pkgCounts[n.package_name || 'unknown'] || 1;
    return scoreNotification(n, currentTime, freq);
  });

  // Sort descending: highest priority score first, then newest
  return scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.postTime - a.postTime;
  });
}
