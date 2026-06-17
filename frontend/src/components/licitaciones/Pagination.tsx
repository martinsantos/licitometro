import React from 'react';
import type { Paginacion } from '../../types/licitacion';

interface PaginationProps {
  paginacion: Paginacion;
  pagina: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ paginacion, pagina, onPageChange }) => {
  if (paginacion.total_paginas <= 1) return null;

  const pageNumbers: number[] = [];
  const total = paginacion.total_paginas;
  const count = Math.min(5, total);

  for (let i = 0; i < count; i++) {
    let pageNum: number;
    if (total <= 5) {
      pageNum = i + 1;
    } else if (pagina <= 3) {
      pageNum = i + 1;
    } else if (pagina >= total - 2) {
      pageNum = total - 4 + i;
    } else {
      pageNum = pagina - 2 + i;
    }
    pageNumbers.push(pageNum);
  }

  return (
    <div className="lic-toolbar-surface mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4">
      <div className="text-sm font-medium text-gray-500">
        Pagina <span className="font-bold text-gray-900">{pagina}</span> de <span className="font-bold text-gray-900">{total}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="lic-control-transition p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => onPageChange(Math.max(pagina - 1, 1))}
          disabled={pagina === 1}
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-1">
          {pageNumbers.map((num) => (
            <button
              key={num}
              className={`lic-control-transition w-10 h-10 rounded-lg text-sm font-black ${
                pagina === num
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
              onClick={() => onPageChange(num)}
            >
              {num}
            </button>
          ))}
        </div>

        <button
          className="lic-control-transition p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => onPageChange(Math.min(pagina + 1, total))}
          disabled={pagina === total}
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default React.memo(Pagination);
