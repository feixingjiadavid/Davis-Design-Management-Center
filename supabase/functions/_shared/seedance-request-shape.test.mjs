import assert from "node:assert/strict";
import {
  buildSeedanceRequestShape,
  compatibilityPayloadForPrivacyRetry,
} from "./seedance-request-shape.mjs";

const image = (url, name = "source.jpg") => ({
  url,
  mime_type: "image/jpeg",
  direction: "overall",
  name,
});

{
  const result = buildSeedanceRequestShape({
    isTextOnly: true,
    promptText: "云海日出",
    referenceItems: [],
  });
  assert.equal(result.taskType, "text_to_video");
  assert.deepEqual(result.content, [{ type: "text", text: "云海日出" }]);
}

{
  const sourceUrl = "https://example.test/original.jpg?token=unchanged";
  const result = buildSeedanceRequestShape({
    isTextOnly: true,
    promptText: "人物自然眨眼",
    referenceItems: [image(sourceUrl)],
  });
  assert.equal(result.taskType, "single_image_i2v");
  assert.equal(result.imageSubmissionMethod, "supabase_signed_url_original");
  assert.equal(result.content[1].role, "first_frame");
  assert.equal(result.content[1].image_url.url, sourceUrl);
  assert.equal(result.content[1].reference_direction, undefined);
}

{
  const result = buildSeedanceRequestShape({
    isTextOnly: false,
    promptText: "镜头平稳推进",
    firstFrameUrl: "https://example.test/first.png",
    lastFrameUrl: "https://example.test/last.png",
  });
  assert.equal(result.taskType, "first_last_i2v");
  assert.deepEqual(result.content.slice(1).map((item) => item.role), [
    "first_frame",
    "last_frame",
  ]);
}

{
  const result = buildSeedanceRequestShape({
    isTextOnly: true,
    promptText: "保持角色一致",
    referenceItems: [
      image("https://example.test/a.png", "a.png"),
      image("https://example.test/b.png", "b.png"),
    ],
  });
  assert.equal(result.taskType, "multi_reference_storyboard");
  assert.deepEqual(result.content.slice(1).map((item) => item.role), [
    "reference_image",
    "reference_image",
  ]);
}

{
  const sourceUrl = "https://example.test/original.jpg?token=unchanged";
  const initial = buildSeedanceRequestShape({
    isTextOnly: true,
    promptText: "人物自然动作",
    referenceItems: [image(sourceUrl)],
  });
  const retryPayload = compatibilityPayloadForPrivacyRetry(
    { model: "doubao-seedance-2-0-mini-260615", content: initial.content },
    initial.taskType,
  );
  assert.ok(retryPayload);
  assert.equal(retryPayload.content[1].role, "reference_image");
  assert.equal(retryPayload.content[1].image_url.url, sourceUrl);
  assert.equal(
    compatibilityPayloadForPrivacyRetry(
      { model: "doubao-seedance-2-0-mini-260615", content: initial.content },
      "first_last_i2v",
    ),
    null,
  );
}

console.log("seedance request shape tests passed");
