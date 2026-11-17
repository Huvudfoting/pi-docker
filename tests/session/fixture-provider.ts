// TEST ONLY: loaded explicitly from isolated Phase 3 configuration, never shipped
// as a production resource. No transport, network, credentials, or tool calls.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { VERSION } from '@earendil-works/pi-coding-agent';

export default function (pi) {
  const agent = process.env.PI_CODING_AGENT_DIR;
  if (!agent || fs.readFileSync(path.join(agent, 'phase3-fixture'), 'utf8') !== 'pi-docker-phase3-fixture\n')
    throw new Error('Phase 3 provider requires isolated fixture configuration');
  const result = path.join(agent, 'phase3-result.json');
  const record = (ctx, stage) => {
    const sm = ctx.sessionManager;
    const messages = sm.getBranch().filter(e => e.type === 'message').map(e => e.message);
    const text = m => typeof m.content === 'string' ? m.content : m.content.filter(c => c.type === 'text').map(c => c.text).join('');
    fs.writeFileSync(result, JSON.stringify({
      stage, cwd: ctx.cwd, headerCwd: sm.getHeader().cwd,
      sessionFile: sm.getSessionFile(), sessionId: sm.getSessionId(),
      sessionName: sm.getSessionName(), hostname: os.hostname(),
      users: messages.filter(m => m.role === 'user').map(text),
      assistants: messages.filter(m => m.role === 'assistant').map(text),
      hasHerdr: Boolean(process.env.HERDR_PANE_ID || process.env.HERDR_SOCKET_PATH),
      piVersion: VERSION,
    }) + '\n');
  };
  pi.on('session_start', (_event, ctx) => record(ctx, 'startup'));
  pi.on('agent_settled', (_event, ctx) => record(ctx, 'settled'));
  pi.registerProvider('pi-docker-fixture', {
    baseUrl: 'http://fixture.invalid', apiKey: 'fixture-not-a-credential', api: 'pi-docker-fixture',
    models: [{ id: 'fixed', name: 'Offline persistence fixture', reasoning: false,
      input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000, maxTokens: 256 }],
    streamSimple(model, context, options) {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const output = { role: 'assistant', content: [], api: model.api, provider: model.provider,
          model: model.id, timestamp: Date.now(), stopReason: 'pending',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
        try {
          if (options?.signal?.aborted) throw new Error('Fixture request aborted');
          const user = context.messages.filter(m => m.role === 'user').at(-1);
          const prompt = typeof user?.content === 'string' ? user.content :
            user?.content.filter(c => c.type === 'text').map(c => c.text).join('');
          if (!/^phase3-[a-z0-9-]+$/.test(prompt ?? '')) throw new Error('Only fixture prompts are permitted');
          const text = `offline-fixture:${prompt}`;
          stream.push({ type: 'start', partial: output });
          output.content.push({ type: 'text', text: '' });
          stream.push({ type: 'text_start', contentIndex: 0, partial: output });
          output.content[0].text = text;
          stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: output });
          stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: output });
          output.stopReason = 'stop';
          stream.push({ type: 'done', reason: 'stop', message: output });
        } catch (error) {
          output.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
          output.errorMessage = String(error);
          stream.push({ type: 'error', reason: output.stopReason, error: output });
        } finally { stream.end(); }
      });
      return stream;
    },
  });
}
