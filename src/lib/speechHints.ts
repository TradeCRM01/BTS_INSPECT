export type SpeechRecognitionCopy = 'booking' | 'job';

export function isSpeechPermissionDenied(error: string | undefined): boolean {
  return error === 'not-allowed' || error === 'service-not-allowed';
}

/** Returns null when the error should not surface a hint (e.g. deliberate stop). */
export function speechRecognitionErrorHint(
  error: string | undefined,
  copy: SpeechRecognitionCopy = 'job',
): string | null {
  if (error === 'aborted') return null;
  if (isSpeechPermissionDenied(error)) {
    return copy === 'booking'
      ? 'Microphone is blocked. Type the booking instead.'
      : 'Microphone is blocked. Type the job instead.';
  }
  if (error === 'audio-capture') return 'No microphone found. Type instead.';
  return 'Didn\'t catch that. Try again or type it.';
}

export function isActiveSpeechRecognition(
  rec: object,
  activeRef: { current: object | null },
): boolean {
  return rec === activeRef.current;
}
