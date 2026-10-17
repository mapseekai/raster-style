const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;

/** Read at most maxBytes of decoded response data; cancel on the first excess chunk. */
export async function readSchemaResponse(response, maxBytes = MAX_SCHEMA_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('Schema response budget must be a nonnegative integer');
  }
  const length = response.headers.get('content-length');
  const encoding = response.headers.get('content-encoding');
  if (
    (!encoding || encoding === 'identity') &&
    length !== null &&
    /^[0-9]+$/.test(length) &&
    BigInt(length) > BigInt(maxBytes)
  ) {
    await response.body?.cancel();
    throw new RangeError('Published resource exceeds verification budget');
  }
  if (response.body === null) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - size) {
        throw new RangeError('Published resource exceeds verification budget');
      }
      size += value.byteLength;
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel(error);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
