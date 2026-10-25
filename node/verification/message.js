import en_words from './words/en.json' with { type: 'json' };
import pl_words from './words/pl.json' with { type: 'json' };

const highSeverityWords = 
  [...en_words, ...pl_words].filter(w => w.severity > 1).map(w => w.word);
const lowSeverityWords = 
  [...en_words, ...pl_words].filter(w => w.severity <= 1).map(w => w.word);

function createWordRegex(words, flags) {
  const escapedWords = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(${escapedWords.join('|')})(?![\\p{L}\\p{N}_])`, `${flags}u`);
}

export function verifyMessage(message) {
  if (typeof message !== 'string' || !message.trim()) {
    return { valid: false, reason: 'Message must be a non-empty string.' };
  }

  const trimmedMessage = message.trim();

  // Wysoka
  if (highSeverityWords.length > 0) {
    // Granice uwzględniają litery Unicode, aby poprawnie rozpoznawać polskie słowa.
    // Flaga 'i' ignoruje wielkość liter
    const highRegex = createWordRegex(highSeverityWords, 'i');
    if (highRegex.test(trimmedMessage)) {
      return { valid: false, reason: 'Message contains inappropriate content.' };
    }
  }

  // Niska
  let censoredMessage = trimmedMessage;
  if (lowSeverityWords.length > 0) {
    const lowRegex = createWordRegex(lowSeverityWords, 'gi');
    
    censoredMessage = trimmedMessage.replace(lowRegex, (match) => '*'.repeat(match.length));
  }

  return { valid: true, reason: null, message: censoredMessage };
}
