const NVIDIA_API_KEY = import.meta.env.VITE_NVIDIA_API_KEY as string;
const NVIDIA_BASE    = 'https://integrate.api.nvidia.com/v1';

/**
 * Given CARA's question, the patient's answer, and the facial distress data,
 * returns an empathetic follow-up line that CARA can say.
 * Returns null if the score is low (no distress detected — don't add noise).
 */
export async function getEmpatheticReply(params: {
  caraQuestion: string;
  patientAnswer: string;
  distressScore: number;
  dominantEmotion: string;
}): Promise<string | null> {
  const { caraQuestion, patientAnswer, distressScore, dominantEmotion } = params;

  // Only trigger if distress is meaningful (score ≥ 4 out of 10)
  if (distressScore < 4) return null;

  const emotionMap: Record<string, string> = {
    angry:    'appears agitated or frustrated',
    sad:      'looks visibly sad or distressed',
    fearful:  'looks anxious or frightened',
    disgusted:'looks uncomfortable or in discomfort',
    surprised:'looks startled or shocked',
    neutral:  'has a neutral expression',
    happy:    'appears calm',
  };
  const emotionDesc = emotionMap[dominantEmotion] ?? 'shows signs of distress';

  const systemPrompt = `You are CARA, a compassionate AI health companion conducting a patient check-in.
You can see the patient's face via webcam. Respond in 1 short sentence only.
Be warm, not clinical. Never say "I can see your face" — say "I notice" or "you seem".
If distress is high, gently probe. Never diagnose. Never be dramatic.`;

  const userPrompt = `The patient was asked: "${caraQuestion}"
Their answer: "${patientAnswer}"
Facial analysis: distress score ${distressScore}/10, patient ${emotionDesc}.
Write one short empathetic follow-up sentence CARA should say after acknowledging their answer.`;

  try {
    const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model:       'meta/llama-3.1-8b-instruct',
        messages:    [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        max_tokens:  80,
        temperature: 0.6,
        stream:      false,
      }),
    });

    if (!res.ok) {
      console.warn('NVIDIA NIM error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.error('NVIDIA NIM call failed:', e);
    return null;
  }
}
