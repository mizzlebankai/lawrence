/* Lawrence Senior High School — shared site behavior */
document.addEventListener('DOMContentLoaded', function () {

  var body = document.body;
  var themeToggle = document.querySelector('.theme-switch');
  var header = document.querySelector('.site-header');
  var isHeroPage = body.classList.contains('has-hero');

  function applyTheme(theme) {
    if (!theme) {
      theme = localStorage.getItem('lawrence-theme') || 'dark';
    }
    body.setAttribute('data-theme', theme);
    localStorage.setItem('lawrence-theme', theme);
    if (themeToggle) {
      var icon = themeToggle.querySelector('.theme-icon');
      if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
    }
  }

  applyTheme();

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var currentTheme = body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(currentTheme);
    });
  }

  function updateHeaderState() {
    if (!header) return;
    if (!isHeroPage) { header.classList.add('is-solid'); return; }
    if (window.scrollY > 60) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  }
  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });

  var toggleBtn = document.querySelector('.menu-toggle');
  var closeBtn = document.querySelector('.mobile-menu-close');
  var mobileMenu = document.querySelector('.mobile-menu');

  function openMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.add('is-open');
    body.classList.add('menu-open');
  }
  function closeMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('is-open');
    body.classList.remove('menu-open');
  }
  if (toggleBtn) toggleBtn.addEventListener('click', function () {
    openMenu();
    if (toggleBtn.querySelectorAll('span').length) {
      toggleBtn.querySelectorAll('span').forEach(function (span, index) {
        if (index === 0) span.style.transform = 'translateY(7px) rotate(45deg)';
        if (index === 1) span.style.opacity = '0';
        if (index === 2) span.style.transform = 'translateY(-7px) rotate(-45deg)';
      });
    }
  });
  if (closeBtn) closeBtn.addEventListener('click', function () {
    closeMenu();
    if (toggleBtn && toggleBtn.querySelectorAll('span').length) {
      toggleBtn.querySelectorAll('span').forEach(function (span) {
        span.style.transform = 'none';
        span.style.opacity = '1';
      });
    }
  });
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        closeMenu();
        if (toggleBtn && toggleBtn.querySelectorAll('span').length) {
          toggleBtn.querySelectorAll('span').forEach(function (span) {
            span.style.transform = 'none';
            span.style.opacity = '1';
          });
        }
      });
    });
  }

  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  var counters = document.querySelectorAll('[data-count-to]');
  if ('IntersectionObserver' in window && counters.length) {
    var counterIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseFloat(el.getAttribute('data-count-to'));
        var decimals = (el.getAttribute('data-count-to').split('.')[1] || '').length;
        var duration = 1400;
        var start = null;

        function step(ts) {
          if (!start) start = ts;
          var progress = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = (target * eased).toFixed(decimals);
          if (progress < 1) requestAnimationFrame(step);
          else el.textContent = target.toFixed(decimals);
        }
        requestAnimationFrame(step);
        counterIO.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { counterIO.observe(el); });
  }

  var currentPage = (window.location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.primary-nav a, .mobile-menu nav a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === currentPage) a.classList.add('is-active');
  });

  var applyForm = document.getElementById('admissionForm');
  if (applyForm) {
    applyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!applyForm.checkValidity()) {
        applyForm.classList.add('was-validated');
        return;
      }
      var confirmBox = document.getElementById('applySuccess');
      applyForm.classList.add('d-none');
      if (confirmBox) confirmBox.classList.remove('d-none');
      window.scrollTo({ top: confirmBox.offsetTop - 140, behavior: 'smooth' });
    });
  }
});
