export async function refreshProviderPayload({
  task,
  providerTaskId,
  arkKey,
  dashscopeKey,
  dashscopeWorkspaceId,
  queryArk,
  queryWan3Task,
  normalizeWan3Result,
  timeoutMs = 15_000,
}) {
  if (task?.request_payload?.provider === "dashscope") {
    if (!dashscopeKey) throw new Error("WAN3_SERVER_CONFIGURATION_MISSING");
    const rawPayload = await queryWan3Task(
      dashscopeKey,
      dashscopeWorkspaceId,
      providerTaskId,
      { timeoutMs },
    );
    return {
      provider: "dashscope",
      payload: normalizeWan3Result(rawPayload),
    };
  }

  if (!arkKey) throw new Error("ARK_API_KEY_MISSING");
  return {
    provider: "ark",
    payload: await queryArk(providerTaskId, arkKey, timeoutMs),
  };
}
