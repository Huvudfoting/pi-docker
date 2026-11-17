// TEST ONLY. Read-only Herdr snapshot observation; never reports agent identity
// or writes a resume command. The official installed extension owns reporting.
import fs from 'node:fs';
import path from 'node:path';

export default function (pi) {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  if (!agentDir || fs.readFileSync(path.join(agentDir, 'phase3-fixture'), 'utf8') !== 'pi-docker-phase3-fixture\n' ||
      fs.readFileSync(path.join(agentDir, 'phase3-native'), 'utf8') !== 'pi-docker-phase3-native\n')
    throw new Error('Native checkpoint requires isolated Phase 3 fixture configuration');
  const destination = path.join(agentDir, 'phase3-native-checkpoint.json');
  pi.registerCommand('phase3-native-checkpoint', {
    description: 'TEST ONLY: save one read-only snapshot of official Herdr reporting',
    async handler(args, ctx) {
      try {
        if (args.trim()) throw new Error('Checkpoint accepts no arguments');
        if (ctx.mode !== 'tui' || !ctx.isIdle()) throw new Error('Checkpoint requires an idle interactive session');
        if (process.env.HERDR_ENV !== '1' || !process.env.HERDR_PANE_ID ||
            !process.env.HERDR_SOCKET_PATH || !fs.statSync(process.env.HERDR_SOCKET_PATH).isSocket())
          throw new Error('Genuine inherited Herdr context/socket required');
        if (fs.existsSync(destination)) throw new Error('Checkpoint already exists; stop without retry/overwrite');
        const observation = JSON.parse(fs.readFileSync(path.join(agentDir, 'phase3-result.json'), 'utf8'));
        if (observation.stage !== 'settled' || observation.sessionId !== ctx.sessionManager.getSessionId() ||
            observation.sessionFile !== ctx.sessionManager.getSessionFile() || !observation.hasHerdr)
          throw new Error('No matching settled provider observation');
        const response = await pi.exec('herdr', ['api', 'snapshot'], { timeout: 10000, maxBuffer: 1024 * 1024 });
        if (response.code !== 0 || response.killed || response.truncated)
          throw new Error('Herdr snapshot failed/timed out/truncated; no retry');
        fs.writeFileSync(path.join(agentDir, 'phase3-native-snapshot.json'), response.stdout, { flag: 'wx' });
        const snapshot = JSON.parse(response.stdout).result?.snapshot;
        const reported = snapshot?.agents?.filter(a => a.pane_id === process.env.HERDR_PANE_ID);
        if (snapshot?.version !== '0.9.5' || reported?.length !== 1)
          throw new Error('Expected server 0.9.5 and exactly one agent in this pane');
        const current = reported[0];
        if (current.agent !== 'pi' || current.agent_session?.source !== 'herdr:pi' ||
            current.agent_session?.agent !== 'pi' || current.agent_session?.kind !== 'path' ||
            current.agent_session?.value !== observation.sessionFile ||
            !['idle', 'done'].includes(current.agent_status) || current.launch_pending)
          throw new Error('Official reporter identity/path/settled-state mismatch; stop and inspect');
        // This test launches Pi directly in the foreground, not via agent start.
        // Herdr 0.9.5's interactive_ready describes managed-agent startup only:
        // it is false (and omitted in JSON) for a directly launched Pi. Do not
        // require it here or infer it is true. Settled fixture history, local
        // ctx.isIdle() and the official idle/done report are the evidence here.
        // Helper orchestration must retain its stricter managed readiness gate.
        // The raw snapshot above also survives a failed identity assertion.
        fs.writeFileSync(destination, JSON.stringify({ observation, paneId: process.env.HERDR_PANE_ID,
          reported: current, snapshot }) + '\n', { flag: 'wx' });
        ctx.ui.notify('Native checkpoint saved. Now /quit to let the host validate it.', 'info');
      } catch (error) {
        // Do not fabricate a successful observation or mutate the conversation.
        const failure = path.join(agentDir, 'phase3-native-error.txt');
        fs.writeFileSync(failure, String(error) + '\n', { flag: 'a' });
        ctx.ui.notify(`STOP: ${error}. /quit and inspect evidence; do not retry.`, 'error');
      }
    },
  });
}
