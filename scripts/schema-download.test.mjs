import assert from 'node:assert/strict';
import test from 'node:test';
import { readSchemaResponse } from './schema-download.mjs';

function streamed(chunks, headers = {}) {
  let pulls = 0;
  let cancelled = false;
  const response = new Response(
    new ReadableStream(
      {
        pull(controller) {
          if (pulls < chunks.length) controller.enqueue(chunks[pulls++]);
          else controller.close();
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
    { headers },
  );
  return { response, pulls: () => pulls, cancelled: () => cancelled };
}

test('reads an exact-size response and preserves bytes', async () => {
  const source = streamed([Uint8Array.of(1, 2), Uint8Array.of(3, 4)], { 'content-length': '4' });
  assert.deepEqual(await readSchemaResponse(source.response, 4), Uint8Array.of(1, 2, 3, 4));
  assert.equal(source.cancelled(), false);
});

test('cancels an oversized declared body before reading', async () => {
  const source = streamed([new Uint8Array(8)], { 'content-length': '8' });
  await assert.rejects(readSchemaResponse(source.response, 4), /exceeds verification budget/);
  assert.equal(source.pulls(), 0);
  assert.equal(source.cancelled(), true);
});

test('cancels chunked data at first overflow instead of buffering the whole response', async () => {
  const source = streamed(Array.from({ length: 8 }, () => new Uint8Array(512 * 1024)));
  await assert.rejects(readSchemaResponse(source.response), /exceeds verification budget/);
  assert.equal(source.pulls(), 5);
  assert.equal(source.cancelled(), true);
});

test('checks actual bytes even when content-length understates the body', async () => {
  const source = streamed([new Uint8Array(3), new Uint8Array(3), new Uint8Array(3)], {
    'content-length': '1',
  });
  await assert.rejects(readSchemaResponse(source.response, 4), /exceeds verification budget/);
  assert.equal(source.pulls(), 2);
  assert.equal(source.cancelled(), true);
});

test('applies the limit to decoded bytes of a compressed response', async () => {
  const source = streamed([Uint8Array.of(1, 2)], {
    'content-length': '50',
    'content-encoding': 'gzip',
  });
  assert.deepEqual(await readSchemaResponse(source.response, 2), Uint8Array.of(1, 2));
});

test('propagates stream failures and releases the reader', async () => {
  const failure = new Error('stream interrupted');
  const body = new ReadableStream({
    pull(controller) {
      controller.error(failure);
    },
  });
  await assert.rejects(readSchemaResponse(new Response(body)), /stream interrupted/);
  assert.equal(body.locked, false);
});

test('supports empty responses and zero-size budgets', async () => {
  assert.deepEqual(await readSchemaResponse(new Response(null), 0), new Uint8Array());
  const source = streamed([Uint8Array.of(1)]);
  await assert.rejects(readSchemaResponse(source.response, 0), /exceeds verification budget/);
  assert.equal(source.cancelled(), true);
});

test('checks even a single oversized response chunk before retaining it', async () => {
  const source = streamed([new Uint8Array(10), Uint8Array.of(1)]);
  await assert.rejects(readSchemaResponse(source.response, 4), /exceeds verification budget/);
  assert.equal(source.pulls(), 1);
  assert.equal(source.cancelled(), true);
});
