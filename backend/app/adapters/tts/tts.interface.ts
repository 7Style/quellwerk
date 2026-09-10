/**
 * Text to speech. Interface only: the audio overview is optional (M10) and no
 * implementation is written until that milestone starts.
 */
export interface TtsVoice {
  speaker: string;
  voice: string;
}

export interface ITtsProvider {
  speak(turns: { speaker: string; text: string }[], voices: TtsVoice[]): Promise<Buffer>;
}
