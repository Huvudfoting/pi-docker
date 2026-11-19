// TEST ONLY. Independent read-only observer for an OPEN Pi at the restart
// boundary. Does not report identity/resume argv or stop/restart any process.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const text = message => typeof message.content === 'string' ? message.content :
  message.content.filter(c => c.type === 'text').map(c => c.text).join('');
function observe(ctx) {
  const sm = ctx.sessionManager;
  const messages = sm.getBranch().filter(e => e.type === 'message').map(e => e.message);
  return { cwd: ctx.cwd, headerCwd: sm.getHeader().cwd, sessionId: sm.getSessionId(),
    sessionFile: sm.getSessionFile(), sessionName: sm.getSessionName(), hostname: os.hostname(),
    users: messages.filter(m => m.role === 'user').map(text),
    assistants: messages.filter(m => m.role === 'assistant').map(text) };
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function (pi) {
  const dir = process.env.PI_CODING_AGENT_DIR;
  if (!dir || fs.readFileSync(path.join(dir, 'phase3-fixture'), 'utf8') !== 'pi-docker-phase3-fixture\n' ||
      fs.readFileSync(path.join(dir, 'phase3-restart'), 'utf8') !== 'pi-docker-phase3-restart\n')
    throw new Error('Restart checkpoint requires isolated Phase 3 restart configuration');
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'phase3-restart.json'), 'utf8'));
  if (!['ordinary', 'linked'].includes(config.caseName) || !path.isAbsolute(config.cwd) || !config.title)
    throw new Error('Invalid restart fixture expectations');
  const phaseText = fs.readFileSync(path.join(dir, 'phase3-restart-stage'), 'utf8');
  if (!['seed\n', 'restored\n'].includes(phaseText)) throw new Error('Restart checkpoint is unarmed');
  const phase = phaseText.trim();
  const prefix = path.join(dir, `phase3-restart-${phase}`);
  const failFile = `${prefix}-error.txt`;
  const context = () => {
    if (fs.readFileSync(path.join(dir, 'phase3-restart-stage'), 'utf8') !== phaseText)
      throw new Error('Restart stage changed in a live process; stop without retry');
    if (process.env.HERDR_ENV !== '1' || !process.env.HERDR_PANE_ID ||
        !path.isAbsolute(process.env.HERDR_SOCKET_PATH ?? '') ||
        !fs.statSync(process.env.HERDR_SOCKET_PATH).isSocket())
      throw new Error('Genuine inherited Herdr context/socket required');
  };
  const fail = (error, ctx) => {
    fs.appendFileSync(failFile, String(error) + '\n');
    ctx.ui.notify(`STOP: ${error}. Keep evidence; do not retry or restart.`, 'error');
  };
  const expectedUsers = phase === 'seed' ? [`phase3-restart-${config.caseName}-seed`] :
    [`phase3-restart-${config.caseName}-seed`, `phase3-restart-${config.caseName}-restored`];
  const checkHistory = (state, users) => {
    if (!state.sessionId || !/^\/pi\/herdr-sessions\/[a-f0-9]{64}\/[a-zA-Z0-9_.-]+\.jsonl$/.test(state.sessionFile ?? '') ||
        state.cwd !== config.cwd || state.headerCwd !== config.cwd || state.sessionName !== config.title ||
        !equal(state.users, users) || !equal(state.assistants, users.map(s => 'offline-fixture:' + s)))
      throw new Error('Restart history/identity/title/cwd mismatch');
  };

  pi.on('session_start', (_event, ctx) => {
    try {
      context();
      if (ctx.mode !== 'tui') throw new Error('Restart fixture requires interactive TUI');
      // Exclusive startup evidence survives fixture-provider.ts overwriting its
      // latest observation on agent_settled. Duplicate startups fail, not replace.
      const state = observe(ctx);
      if (phase === 'restored') checkHistory(state, expectedUsers.slice(0, 1));
      fs.writeFileSync(`${prefix}-startup.json`, JSON.stringify({ phase, observation: state,
        paneId: process.env.HERDR_PANE_ID }) + '\n', { flag: 'wx' });
    } catch (error) { fail(error, ctx); }
  });
  pi.registerCommand('phase3-restart-checkpoint', {
    description: 'TEST ONLY: preserve open Pi history and official identity before/after server restart',
    async handler(args, ctx) {
      try {
        context();
        if (fs.existsSync(failFile)) throw new Error('Earlier restart observer failure; stop without retry');
        if (args.trim() || ctx.mode !== 'tui' || !ctx.isIdle()) throw new Error('Checkpoint requires idle TUI and no arguments');
        const destination = `${prefix}-checkpoint.json`;
        if (fs.existsSync(destination)) throw new Error('Restart checkpoint already exists; no retry/overwrite');
        const startup = JSON.parse(fs.readFileSync(`${prefix}-startup.json`, 'utf8'));
        const current = observe(ctx);
        checkHistory(current, expectedUsers);
        if (startup.phase !== phase || startup.paneId !== process.env.HERDR_PANE_ID ||
            startup.observation.sessionId !== current.sessionId || startup.observation.sessionFile !== current.sessionFile)
          throw new Error('Startup identity differs from checkpoint');
        const provider = JSON.parse(fs.readFileSync(path.join(dir, 'phase3-result.json'), 'utf8'));
        if (provider.stage !== 'settled' || provider.piVersion !== '1.5.2' || provider.hasHerdr !== true ||
            Object.keys(current).some(key => !equal(provider[key], current[key])))
          throw new Error('No matching settled provider observation');
        const response = await pi.exec('herdr', ['api', 'snapshot'], { timeout: 10000, maxBuffer: 1024 * 1024 });
        if (response.code !== 0 || response.killed || response.truncated)
          throw new Error('Herdr snapshot failed/timed out/truncated; no retry');
        fs.writeFileSync(`${prefix}-snapshot.json`, response.stdout, { flag: 'wx' });
        const snapshot = JSON.parse(response.stdout).result?.snapshot;
        const agent = snapshot?.agents?.[0];
        if (snapshot?.version !== '0.9.5' || snapshot.workspaces?.length !== 1 || snapshot.tabs?.length !== 1 ||
            snapshot.panes?.length !== 1 || snapshot.panes[0].pane_id !== process.env.HERDR_PANE_ID ||
            snapshot.agents?.length !== 1 || agent.pane_id !== process.env.HERDR_PANE_ID ||
            agent.agent !== 'pi' || !['idle', 'done'].includes(agent.agent_status) || agent.launch_pending ||
            agent.agent_session?.source !== 'herdr:pi' || agent.agent_session?.agent !== 'pi' ||
            agent.agent_session?.kind !== 'path' || agent.agent_session?.value !== current.sessionFile)
          throw new Error('Official live restart identity/path/settled-state/topology mismatch');
        // Direct native restore need not have managed interactive_ready=true.
        fs.writeFileSync(destination, JSON.stringify({ phase, observation: current, provider,
          paneId: process.env.HERDR_PANE_ID, reported: agent, snapshot }) + '\n', { flag: 'wx' });
        ctx.ui.notify(phase === 'seed' ?
          'Restart seed checkpoint saved. LEAVE PI RUNNING. Detach only at the reviewed operator boundary; do NOT /quit.' :
          'Restart checkpoint saved. Follow the reviewed visual/exit procedure; no automatic restore PASS is asserted.', 'info');
      } catch (error) { fail(error, ctx); }
    },
  });
}
