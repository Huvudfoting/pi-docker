#!/usr/bin/env node
// Narrow Docker-Pi start/ask adapter. Node built-ins only; no persistent state
// or raw socket client. All remote operations go through the official CLI.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const PANE = /^w[0-9]+:p[0-9]+$/;
const READY = new Set(["idle", "done"]);
const MAX_WIRE = 1024 * 1024;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
// JS's $ also matches before a final newline; require a full-string match.
const matches = (pattern, value) => typeof value === "string" && pattern.exec(value)?.[0] === value;
const now = () => performance.now() / 1000;

class Failure extends Error {
  constructor(code, message, { upstream, exitCode } = {}) {
    super(typeof message === "string" ? message : "Malformed upstream error message");
    this.detail = { code: typeof code === "string" ? code : "upstream_error", message: this.message };
    if (upstream !== undefined) this.detail.upstream = upstream;
    if (exitCode !== undefined) this.detail.cli_exit_code = exitCode;
  }
}
class Cancelled extends Failure {
  constructor(signal) { super("cancelled", `received signal ${signal}; no further I/O`); }
}

function excerpt(text, lines = 40, size = 16384) {
  // Terminal evidence is untrusted. Strip ANSI and remaining C0/C1 controls.
  const clean = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
  const rows = clean === "" ? [] : clean.split(/[\n\u2028\u2029]/);
  if (rows.at(-1) === "") rows.pop();
  const data = Buffer.from(rows.slice(-lines).join("\n"));
  let start = Math.max(0, data.length - size);
  // Do not introduce a replacement character by splitting a UTF-8 sequence.
  while (start < data.length && (data[start] & 0xc0) === 0x80) start++;
  return { text: data.subarray(start).toString("utf8"), truncated: data.length > size || rows.length > lines,
    trust: "untrusted" };
}

function parseResponse(text) {
  const value = JSON.parse(text);
  function check(node, depth = 0) {
    if (node === null || typeof node !== "object") return;
    if (depth > 64) throw new Error("Response nesting exceeds 64 levels");
    for (const child of Object.values(node)) check(child, depth + 1);
  }
  check(value);
  return value;
}

class Workflow {
  constructor(args) {
    this.args = args;
    this.deadline = now() + args.deadline_seconds;
    this.receipt = { schema_version: 1, operation: args.operation, stage: "validate", status: "failure",
      pane_id: null, agent: null, mutation: "not_attempted", startup: "not_attempted", delivery: "not_attempted" };
    this.target = null;
    this.cancelled = null;
    this.cancelCall = null;
  }
  fail(code, message) { throw new Failure(code, message); }
  remaining() { return Math.max(0, this.deadline - now()); }
  cancel(signal) {
    this.cancelled = new Cancelled(signal);
    this.cancelCall?.(this.cancelled);
  }

