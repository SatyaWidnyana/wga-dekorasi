(function(){
  const items = [
    {id:1, title:"Gayor + Angkul-Angkul", category:"Dekor", thumb:"assets/catalog/thumbs/page-01-thumb.webp", full:"assets/catalog/pages/page-01.webp"},
    {id:2, title:"Gayor", category:"Dekor", thumb:"assets/catalog/thumbs/page-02-thumb.webp", full:"assets/catalog/pages/page-02.webp"},
    {id:3, title:"Gayor Panggung", category:"Dekor", thumb:"assets/catalog/thumbs/page-03-thumb.webp", full:"assets/catalog/pages/page-03.webp"},
    {id:4, title:"Tetaring", category:"Dekor", thumb:"assets/catalog/thumbs/page-04-thumb.webp", full:"assets/catalog/pages/page-04.webp"},
    {id:5, title:"Photo Booth", category:"Dekor", thumb:"assets/catalog/thumbs/page-05-thumb.webp", full:"assets/catalog/pages/page-05.webp"},
    {id:6, title:"Stand Foto", category:"Dekor", thumb:"assets/catalog/thumbs/page-06-thumb.webp", full:"assets/catalog/pages/page-06.webp"},
    {id:7, title:"Tenda Kubu VIP / Kain", category:"Tenda", thumb:"assets/catalog/thumbs/page-07-thumb.webp", full:"assets/catalog/pages/page-07.webp"},
    {id:8, title:"Tenda VIP / Kain", category:"Tenda", thumb:"assets/catalog/thumbs/page-08-thumb.webp", full:"assets/catalog/pages/page-08.webp"},
    {id:9, title:"Tenda Biasa & Tenda Kubu", category:"Tenda", thumb:"assets/catalog/thumbs/page-09-thumb.webp", full:"assets/catalog/pages/page-09.webp"},
    {id:10, title:"Tenda Pemios", category:"Tenda", thumb:"assets/catalog/thumbs/page-10-thumb.webp", full:"assets/catalog/pages/page-10.webp"},
    {id:11, title:"Bale Metatah", category:"Dekor", thumb:"assets/catalog/thumbs/page-11-thumb.webp", full:"assets/catalog/pages/page-11.webp"},
    {id:12, title:"Panggung / Triplek", category:"Panggung", thumb:"assets/catalog/thumbs/page-12-thumb.webp", full:"assets/catalog/pages/page-12.webp"},
    {id:13, title:"Meja Buffe / Prasmanan", category:"Meja", thumb:"assets/catalog/thumbs/page-13-thumb.webp", full:"assets/catalog/pages/page-13.webp"},
    {id:14, title:"Meja Panjang", category:"Meja", thumb:"assets/catalog/thumbs/page-14-thumb.webp", full:"assets/catalog/pages/page-14.webp"},
    {id:15, title:"Meja Banten & Meja Kaca", category:"Meja", thumb:"assets/catalog/thumbs/page-15-thumb.webp", full:"assets/catalog/pages/page-15.webp"},
    {id:16, title:"Meja Bundar", category:"Meja", thumb:"assets/catalog/thumbs/page-16-thumb.webp", full:"assets/catalog/pages/page-16.webp"},
    {id:17, title:"Warung / Meja Welcome Drink", category:"Warung", thumb:"assets/catalog/thumbs/page-17-thumb.webp", full:"assets/catalog/pages/page-17.webp"},
    {id:18, title:"Kursi", category:"Kursi", thumb:"assets/catalog/thumbs/page-18-thumb.webp", full:"assets/catalog/pages/page-18.webp"},
    {id:19, title:"Sound & Lighting", category:"Sound & Lighting", thumb:"assets/catalog/thumbs/page-19-thumb.webp", full:"assets/catalog/pages/page-19.webp"},
    {id:20, title:"TV & Kipas / Uap", category:"Peralatan", thumb:"assets/catalog/thumbs/page-20-thumb.webp", full:"assets/catalog/pages/page-20.webp"},
    {id:21, title:"Alat Makan & Minum (1)", category:"Alat Makan", thumb:"assets/catalog/thumbs/page-21-thumb.webp", full:"assets/catalog/pages/page-21.webp"},
    {id:22, title:"Alat Makan & Minum (2)", category:"Alat Makan", thumb:"assets/catalog/thumbs/page-22-thumb.webp", full:"assets/catalog/pages/page-22.webp"},
    {id:23, title:"Alat Makan & Minum (3)", category:"Alat Makan", thumb:"assets/catalog/thumbs/page-23-thumb.webp", full:"assets/catalog/pages/page-23.webp"},
    {id:24, title:"Alat Makan & Minum (4)", category:"Alat Makan", thumb:"assets/catalog/thumbs/page-24-thumb.webp", full:"assets/catalog/pages/page-24.webp"},
    {id:25, title:"Kain Dinding", category:"Kain Dinding", thumb:"assets/catalog/thumbs/page-25-thumb.webp", full:"assets/catalog/pages/page-25.webp"},
    {id:26, title:"Proyektor + Layar & Lampu", category:"Peralatan", thumb:"assets/catalog/thumbs/page-26-thumb.webp", full:"assets/catalog/pages/page-26.webp"},
    {id:27, title:"Karpet & Sanggah Surya", category:"Peralatan", thumb:"assets/catalog/thumbs/page-27-thumb.webp", full:"assets/catalog/pages/page-27.webp"},
  ];

  const chipsWrap = document.getElementById("chips");
  const grid = document.getElementById("catalogGrid");
  const q = document.getElementById("q");
  const count = document.getElementById("count");

  const cats = ["Semua", ...Array.from(new Set(items.map(i=>i.category)))];

  let activeCat = "Semua";

  function makeChip(name){
    const b = document.createElement("button");
    b.className = "chip" + (name === activeCat ? " active" : "");
    b.type = "button";
    b.textContent = name;
    b.addEventListener("click", ()=>{
      activeCat = name;
      document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      render();
    });
    return b;
  }

  function card(item){
    const div = document.createElement("div");
    div.className = "catalog-card";
    div.setAttribute("role","button");
    div.setAttribute("tabindex","0");
    div.innerHTML = `
      <img src="${item.thumb}" alt="${item.title}" loading="lazy">
      <div class="body">
        <div class="title">${item.title}</div>
        <div class="meta">${item.category} • Halaman ${String(item.id).padStart(2,"0")}</div>
      </div>
    `;
    const open = ()=> window.WGALightbox?.open(item.full, item.title);
    div.addEventListener("click", open);
    div.addEventListener("keydown", (e)=>{ if(e.key==="Enter" || e.key===" "){ e.preventDefault(); open(); } });
    return div;
  }

  function render(){
    const term = (q?.value || "").trim().toLowerCase();
    const filtered = items.filter(it=>{
      const catOk = activeCat === "Semua" ? true : it.category === activeCat;
      const termOk = term ? it.title.toLowerCase().includes(term) : true;
      return catOk && termOk;
    });

    grid.innerHTML = "";
    filtered.forEach(it=> grid.appendChild(card(it)));

    if(count) count.textContent = `${filtered.length} item ditampilkan`;
  }

  if(chipsWrap){
    cats.forEach(c=> chipsWrap.appendChild(makeChip(c)));
  }
  if(q){
    q.addEventListener("input", ()=> render());
  }

  render();
})();