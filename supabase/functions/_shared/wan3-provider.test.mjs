import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WAN3_MODEL,
  WAN3_PRIME_MODEL,
  buildWan3Payload,
  createWan3Task,
  normalizeWan3Result,
  queryWan3Task,
  wan3BaseUrl,
} from './wan3-provider.mjs';

test('builds distinct standard and Prime model payloads', () => {
  assert.equal(WAN3_MODEL, 'wan3.0-video');
  assert.equal(WAN3_PRIME_MODEL, 'wan3.0-video-prime');
  assert.equal(buildWan3Payload({ prompt: '标准版' }).model, WAN3_MODEL);
  assert.equal(buildWan3Payload({ prompt: '高速版', model: WAN3_PRIME_MODEL }).model, WAN3_PRIME_MODEL);
});

test('builds the Beijing Wan 3.0 endpoint from a safe workspace id', () => {
  assert.equal(WAN3_MODEL, 'wan3.0-video');
  assert.equal(wan3BaseUrl(''), 'https://dashscope.aliyuncs.com/api/v1');
  assert.equal(
    wan3BaseUrl('ws_123-abc'),
    'https://ws_123-abc.cn-beijing.maas.aliyuncs.com/api/v1',
  );
  assert.throws(() => wan3BaseUrl('https://evil.example'), /WORKSPACE_ID_INVALID/);
});

test('maps text and Ark-style media into the official Wan payload', () => {
  const payload = buildWan3Payload({
    prompt: '图1在雨中奔跑',
    content: [
      { type: 'text', text: 'ignored duplicate prompt' },
      { type: 'image_url', image_url: { url: 'https://assets.example/first.png' }, role: 'first_frame' },
      { type: 'image_url', image_url: { url: 'https://assets.example/last.png' }, role: 'last_frame' },
    ],
    resolution: '1080p',
    ratio: '9:16',
    duration: 30,
    generateAudio: false,
  });

  assert.deepEqual(payload, {
    model: 'wan3.0-video',
    input: {
      prompt: '图1在雨中奔跑',
      media: [
        { type: 'first_frame', url: 'https://assets.example/first.png' },
        { type: 'last_frame', url: 'https://assets.example/last.png' },
      ],
    },
    parameters: {
      resolution: '1080P',
      ratio: '9:16',
      duration: 30,
      audio: false,
      prompt_extend: false,
      watermark: true,
    },
  });
});

test('clamps Wan controls and maps reference media types', () => {
  const payload = buildWan3Payload({
    prompt: '参考视频1的运镜',
    content: [
      { type: 'video_url', video_url: { url: 'https://assets.example/ref.mp4' }, role: 'reference_video' },
      { type: 'audio_url', audio_url: { url: 'https://assets.example/ref.wav' }, role: 'reference_audio' },
    ],
    resolution: '4k',
    ratio: '21:9',
    duration: 99,
    generateAudio: true,
  });
  assert.equal(payload.parameters.resolution, '720P');
  assert.equal(payload.parameters.ratio, 'adaptive');
  assert.equal(payload.parameters.duration, 30);
  assert.deepEqual(payload.input.media.map(item => item.type), ['reference_video', 'reference_audio']);
});

test('preserves official smart duration value', () => {
  const payload = buildWan3Payload({ prompt: '自动决定时长', duration: -1 });
  assert.equal(payload.parameters.duration, -1);
});

test('creates and queries an asynchronous Wan task without leaking the key', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST') {
      return new Response(JSON.stringify({ output: { task_id: 'wan-task-1', task_status: 'PENDING' }, request_id: 'req-1' }), { status: 200 });
    }
    return new Response(JSON.stringify({ output: { task_id: 'wan-task-1', task_status: 'SUCCEEDED', video_url: 'https://result.example/video.mp4' } }), { status: 200 });
  };
  const created = await createWan3Task('secret-value', 'ws_123', { model: WAN3_MODEL, input: { prompt: 'test' }, parameters: {} }, { fetchImpl });
  assert.equal(created.providerTaskId, 'wan-task-1');
  const queried = await queryWan3Task('secret-value', 'ws_123', 'wan-task-1', { fetchImpl });
  assert.equal(queried.output.video_url, 'https://result.example/video.mp4');
  assert.equal(calls[0].init.headers['X-DashScope-Async'], 'enable');
  assert.equal(JSON.stringify({ created, queried, calls: calls.map(call => call.url) }).includes('secret-value'), false);
});

test('normalizes Wan states for the existing durable task pipeline', () => {
  assert.deepEqual(normalizeWan3Result({ output: { task_status: 'PENDING' } }).status, 'queued');
  assert.deepEqual(normalizeWan3Result({ output: { task_status: 'RUNNING' } }).status, 'running');
  const success = normalizeWan3Result({ output: { task_status: 'SUCCEEDED', video_url: 'https://result.example/video.mp4' } });
  assert.equal(success.status, 'succeeded');
  assert.equal(success.content.video_url, 'https://result.example/video.mp4');
  const failed = normalizeWan3Result({ output: { task_status: 'FAILED', code: 'BadInput', message: 'bad request' } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'BadInput');
});
