const { fail } = require('./core.cjs');
// Keep the complete JSON request below Vercel's 4.5 MB ceiling, including base64 overhead.
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
function validateImage(buffer, mime) {
  const valid =
    mime === 'image/jpeg'
      ? buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : mime === 'image/png'
        ? buffer.length >= 24 &&
          buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === 'image/webp' &&
          buffer.length >= 20 &&
          buffer.toString('ascii', 0, 4) === 'RIFF' &&
          buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) fail(400, 'Isi file tidak sesuai format gambar. Pilih foto JPG, PNG, atau WebP.');
}
module.exports = { MAX_REQUEST_BYTES, validateImage };
