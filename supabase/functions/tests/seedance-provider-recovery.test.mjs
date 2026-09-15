import assert from "node:assert/strict";

let recovery = {};
try {
  recovery = await import("../_shared/seedance-provider-recovery.mjs");
} catch {
  // The first red run proves the provider-aware recovery module is absent.
}

assert.equal(
  typeof recovery.refreshProviderPayload,
  "function",
  "Drive recovery must expose a provider-aware result refresher",
);

{
  const calls = [];
  const result = await recovery.refreshProviderPayload({
    task: { request_payload: { provider: "dashscope" } },
    providerTaskId: "wan-task-1",
    arkKey: "ark-key",
    dashscopeKey: "dashscope-key",
    dashscopeWorkspaceId: "workspace-1",
    queryArk: async () => {
      calls.push("ark");
      return {};
    },
    queryWan3Task: async (...args) => {
      calls.push(["dashscope", ...args]);
      return { output: { task_status: "SUCCEEDED", video_url: "https://example.test/wan.mp4" } };
    },
    normalizeWan3Result: (payload) => ({
      status: "succeeded",
      content: { video_url: payload.output.video_url },
    }),
    timeoutMs: 15_000,
  });

  assert.deepEqual(calls, [[
    "dashscope",
    "dashscope-key",
    "workspace-1",
    "wan-task-1",
    { timeoutMs: 15_000 },
  ]]);
  assert.equal(result.provider, "dashscope");
  assert.equal(result.payload.content.video_url, "https://example.test/wan.mp4");
}

{
  const calls = [];
  const result = await recovery.refreshProviderPayload({
    task: { request_payload: { provider: "ark" } },
    providerTaskId: "ark-task-1",
    arkKey: "ark-key",
    dashscopeKey: "dashscope-key",
    dashscopeWorkspaceId: "workspace-1",
    queryArk: async (...args) => {
      calls.push(args);
      return { content: { video_url: "https://example.test/ark.mp4" } };
    },
    queryWan3Task: async () => {
      throw new Error("Wan query must not run for Ark tasks");
    },
    normalizeWan3Result: () => {
      throw new Error("Wan normalization must not run for Ark tasks");
    },
    timeoutMs: 15_000,
  });

  assert.deepEqual(calls, [["ark-task-1", "ark-key", 15_000]]);
  assert.equal(result.provider, "ark");
  assert.equal(result.payload.content.video_url, "https://example.test/ark.mp4");
}

console.log("seedance provider recovery tests passed");
