export const WHISPER_HALLUCINATIONS = new Set([
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'thanks for listening',
  'thank you for listening',
  'bye',
  'bye bye',
  'goodbye',
  'you',
  'the end',
  'subtitles by',
  'subscribe',
  'like and subscribe',
]);

export function isWhisperHallucination(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[.,!?;:'"]/g, '').trim();
  if (normalized.length === 0) return true;
  if (normalized.length < 3) return true;
  return WHISPER_HALLUCINATIONS.has(normalized);
}
