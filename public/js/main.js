(function () {
  var html = document.documentElement;
  var curtain = document.getElementById('curtain');
  var intro = document.getElementById('intro');
  var header = document.getElementById('siteHeader');
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----- Entrada (1x por sessão) + cortina de página -----
  function openCurtain() {
    if (!curtain) return;
    curtain.classList.remove('close');
    // dois frames para a transição ser aplicada
    requestAnimationFrame(function () { requestAnimationFrame(function () { curtain.classList.add('open'); }); });
  }

  if (html.classList.contains('show-intro') && intro) {
    try { sessionStorage.setItem('lp-intro', '1'); } catch (e) {}
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      intro.classList.add('done');
      document.body.style.overflow = '';
      html.classList.remove('show-intro');
      openCurtain();
    }, reduce ? 200 : 2100);
  } else {
    openCurtain();
  }

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) openCurtain(); // voltar atrás (bfcache)
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || a.target === '_blank' || a.hasAttribute('download')) return;
    if (a.origin !== location.origin) return;
    if (a.pathname === location.pathname && a.search === location.search) return;
    if (reduce || !curtain) return;
    e.preventDefault();
    if (nav) nav.classList.remove('open');
    curtain.classList.add('close');
    setTimeout(function () { location.href = a.href; }, 520);
  });

  // ----- Cabeçalho -----
  function onScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 24); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  // ----- Revelar ao fazer scroll -----
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  // ----- Marquee: duplicar conteúdo para loop contínuo -----
  var track = document.querySelector('.marquee-track');
  if (track) track.innerHTML += track.innerHTML;

  // ----- Galeria: filtros + lightbox -----
  var filters = document.getElementById('filters');
  var gallery = document.getElementById('gallery');
  if (filters && gallery) {
    filters.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      filters.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('active', c === chip); });
      var cat = chip.getAttribute('data-cat');
      gallery.querySelectorAll('.g-item').forEach(function (it) {
        var show = cat === '*' || it.getAttribute('data-cat') === cat;
        it.classList.toggle('hide', !show);
        if (show) it.classList.add('in');
      });
    });
  }
  var lb = document.getElementById('lightbox');
  if (lb && gallery) {
    var lbImg = lb.querySelector('img');
    var lbCap = lb.querySelector('figcaption');
    gallery.addEventListener('click', function (e) {
      var b = e.target.closest('.g-btn');
      if (!b) return;
      lbImg.src = b.getAttribute('data-full');
      lbImg.alt = b.getAttribute('data-cap') || '';
      lbCap.textContent = b.getAttribute('data-cap') || '';
      lb.hidden = false;
      document.body.style.overflow = 'hidden';
    });
    var closeLb = function () { lb.hidden = true; lbImg.src = ''; document.body.style.overflow = ''; };
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-close')) closeLb(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) closeLb(); });
  }
})();
