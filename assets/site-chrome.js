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

  function renderUserStatus() {
    var navInner = document.querySelector('.nav-inner');
    if (!navInner) return;

    var oldStatus = navInner.querySelector('.user-status');
    if (oldStatus) oldStatus.remove();

    var statusEl = document.createElement('div');
    statusEl.className = 'user-status';

    var isLoggedIn = window.TommyAuth && typeof window.TommyAuth.isLoggedIn === 'function' && window.TommyAuth.isLoggedIn();
    
    if (isLoggedIn) {
      var user = window.TommyAuth.getUser();
      var avatarId = user && typeof user.avatar_id !== 'undefined' ? user.avatar_id : (user && user.id ? user.id % 48 : 0);
      
      var btn = document.createElement('button');
      btn.className = 'avatar-btn';
      btn.innerHTML = '<span class="nickname">' + (user ? user.nickname : 'Player') + '</span>';
      
      if (window.TommyAvatars) {
        var canvas = window.TommyAvatars.create(avatarId, 24);
        btn.prepend(canvas);
      }
      
      var dropdown = document.createElement('div');
      dropdown.className = 'user-dropdown';
      dropdown.innerHTML = '<button id="logoutBtn">退出登录</button>';
      
      btn.onclick = function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      };
      
      statusEl.appendChild(btn);
      statusEl.appendChild(dropdown);
      
      document.addEventListener('click', function() {
        dropdown.classList.remove('show');
      });
      
      dropdown.querySelector('#logoutBtn').onclick = function() {
        window.TommyAuth.clear();
        location.reload();
      };
    } else {
      var loginLink = document.createElement('a');
      loginLink.className = 'login-btn';
      // Intelligent path resolution
      var base = '';
      if (location.pathname.indexOf('/auth/') !== -1) base = '';
      else if (location.pathname.indexOf('/games/') !== -1 || location.pathname.indexOf('/blog/') !== -1 || location.pathname.indexOf('/about/') !== -1 || location.pathname.indexOf('/changelog/') !== -1) base = '../../auth/';
      else base = 'auth/';
      
      loginLink.href = base + 'login.html?return=' + encodeURIComponent(location.href);
      loginLink.textContent = '登录';
      statusEl.appendChild(loginLink);
    }

    var toggle = document.getElementById('menuToggle');
    if (toggle) {
      navInner.insertBefore(statusEl, toggle);
    } else {
      navInner.appendChild(statusEl);
    }
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
    renderUserStatus();
  });
  onScroll();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      updateNavActive();
      renderUserStatus();
    });
  } else {
    updateNavActive();
    renderUserStatus();
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
