/* Decode once, then create bounded upload and thumbnail variants. No server secrets here. */
(() => {
  const readBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ data: String(reader.result).split(',')[1], mimeType: blob.type });
      reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
      reader.readAsDataURL(blob);
    });
  async function prepare(source) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type))
      throw new Error('Pilih gambar JPG, PNG, atau WebP.');
    if (source.size > 10 * 1024 * 1024) throw new Error('Ukuran gambar awal maksimal 10 MB.');
    const objectUrl = URL.createObjectURL(source);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Format gambar tidak dapat dibaca.'));
        image.src = objectUrl;
      });
      if (image.naturalWidth * image.naturalHeight > 40_000_000)
        throw new Error('Resolusi gambar terlalu besar. Gunakan foto maksimal 40 megapiksel.');
      async function variant(dimension, quality, budget) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Browser tidak mendukung pemrosesan gambar.');
        try {
          for (let attempt = 0; attempt < 5; attempt++) {
            const scale = Math.min(
              1,
              dimension / Math.max(image.naturalWidth, image.naturalHeight),
            );
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            let blob = await new Promise((resolve) =>
              canvas.toBlob(resolve, 'image/webp', quality),
            );
            // Older browsers may silently encode PNG when WebP encoding is unavailable.
            if (blob?.type !== 'image/webp') {
              context.globalCompositeOperation = 'destination-over';
              context.fillStyle = '#ffffff';
              context.fillRect(0, 0, canvas.width, canvas.height);
              blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
            }
            if (!blob) throw new Error('Gambar tidak dapat diproses.');
            if (blob.size <= budget) return await readBase64(blob);
            dimension = Math.round(dimension * 0.85);
            quality = Math.max(0.6, quality - 0.06);
          }
          throw new Error('Gambar masih terlalu besar. Pilih foto yang lebih kecil.');
        } finally {
          canvas.width = canvas.height = 1;
        }
      }
      // Together these remain well below 4 MiB after base64 expansion and JSON metadata.
      const optimized = await variant(1600, 0.8, 2.5 * 1024 * 1024);
      const thumbnail = await variant(640, 0.72, 256 * 1024);
      return [optimized, thumbnail];
    } finally {
      URL.revokeObjectURL(objectUrl);
      image.src = '';
    }
  }
  window.WGAAdminMedia = { prepare };
})();
