import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

const Header = ({ userRole }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [aiUsage, setAiUsage] = useState(null);
  const moreRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;
  const isAdmin = userRole === 'admin';

  // Primary nav (always visible). Admin-only links filtered below.
  const primaryLinks = [
    { path: '/', label: 'Inicio' },
    { path: '/licitaciones', label: 'Licitaciones' },
    { path: '/licitaciones-ar', label: 'Lic. AR', icon: (
      <span className="px-1 py-0.5 bg-sky-500 text-white text-[8px] font-bold rounded leading-none">AR</span>
    )},
    { path: '/favoritos', label: 'Favoritos', icon: (
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    )},
    { path: '/cotizar', label: 'Cotizador', adminOnly: true, icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )},
    { path: '/empresa', label: 'Empresa', adminOnly: true, icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    )},
    { path: '/empresas', label: 'Mi Empresa', adminOnly: true, icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )},
    { path: '/adjudicaciones', label: 'Adjudicaciones', icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    )},
    { path: '/catalogo', label: 'Catálogo', adminOnly: true, icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )},
    { path: '/observatorio', label: 'Observatorio', icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    )},
    { path: '/stats', label: 'Stats' },
    { path: '/analisis', label: 'Análisis', adminOnly: true, icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )},
  ].filter(link => !link.adminOnly || isAdmin);

  // Secondary nav (in "More" dropdown on desktop)
  const secondaryLinks = [
    { path: '/perfil', label: 'Mi actividad' },
    { path: '/nodos', label: 'Nodos', adminOnly: true },
    { path: '/templates', label: 'Plantillas', adminOnly: true },
    { path: '/manual/all.html', label: 'Manual', external: true },
    { path: '/lab', label: 'Lab', adminOnly: true },
    { path: '/admin', label: 'Admin', adminOnly: true },
  ].filter(link => !link.adminOnly || isAdmin);

  // All links for mobile
  const allLinks = [...primaryLinks, ...secondaryLinks];

  // Fetch AI usage
  const [showAiDetail, setShowAiDetail] = useState(false);
  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const res = await axios.get('/api/cotizar-ai/ai-usage', { withCredentials: true });
        setAiUsage(res.data);
      } catch {
        // Auth required — set default
        setAiUsage({ today_calls: 0, today_tokens: 0, token_limit: 100000, status: 'unknown', providers: {} });
      }
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on outside click
  const aiRef = useRef(null);
  useEffect(() => {
    const handleClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
      if (aiRef.current && !aiRef.current.contains(e.target)) {
        setShowAiDetail(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch {}
    window.location.href = '/';
  };

  const aiStatusColor = aiUsage?.status === 'exhausted' ? 'bg-red-500'
    : aiUsage?.status === 'near_limit' ? 'bg-amber-500'
    : 'bg-emerald-500';

  const NavLink = ({ path, label, icon, external, onClick }) => {
    const cls = `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
      isActive(path) ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;
    if (external) return <a href={path} className={cls} onClick={onClick}>{icon}{label}</a>;
    return <Link to={path} className={cls} onClick={onClick}>{icon}{label}</Link>;
  };

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-50">
      <div className="container mx-auto px-3">
        <div className="flex items-center justify-between h-12">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1.5 shrink-0">
            <span className="text-lg font-bold tracking-tight text-white">LICITOMETRO</span>
            <span className="text-[9px] font-medium bg-emerald-500 text-white px-1 py-0.5 rounded leading-none">BETA</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-end">
            {primaryLinks.map(link => (
              <NavLink key={link.path} {...link} />
            ))}

            {/* More dropdown */}
            {secondaryLinks.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    moreMenuOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                  </svg>
                  Mas
                </button>
                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[160px] z-50">
                    {secondaryLinks.map(link => (
                      <NavLink key={link.path} {...link} onClick={() => setMoreMenuOpen(false)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI Usage indicator */}
            {aiUsage && (
              <div className="relative" ref={aiRef}>
                <button onClick={() => setShowAiDetail(!showAiDetail)}
                  className="flex items-center gap-1.5 px-2 py-1 ml-1 rounded-md bg-white/5 text-xs hover:bg-white/10 transition-colors">
                  <span className={`w-2 h-2 rounded-full ${aiStatusColor}`} />
                  <span className="text-slate-400 font-mono">
                    {aiUsage.today_tokens > 0
                      ? `${(aiUsage.today_tokens / 1000).toFixed(1)}K`
                      : aiUsage.today_calls}
                  </span>
                  <span className="text-slate-500">AI</span>
                </button>
                {showAiDetail && (
                  <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-3 min-w-[220px] z-[60]">
                    <p className="text-xs font-semibold text-white mb-2">Consumo AI hoy</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Tokens hoy</span>
                        <span className="text-white font-mono">{(aiUsage.today_tokens || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Llamadas</span>
                        <span className="text-white font-mono">{aiUsage.today_calls || 0}</span>
                      </div>
                      {aiUsage.rate_limited > 0 && (
                        <div className="bg-red-900/50 text-red-300 text-[10px] px-2 py-1 rounded">
                          {aiUsage.rate_limited} llamada(s) rechazadas por limite
                        </div>
                      )}
                      {Object.entries(aiUsage.providers || {}).map(([name, data]) => (
                        <div key={name} className="flex justify-between text-[10px]">
                          <span className="text-slate-400">{name}</span>
                          <span className="text-slate-300 font-mono">{(data.tokens || 0).toLocaleString()} tok</span>
                        </div>
                      ))}
                      <div className="pt-1.5 border-t border-slate-700 space-y-1">
                        <p className="text-[10px] font-semibold text-slate-400">Cuotas diarias</p>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Groq (llama-3.3-70b)</span>
                          <span className="text-slate-400">100K tok/dia</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-500">Cerebras (llama-3.1-8b)</span>
                          <span className="text-slate-400">fallback ilimitado</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="ml-1 p-1.5 rounded-md text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
              title="Cerrar sesion"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </nav>

          {/* Mobile: AI + hamburger */}
          <div className="lg:hidden flex items-center gap-2">
            {aiUsage && (
              <div className="flex items-center gap-1 text-xs"
                title={`IA: ${(aiUsage.today_tokens || 0).toLocaleString()} tokens`}>
                <span className={`w-2 h-2 rounded-full ${aiStatusColor}`} />
                <span className="text-slate-400 font-mono">
                  {aiUsage.today_tokens > 0 ? `${(aiUsage.today_tokens / 1000).toFixed(1)}K` : aiUsage.today_calls}
                </span>
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md hover:bg-white/10"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav className="lg:hidden pb-3 border-t border-white/10 pt-2">
            <ul className="space-y-0.5">
              {allLinks.map(link => (
                <li key={link.path}>
                  <NavLink {...link} onClick={() => setMobileMenuOpen(false)} />
                </li>
              ))}
              <li>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Cerrar sesion
                </button>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
