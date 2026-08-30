import fs from 'fs';
import { callLLM } from '../clients/llm.client';
import type { ContentPart } from '../clients/llm.client';

function buildTranscriptionPrompt(): string {
  return [
    'You are an audio transcription assistant.',
    '',
    'Transcribe the attached audio message VERBATIM.',
    'Preserve the original language or dialect — Algerian Darija, Arabic, French, English, or any mix of these.',
    'Do NOT translate, summarize, or add any commentary.',
    'Return ONLY the raw transcribed text, nothing else.',
  ].join('\n');
}

export async function transcribeAudio(filePath: string, mimeType: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  const parts: ContentPart[] = [
    {
      type: 'audio',
      data: buffer,
      mimeType,
    },
    {
      type: 'text',
      text: buildTranscriptionPrompt(),
    },
  ];

  const transcript = await callLLM({
    systemPrompt: buildTranscriptionPrompt(),
    userMessage: parts,
    responseMimeType: 'text/plain',
    context: { purpose: 'transcription' },
  });

  return transcript.trim();
}
