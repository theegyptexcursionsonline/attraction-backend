/**
 * Screening for scripted account sign-ups. The pattern seen on the network in October 2026: both names a random run
 * of mixed-case letters ("tujMmgJdQZCEHylQcOs knVkgiagrlkHsogxk") and a Gmail address split by many dots
 * ("a.x.a.pexa.q.iwo47.4@gmail.com"). Gmail ignores dots, so each variant reaches one real person's inbox, and every
 * sign-up would send that person a welcome email. A sign-up that matches is refused before any account, email or
 * admin notice is made.
 */

/** A word that changes case at random: eight or more letters, lowercase among them, three or more capitals inside. */
const RANDOM_CASE_WORD = (word: string): boolean => {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (letters.length < 8 || !/\p{Ll}/u.test(letters)) return false;
  const insideCapitals = letters.slice(1).match(/\p{Lu}/gu)?.length ?? 0;
  return insideCapitals >= 3;
};

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
/** Real Gmail addresses rarely carry more than two dots; the scripted ones carry five or six. */
const MAX_GMAIL_DOTS = 3;

export type SignupScreeningReason = 'random-name' | 'dotted-gmail';

export function screenSignup(input: { firstName?: unknown; lastName?: unknown; email?: unknown }): SignupScreeningReason | null {
  const names = [input.firstName, input.lastName].filter((value): value is string => typeof value === 'string');
  if (names.some((name) => name.split(/\s+/).some(RANDOM_CASE_WORD))) return 'random-name';
  if (typeof input.email === 'string') {
    const at = input.email.lastIndexOf('@');
    const local = input.email.slice(0, at);
    const domain = input.email.slice(at + 1).toLowerCase();
    if (at > 0 && GMAIL_DOMAINS.has(domain) && (local.match(/\./g)?.length ?? 0) > MAX_GMAIL_DOTS) return 'dotted-gmail';
  }
  return null;
}