  async call(argv, { raw = false, wait = false, effect = null, limit = 5 } = {}) {
    if (this.cancelled) throw this.cancelled;
    const end = Math.min(this.deadline, now() + limit);
    const timeout = end - now();
    if (timeout <= 0) this.fail("deadline_exceeded", "absolute workflow deadline exhausted");
    // Leave room for upstream's timeout response within the client budget.
    if (wait) argv = [...argv, "--timeout", String(Math.max(1, Math.min(this.args.timeout_ms, Math.floor((timeout - .1) * 1000))))];
    const before = effect ? this.receipt[effect] : null;
    if (effect) this.receipt[effect] = "uncertain";
    const { out, err, code } = await new Promise((resolve, reject) => {
      let child;
      let finished = false;
      let timer;
      const buffers = { stdout: [], stderr: [] };
      let bytes = 0;
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.cancelCall = null;
        if (error && child?.pid) {
          // Stop only our local CLI process group, never the remote pane/agent.
          try { process.kill(-child.pid, "SIGKILL"); } catch (killError) {
            if (killError.code !== "ESRCH") child.kill("SIGKILL");
          }
          child.stdout.destroy();
          child.stderr.destroy();
        }
        if (error) reject(error); else resolve(result);
      };
      this.cancelCall = error => finish(error);
      try {
        child = spawn("herdr", argv, { stdio: ["ignore", "pipe", "pipe"], detached: true });
      } catch (error) {
        if (effect) this.receipt[effect] = before;
        finish(new Failure("cli_unavailable", error.message));
        return;
      }
      child.once("error", error => {
        if (finished) return;
        if (effect) this.receipt[effect] = before;
        finish(new Failure("cli_unavailable", error.message));
      });
      for (const key of ["stdout", "stderr"]) {
        child[key].on("data", chunk => {
          if (finished) return;
          bytes += chunk.length;
          if (bytes > MAX_WIRE) {
            finish(new Failure("response_too_large", "Herdr CLI response exceeded 1 MiB"));
          } else buffers[key].push(chunk);
        });
        child[key].on("error", error => finish(new Failure("client_io_error", error.message)));
      }
      child.once("close", (code, signal) => finish(null, {
        out: Buffer.concat(buffers.stdout).toString("utf8"),
        err: Buffer.concat(buffers.stderr).toString("utf8"), code: code ?? -({ SIGINT: 2, SIGKILL: 9, SIGTERM: 15 }[signal] ?? 1),
      }));
      timer = setTimeout(() => finish(new Failure("client_timeout",
        "Herdr CLI exceeded client deadline; remote operation may continue")), Math.max(1, (end - now()) * 1000));
    });
    const upstreamFailure = error => {
      if (effect === "delivery" && error.code === "agent_blocked") this.receipt.delivery = "rejected";
      return new Failure(error.code ?? "upstream_error", error.message ?? "Herdr error", { upstream: error, exitCode: code });
    };
    if (code !== 0) {
      for (const text of [err, out]) {
        let value;
        try { value = parseResponse(text); } catch { continue; }
        if (object(value) && object(value.error)) throw upstreamFailure(value.error);
      }
      throw new Failure("cli_failed", excerpt(err || out, 12, 2048).text || "Herdr CLI failed", { exitCode: code });
    }
    if (raw) return out;
    let envelope;
    try { envelope = parseResponse(out); } catch { this.fail("malformed_response", "expected a Herdr JSON envelope"); }
    if (!object(envelope)) this.fail("malformed_response", "expected a Herdr JSON object");
    if (object(envelope.error)) throw upstreamFailure(envelope.error);
    if (!object(envelope.result)) this.fail("malformed_response", "missing Herdr result object");
    return envelope.result;
  }

  agent(result) {
    const agent = result.agent;
    if (!object(agent) || !["pane_id", "terminal_id", "agent_status"].every(k => typeof agent[k] === "string" && agent[k]))
      this.fail("malformed_response", "missing agent identity/state");
    if (!matches(PANE, agent.pane_id)) this.fail("malformed_response", "invalid returned pane ID");
    if (agent.name != null && !matches(NAME, agent.name)) this.fail("malformed_response", "invalid returned agent name");
    if (![...READY, "working", "blocked", "unknown"].includes(agent.agent_status) || typeof agent.agent !== "string" || !agent.agent)
      this.fail("malformed_response", "invalid agent kind/state");
    return agent;
  }
  remember(agent) {
    const previous = this.receipt.agent;
    if (this.receipt.pane_id !== null && this.receipt.pane_id !== agent.pane_id) {
      this.receipt.observed_agent = agent;
      this.fail("identity_changed", "agent no longer occupies the known pane");
    }
    if (previous && ["pane_id", "terminal_id", "name", "agent"].some(k => (previous[k] ?? null) !== (agent[k] ?? null))) {
      this.receipt.observed_agent = agent;
      this.fail("identity_changed", "observed agent identity changed; no resend");
    }
    this.receipt.pane_id = agent.pane_id;
    this.receipt.agent = agent;
    // Pin subsequent calls to the location, not a reusable live alias.
    this.target = agent.pane_id;
  }
  ready(agent) {
    if (!READY.has(agent.agent_status) || agent.interactive_ready !== true || agent.launch_pending)
      this.fail("target_not_ready", "workflow requires idle/done, interactive_ready, non-pending agent");
  }
  validate() {
    const env = process.env;
    const socket = env.HERDR_SOCKET_PATH || "";
    let validSocket = false;
    try { validSocket = path.isAbsolute(socket) && fs.statSync(socket).isSocket(); } catch {}
    if (env.HERDR_ENV !== "1" || !matches(PANE, env.HERDR_PANE_ID) || !validSocket)
      this.fail("invalid_context", "requires inherited Herdr pane context and existing absolute Unix socket");
    // Do not rewrite env, select another server, or probe to identify context.
    if (this.args.deadline_seconds < 1 || this.args.deadline_seconds > 360 || this.args.timeout_ms < 1 || this.args.timeout_ms > 300000)
      this.fail("invalid_input", "deadline-seconds must be 1..360; timeout-ms must be 1..300000");
    if (this.args.operation === "start") {
      const root = env.PI_DOCKER_HOST_WORKSPACE || "";
      if (!path.isAbsolute(root) || /[\x00-\x1f\x7f]/.test(root))
        this.fail("invalid_host_workspace", "requires absolute PI_DOCKER_HOST_WORKSPACE; start a fresh integrated container");
      if (!matches(NAME, this.args.name)) this.fail("invalid_input", "name must match [a-z][a-z0-9_-]{0,31}");
      this.image = env.PI_DOCKER_IMAGE || "pi-docker:base";
      if (!matches(/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/, this.image))
        this.fail("invalid_input", "PI_DOCKER_IMAGE must be an image reference without whitespace or options");
      return root;
    }
    if (!matches(NAME, this.args.target) && !matches(PANE, this.args.target))
      this.fail("invalid_input", "target must be an explicit live name or pane ID");
    if (!this.args.prompt.trim() || this.args.prompt.includes("\0") || Buffer.byteLength(this.args.prompt) > 32768)
      this.fail("invalid_input", "prompt must be nonempty, NUL-free, and at most 32 KiB");
    if (this.args.lines < 1 || this.args.lines > 120) this.fail("invalid_input", "lines must be 1..120");
  }

  async start(root) {
    const r = this.receipt;
    r.requested_name = this.args.name;
    r.host_workspace = root;
    r.image = this.image;
    r.stage = "check_alias";
    const agents = (await this.call(["agent", "list"])).agents;
    if (!Array.isArray(agents) || !agents.every(object)) this.fail("malformed_response", "missing agent list");
    if (agents.some(a => a.name === this.args.name)) this.fail("duplicate_name", "live agent name already exists; no pane created");
    let direction = this.args.direction;
    if (direction === "auto") {
      r.stage = "layout";
      const layout = (await this.call(["pane", "layout", "--pane", process.env.HERDR_PANE_ID])).layout;
      const pane = object(layout) && Array.isArray(layout.panes) && layout.panes.find(p => object(p) && p.pane_id === process.env.HERDR_PANE_ID);
      const width = pane?.rect?.width, height = pane?.rect?.height;
      if (![width, height].every(n => typeof n === "number" && Number.isFinite(n) && n > 0))
        this.fail("malformed_response", "caller pane geometry missing/invalid");
      direction = width >= 80 && width >= height * 2 ? "right" : "down";
    }
    r.direction = direction;
    r.stage = "split";
    const result = await this.call(["pane", "split", "--current", "--direction", direction, "--cwd", root, "--no-focus"], { effect: "mutation" });
    const pane = object(result.pane) ? result.pane.pane_id : null;
    if (!matches(PANE, pane)) this.fail("malformed_response", "split returned no valid pane ID; creation uncertain");
    r.pane_id = pane; // Retain immediately, before startup or further validation.
    r.mutation = "pane_created";
    if (pane === process.env.HERDR_PANE_ID) this.fail("malformed_response", "split returned caller pane; refusing startup");
    r.stage = "start";
    const budget = Math.min(this.args.timeout_ms, Math.max(1, Math.floor((this.remaining() - .1) * 1000)));
    const started = await this.call(["agent", "start", this.args.name, "--kind", "pi", "--pane", pane,
      "--timeout", String(budget), "--", root, "--name", this.args.name, "--image", this.image, "--herdr"],
    { effect: "startup", limit: Math.min(this.args.timeout_ms / 1000 + 1, this.remaining()) });
    r.startup = "acknowledged";
    this.remember(this.agent(started));
    if (r.agent.name !== this.args.name || r.agent.agent !== "pi") this.fail("identity_changed", "startup did not return requested Pi identity");
    r.stage = "resolve_started";
    this.remember(this.agent(await this.call(["agent", "get", this.target])));
    this.ready(r.agent);
    r.mutation = "agent_ready";
  }

  async ask() {
    const r = this.receipt;
    r.requested_target = this.args.target;
    r.stage = "resolve_target";
    this.remember(this.agent(await this.call(["agent", "get", this.args.target])));
    if (r.pane_id === process.env.HERDR_PANE_ID) this.fail("invalid_target", "cannot synchronously ask the calling agent");
    this.ready(r.agent);
    r.stage = "prompt";
    const result = await this.call(["agent", "prompt", this.target, this.args.prompt, "--wait"],
      { wait: true, effect: "delivery", limit: this.args.timeout_ms / 1000 + 1 });
    r.delivery = "acknowledged";
    this.remember(this.agent(result));
    r.stage = "inspect_settled";
    this.remember(this.agent(await this.call(["agent", "get", this.target])));
    if (![...READY, "blocked"].includes(r.agent.agent_status)) this.fail("not_settled", "agent no longer settled after prompt wait");
    r.stage = "read";
    r.output = excerpt(await this.call(["agent", "read", this.target, "--source", "recent-unwrapped", "--lines", String(this.args.lines)], { raw: true }), this.args.lines);
    r.stage = "verify_identity";
    this.remember(this.agent(await this.call(["agent", "get", this.target])));
    if (![...READY, "blocked"].includes(r.agent.agent_status)) this.fail("not_settled", "agent resumed work during output retrieval");
    r.task_completion = "not_asserted";
  }

  async run() {
    try {
      const root = this.validate();
      if (this.args.operation === "start") await this.start(root); else await this.ask();
      Object.assign(this.receipt, { status: "success", stage: "complete" });
    } catch (error) {
      if (!(error instanceof Failure)) throw error;
      this.receipt.error = error.detail;
      if (this.receipt.mutation !== "not_attempted" || this.receipt.delivery !== "not_attempted") this.receipt.status = "partial_failure";
      // Small best-effort evidence, same absolute deadline, never on cancel.
      if (!(error instanceof Cancelled) && this.target && this.remaining() > .05) {
        try {
          this.receipt.diagnostic = excerpt(await this.call(["agent", "read", this.target, "--source", "recent-unwrapped", "--lines", "12"],
            { raw: true, limit: 1.5 }), 12, 2048);
        } catch (diagnostic) {
          if (!(diagnostic instanceof Failure)) throw diagnostic;
          this.receipt.diagnostic_error = diagnostic.detail;
        }
      }
    }
    return this.receipt;
  }
}

