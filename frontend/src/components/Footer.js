import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 py-6 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-slate-500 text-sm">
            Licitómetro &mdash; Compras públicas de Mendoza
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>Datos abiertos</span>
            <span className="text-slate-300">|</span>
            <a
              href="https://comprar.mendoza.gov.ar"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-700 transition-colors"
            >
              COMPR.AR
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
