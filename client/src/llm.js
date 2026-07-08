export async function callLlm({ provider, systemPrompt, userMessage, onChunk, onDone, onError }) {
  let res;
  try {
    res = await fetch('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider.id,
        config: provider.config || {},
        systemPrompt,
        userMessage,
      }),
    });
  } catch (err) {
    onError?.(`Network error: ${err.message}`);
    return;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    onError?.(data.error || `HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'chunk') onChunk?.(ev.text);
          else if (ev.type === 'done') onDone?.();
          else if (ev.type === 'error') onError?.(ev.message);
        } catch {
          console.warn('LLM SSE parse error', line.slice(0, 100));
        }
      }
    }
  } catch (err) {
    onError?.(`Stream error: ${err.message}`);
  }
}
