// Retain image data and essential JPEG headers; discard metadata-bearing APP
// segments and comments before either the model or private storage sees bytes.
export function stripJpegMetadata(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('INVALID_JPEG');
  const chunks = [bytes.subarray(0, 2)];
  let offset = 2, foundImage = false;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new Error('INVALID_JPEG');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (!marker || marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
      throw new Error('INVALID_JPEG');
    if (offset + 2 > bytes.length) throw new Error('INVALID_JPEG');
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error('INVALID_JPEG');
    offset += length;
    if (marker === 0xda) {
      chunks.push(bytes.subarray(start));
      foundImage = true;
      break;
    }
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) chunks.push(bytes.subarray(start, offset));
  }
  if (!foundImage || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9)
    throw new Error('INVALID_JPEG');
  const size = chunks.reduce((n, part) => n + part.length, 0);
  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return result;
}
