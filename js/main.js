(function(){
  const byId = (id)=>document.getElementById(id);

  // mobile menu
  const btn = byId("menuBtn");
  const mobile = byId("mobileMenu");
  if(btn && mobile){
    btn.addEventListener("click", ()=> mobile.classList.toggle("open"));
    mobile.querySelectorAll("a").forEach(a=>{
      a.addEventListener("click", ()=> mobile.classList.remove("open"));
    })
  }

  // year
  const year = byId("year");
  if(year) year.textContent = new Date().getFullYear();

  // lightbox
  const modal = byId("lightbox");
  const modalImg = byId("lightboxImg");
  const closeBtn = byId("lightboxClose");

  function open(src, alt){
    if(!modal || !modalImg) return;
    modalImg.src = src;
    modalImg.alt = alt || "Preview katalog";
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function close(){
    if(!modal || !modalImg) return;
    modal.classList.remove("open");
    modalImg.src = "";
    document.body.style.overflow = "";
  }

  if(modal && closeBtn){
    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e)=>{ if(e.target === modal) close(); });
    document.addEventListener("keydown", (e)=>{ if(e.key === "Escape") close(); });
  }

  document.querySelectorAll("[data-lightbox-src]").forEach(el=>{
    el.addEventListener("click", ()=>{
      open(el.getAttribute("data-lightbox-src"), el.getAttribute("data-lightbox-alt"));
    });
  });

  // expose for catalog.js
  window.WGALightbox = { open, close };
})();