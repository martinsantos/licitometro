import React from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Licitacion } from '../types/licitacion';

export const getDaysUntilOpening = (openingDate: string | null | undefined): number | null => {
  if (!openingDate) return null;
  const opening = new Date(openingDate);
  if (isNaN(opening.getTime())) return null;
  return differenceInCalendarDays(opening, new Date());
};

export const isUrgentLic = (lic: Licitacion): boolean => {
  if (!lic.opening_date) return false;
  const opening = new Date(lic.opening_date);
  if (isNaN(opening.getTime())) return false;
  const days = differenceInCalendarDays(opening, new Date());
  return days >= 0 && days <= 7;
};

export const isCriticalRubro = (lic: Licitacion, criticalRubros: Set<string>): boolean => {
  return lic.category ? criticalRubros.has(lic.category) : false;
};

export const formatFechaScraping = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), 'dd/MM HH:mm', { locale: es });
  } catch {
    return null;
  }
};

export const getUrgencyColor = (days: number | null): string => {
  if (days === null) return 'bg-gray-100 text-gray-600';
  if (days < 0) return 'bg-red-100 text-red-700';
  if (days <= 3) return 'bg-orange-100 text-orange-700';
  if (days <= 7) return 'bg-yellow-100 text-yellow-700';
  return 'bg-emerald-100 text-emerald-700';
};

export const getShareUrl = (id: string): string => {
  return `${window.location.origin}/licitacion/${id}`;
};

export const shareViaEmail = (lic: Licitacion) => {
  const subject = encodeURIComponent(`Licitacion: ${lic.title}`);
  const body = encodeURIComponent(
    `Te comparto esta licitacion que puede interesarte:\n\n` +
    `${lic.title}\n` +
    `${lic.organization}\n` +
    `Apertura: ${lic.opening_date ? format(new Date(lic.opening_date), 'dd/MM/yyyy HH:mm', { locale: es }) : 'A confirmar'}\n\n` +
    `Ver mas: ${getShareUrl(lic.id)}`
  );
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
};

export const shareViaWhatsApp = (lic: Licitacion) => {
  const text = encodeURIComponent(
    `*${lic.title}*\n` +
    `${lic.organization}\n` +
    `Apertura: ${lic.opening_date ? format(new Date(lic.opening_date), 'dd/MM/yyyy HH:mm', { locale: es }) : 'A confirmar'}\n\n` +
    `${getShareUrl(lic.id)}`
  );
  window.open(`https://wa.me/?text=${text}`, '_blank');
};

export const copyLink = (id: string) => {
  navigator.clipboard.writeText(getShareUrl(id));
  alert('Link copiado al portapapeles');
};

export const highlightMatches = (text: string, query: string): React.ReactNode => {
  if (!query?.trim() || !text) return text;
  const tokens = query.trim().split(/\s+/).filter(t => t.length >= 2).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (tokens.length === 0) return text;
  const splitRegex = new RegExp(`(${tokens.join('|')})`, 'gi');
  const testRegex = new RegExp(`^(${tokens.join('|')})$`, 'i');
  const parts = text.split(splitRegex);
  return React.createElement(React.Fragment, null,
    ...parts.map((part, i) =>
      testRegex.test(part)
        ? React.createElement('mark', { key: i, className: 'bg-yellow-100 text-yellow-900 rounded px-0.5' }, part)
        : part
    )
  );
};