const HELP = `Usage: herdr-helper.js start --name NAME [--direction auto|right|down]
       herdr-helper.js ask --target NAME_OR_PANE --prompt TEXT [--lines N]
Both commands: --timeout-ms N (default 120000), --deadline-seconds N (default 150)
Narrow Docker-Pi start/ask adapter. Requires inherited Herdr context.
`;
function parse(argv) {
  if (["-h", "--help"].includes(argv[0])) {
    process.stdout.write(HELP);
    return null;
  }
  const operation = argv[0];
  const invalid = message => { throw new Failure("invalid_arguments", message); };
  if (!["start", "ask"].includes(operation)) invalid("expected start or ask");
  const args = { operation, timeout_ms: 120000, deadline_seconds: 150, ...(operation === "start" ? { direction: "auto" } : { lines: 40 }) };
  const allowed = new Set(["timeout-ms", "deadline-seconds", ...(operation === "start" ? ["name", "direction"] : ["target", "prompt", "lines"])]);
  for (let i = 1; i < argv.length; i++) {
    if (["-h", "--help"].includes(argv[i])) {
      process.stdout.write(HELP);
      return null;
    }
    const match = /^--([^=]+)(?:=([\s\S]*))?$/.exec(argv[i]);
    if (!match || !allowed.has(match[1])) invalid(`unrecognized argument: ${argv[i]}`);
    const key = match[1].replaceAll("-", "_");
    const value = match[2] !== undefined ? match[2] : argv[++i];
    const integer = ["timeout_ms", "deadline_seconds", "lines"].includes(key);
    if (value === undefined || (match[2] === undefined && value.startsWith("-") && !/^-\d+$/.test(value)))
      invalid(`--${match[1]} needs a value`);
    if (integer && (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) invalid(`--${match[1]} needs an integer`);
    args[key] = integer ? Number(value) : value;
  }
  for (const key of operation === "start" ? ["name"] : ["target", "prompt"]) {
    if (args[key] === undefined) invalid(`--${key} is required`);
  }
  if (operation === "start" && !["auto", "right", "down"].includes(args.direction)) invalid("direction must be auto, right, or down");
  return args;
}

async function main() {
  let receipt;
  try {
    const args = parse(process.argv.slice(2));
    if (!args) return;
    const workflow = new Workflow(args);
    const onInt = () => workflow.cancel("SIGINT");
    const onTerm = () => workflow.cancel("SIGTERM");
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    try { receipt = await workflow.run(); } finally {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
    }
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    receipt = { schema_version: 1, operation: null, stage: "arguments", status: "failure", error: error.detail,
      pane_id: null, agent: null, mutation: "not_attempted", startup: "not_attempted", delivery: "not_attempted" };
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.status === "success" ? 0 : (["invalid_arguments", "invalid_input", "invalid_context", "invalid_host_workspace", "invalid_target"].includes(receipt.error.code) ? 2 : 1);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
