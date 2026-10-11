/* Static catalog metadata shared by the home and catalog pages. */
(() => {
  const records = [
    ['Gayor + Angkul-Angkul', 'Dekor'],
    ['Gayor', 'Dekor'],
    ['Gayor Panggung', 'Dekor'],
    ['Tetaring', 'Dekor'],
    ['Photo Booth', 'Dekor'],
    ['Stand Foto', 'Dekor'],
    ['Tenda Kubu VIP / Kain', 'Tenda'],
    ['Tenda VIP / Kain', 'Tenda'],
    ['Tenda Biasa & Tenda Kubu', 'Tenda'],
    ['Tenda Pemios', 'Tenda'],
    ['Bale Metatah', 'Dekor'],
    ['Panggung / Triplek', 'Panggung'],
    ['Meja Buffe / Prasmanan', 'Meja'],
    ['Meja Panjang', 'Meja'],
    ['Meja Banten & Meja Kaca', 'Meja'],
    ['Meja Bundar', 'Meja'],
    ['Warung / Meja Welcome Drink', 'Warung'],
    ['Kursi', 'Kursi'],
    ['Sound & Lighting', 'Sound & Lighting'],
    ['TV & Kipas / Uap', 'Peralatan'],
    ['Alat Makan & Minum (1)', 'Alat Makan'],
    ['Alat Makan & Minum (2)', 'Alat Makan'],
    ['Alat Makan & Minum (3)', 'Alat Makan'],
    ['Alat Makan & Minum (4)', 'Alat Makan'],
    ['Kain Dinding', 'Kain Dinding'],
    ['Proyektor + Layar & Lampu', 'Peralatan'],
    ['Karpet & Sanggah Surya', 'Peralatan'],
    ['Alat Masak (1)', 'Alat Masak'],
    ['Alat Masak (2)', 'Alat Masak'],
    ['Alat Masak (3)', 'Alat Masak'],
  ].map(([title, category], index) => ({ id: index + 1, title, category }));
  window.WGACatalog = Object.freeze({
    records: Object.freeze(records.map((record) => Object.freeze(record))),
  });
})();
