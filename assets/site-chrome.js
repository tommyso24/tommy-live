(function () {
  var SECTION_IDS = ['games', 'blog'];

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    document.documentElement.classList.toggle('site-nav-compact', y > 48);

    var total = document.documentElement.scrollHeight - window.innerHeight;
    var pct = total > 0 ? Math.min((y / total) * 100, 100) : 0;
    var bar = document.getElementById('xpBar');
    if (bar) bar.style.width = pct + '%';

    updateNavActive();
  }

  function isHomePage() {
    var path = location.pathname.toLowerCase();
    if (path.indexOf('/blog/') !== -1) return false;
    if (path.indexOf('/games/') !== -1) return false;
    if (path.indexOf('changelog') !== -1) return false;
    if (path.indexOf('/about/') !== -1) return false;
    return path === '/' || path === '' || path === '/index.html';
  }

  function homeSectionFromScroll() {
    var y = (window.scrollY || document.documentElement.scrollTop) + 130;
    var current = null;
    for (var i = 0; i < SECTION_IDS.length; i++) {
      var el = document.getElementById(SECTION_IDS[i]);
      if (el && el.offsetTop <= y) current = SECTION_IDS[i];
    }
    return current;
  }

  function resolveActiveNavKey() {
    var path = location.pathname.toLowerCase();
    if (path.indexOf('food-spinner') !== -1) return 'games';
    if (path.indexOf('reaction') !== -1) return 'games';
    if (path.indexOf('changelog') !== -1) return 'changelog';
    if (path.indexOf('/blog/') !== -1) return 'blog';
    if (path.indexOf('/about/') !== -1) return 'about';

    if (!isHomePage()) return null;

    return homeSectionFromScroll();
  }

  function updateNavActive() {
    var key = resolveActiveNavKey();
    document.querySelectorAll('#navLinks a[data-nav]').forEach(function (a) {
      var match = a.getAttribute('data-nav') === key;
      a.classList.toggle('is-active', match);
      if (match) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', function () {
    updateNavActive();
  });
  window.addEventListener('load', function () {
    updateNavActive();
  });
  onScroll();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNavActive);
  } else {
    updateNavActive();
  }

  var toggle = document.getElementById('menuToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
      });
    });
  }
})();
