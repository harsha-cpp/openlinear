import { apiFetch, apiFetchRaw, ApiError, NetworkError } from './fetch';

export interface BrainstormTask {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

export interface BrainstormAvailability {
  available: boolean;
  provider?: string;
  error?: string;
  webSearchAvailable?: boolean;
}

export async function checkBrainstormAvailability(): Promise<BrainstormAvailability> {
  try {
    return await apiFetch<BrainstormAvailability>('/api/brainstorm/availability', {
      sidecar: true,
    });
  } catch {
    return { available: false, error: 'Failed to check availability' };
  }
}

export async function generateBrainstormQuestions(
  prompt: string,
  webSearch: boolean = false,
): Promise<string[]> {
  const data = await apiFetch<{ questions: string[] }>('/api/brainstorm/questions', {
    method: 'POST',
    sidecar: true,
    body: JSON.stringify({ prompt, webSearch }),
  });
  return data.questions;
}

export async function streamBrainstormTasks(
  prompt: string,
  answers: { question: string; answer: string }[],
  onTask: (task: BrainstormTask) => void,
  onDone: () => void,
  onError: (message: string) => void,
  webSearch: boolean = false,
): Promise<void> {
  let res: Response;
  try {
    res = await apiFetchRaw('/api/brainstorm/generate', {
      method: 'POST',
      sidecar: true,
      body: JSON.stringify({ prompt, answers, webSearch }),
    });
  } catch (err) {
    if (err instanceof ApiError || err instanceof NetworkError) {
      onError(err.message);
      return;
    }
    onError(err instanceof Error ? err.message : 'Stream failed');
    return;
  }

  try {
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const task: BrainstormTask = JSON.parse(trimmed);
          onTask(task);
        } catch {}
      }
    }

    if (buffer.trim()) {
      try {
        const task: BrainstormTask = JSON.parse(buffer.trim());
        onTask(task);
      } catch {}
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Stream failed');
  }
}

export async function transcribeAudio(audioBlob: Blob): Promise<{ text: string }> {
  return apiFetch<{ text: string }>('/api/transcribe', {
    method: 'POST',
    sidecar: true,
    headers: { 'Content-Type': audioBlob.type },
    body: audioBlob,
  });
}
