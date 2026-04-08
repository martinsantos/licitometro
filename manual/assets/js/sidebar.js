// Sidebar navigation for Licitómetro Manual
// Uses safe DOM methods (no innerHTML) to avoid XSS risks

(function() {
  const NAV = [
    {
      title: 'Inicio Rápido',
      icon: '🎯',
      items: [
        { href: '/manual/', label: '¿Qué es Licitómetro?' },
        { href: '/manual/pages/inicio-rapido.html', label: 'Primer ingreso' },
      ],
    },
    {
      title: 'Uso Diario',
      icon: '📋',
      items: [
        { href: '/manual/pages/listado.html', label: 'Listado de licitaciones' },
        { href: '/manual/pages/detalle.html', label: 'Detalle de licitación' },
        { href: '/manual/pages/favoritos.html', label: 'Favoritos' },
        { href: '/manual/pages/perfil.html', label: 'Mi Perfil' },
      ],
    },
    {
      title: 'Búsqueda Inteligente',
      icon: '🔍',
      items: [
        { href: '/manual/pages/hunter.html', label: 'HUNTER (Cazador)' },
        { href: '/manual/pages/nodos.html', label: 'Nodos semánticos' },
      ],
    },
    {
      title: 'Cotizar',
      icon: '💼',
      items: [
        { href: '/manual/pages/cotizar.html', label: 'CotizAR (6 pasos)' },
        { href: '/manual/pages/empresa.html', label: 'Mi Empresa' },
      ],
    },
    {
      title: 'Análisis',
      icon: '📊',
      items: [
        { href: '/manual/pages/stats.html', label: 'Estadísticas' },
      ],
    },
    {
      title: 'Administración',
      icon: '🔧',
      items: [
        { href: '/manual/pages/admin.html', label: 'Panel de admin', badge: 'Admin' },
        { href: '/manual/pages/lab.html', label: 'Lab experimental', badge: 'Admin' },
      ],
    },
    {
      title: 'Referencia',
      icon: '📚',
      items: [
        { href: '/manual/pages/referencia.html', label: 'Glosario y referencia' },
        { href: '/manual/pages/changelog.html', label: 'Changelog' },
      ],
    },
  ];

  function el(tag, opts, children) {
    const node = document.createElement(tag);
    if (opts) {
      if (opts.className) node.className = opts.className;
      if (opts.text) node.textContent = opts.text;
      if (opts.href) node.href = opts.href;
      if (opts.id) node.id = opts.id;
      if (opts.type) node.type = opts.type;
      if (opts.placeholder) node.placeholder = opts.placeholder;
      if (opts.autocomplete) node.setAttribute('autocomplete', opts.autocomplete);
    }
    if (children) {
      for (const c of children) {
        if (c) node.appendChild(c);
      }
    }
    return node;
  }

  function matchPath(current, target) {
    const cur = current.replace(/\/$/, '');
    const tgt = target.split('#')[0].split('?')[0].replace(/\/$/, '');
    if (cur === tgt) return true;
    if (cur === tgt + '/index.html') return true;
    if (cur + '/index.html' === tgt) return true;
    return false;
  }

  function buildSidebar(container) {
    while (container.firstChild) container.removeChild(container.firstChild);

    // Brand
    const brand = el('div', { className: 'sidebar-brand' });
    const brandLink = el('a', { href: '/manual/' });
    const logo = el('div', { className: 'logo-icon', text: 'L' });
    const brandText = el('div');
    brandText.appendChild(el('div', { className: 'brand-text', text: 'Manual Licitómetro' }));
    brandText.appendChild(el('div', { className: 'brand-subtitle', text: 'v2.0 · Beta' }));
    brandLink.appendChild(logo);
    brandLink.appendChild(brandText);
    brand.appendChild(brandLink);
    container.appendChild(brand);

    // Search
    const searchBox = el('div', { className: 'sidebar-search' });
    const input = el('input', {
      type: 'text', id: 'manual-search',
      placeholder: 'Buscar...', autocomplete: 'off',
    });
    const results = el('div', { className: 'sidebar-search-results', id: 'search-results' });
    searchBox.appendChild(input);
    searchBox.appendChild(results);
    container.appendChild(searchBox);

    // Nav
    const nav = el('div', { className: 'sidebar-nav' });
    const currentPath = window.location.pathname;

    for (const section of NAV) {
      const sec = el('div', { className: 'sidebar-section' });
      const title = el('div', {
        className: 'sidebar-section-title',
        text: section.icon + ' ' + section.title,
      });
      sec.appendChild(title);

      for (const item of section.items) {
        const link = el('a', { href: item.href });
        link.appendChild(document.createTextNode(item.label));
        if (item.badge) {
          link.appendChild(document.createTextNode(' '));
          const badge = el('span', { className: 'badge admin', text: item.badge });
          link.appendChild(badge);
        }
        if (matchPath(currentPath, item.href)) {
          link.classList.add('active');
        }
        sec.appendChild(link);
      }
      nav.appendChild(sec);
    }
    container.appendChild(nav);
  }

  function setupMobileToggle() {
    const toggle = document.querySelector('.mobile-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!toggle || !sidebar || !overlay) return;
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });
  }

  function setupScrollProgress() {
    const bar = document.querySelector('.scroll-progress');
    if (!bar) return;
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (scrolled / max) * 100 : 0;
      bar.style.width = pct + '%';
    });
  }

  function init() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      buildSidebar(sidebar);
    }
    setupMobileToggle();
    setupScrollProgress();
    if (typeof initSearch === 'function') initSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
