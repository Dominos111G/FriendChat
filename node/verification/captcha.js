import { randomInt } from 'node:crypto';
import symbols from './symbols.json' with { type: 'json' };

const DIGITS = Object.keys(symbols);

export function createChallenge() {
  const code = Array.from({ length: 5 }, () => DIGITS[randomInt(DIGITS.length)]).join('');
  return {
    code,
    symbols: [...code].map((digit) => symbols[digit]),
    expiresAt: Date.now() + 5 * 60 * 1000
  };
}

export function isChallengeValid(challenge, answer) {
  return Boolean(
    challenge &&
    challenge.expiresAt > Date.now() &&
    typeof answer === 'string' &&
    answer.trim() === challenge.code
  );
}
