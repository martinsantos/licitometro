import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useCotizarAPI, CotizarItem, CotizarBid } from '../../hooks/useCotizarAPI';

interface Licitacion {
  id: string;
  title: string;
  objeto?: string | null;
  organization?: string;
  opening_date?: string | null;
  budget?: number | null;
  items?: Array<{ description?: string; unit?: string; quantity?: number }>;
  workflow_state?: string;
}

interface Props {
  licitacion: Licitacion;
  onBidSaved?: (bid: CotizarBid) => void;
}

const IVA_OPTIONS = [
  { label: 'Exento', value: 0 },
  { label: '10.5%', value: 10.5 },
  { label: '21%', value: 21 },
  { label: '27%', value: 27 },
];

const UNIT_OPTIONS = ['u.', 'kg', 'm', 'm²', 'm³', 'hs', 'gl', 'l', 'tn', 'km'];

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
}

function emptyItem(): CotizarItem {
  return { descripcion: '', cantidad: 1, unidad: 'u.', precio_unitario: 0 };
}

type Phase = 'syncing' | 'loading' | 'ready' | 'error';

export default function OfertaEditor({ licitacion, onBidSaved }: Props) {
  const api = useCotizarAPI();
  const [phase, setPhase] = useState<Phase>('syncing');
  const [errorMsg, setErrorMsg] = useState('');
  const [tender, setTender] = useState<{ id: string } | null>(null);
  const [bid, setBid] = useState<CotizarBid | null>(null);
  const [items, setItems] = useState<CotizarItem[]>([emptyItem()]);
  const [ivaRate, setIvaRate] = useState(21);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount: sync licitacion with cotizar-api, then load or create bid
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const t = await api.syncLicitacion(licitacion);
        if (cancelled) return;
        setTender(t);
        setPhase('loading');

        const bids = await api.listBids(t.id);
        if (cancelled) return;

        let activeBid: CotizarBid;
        if (bids.length > 0) {
          activeBid = bids[bids.length - 1];
        } else {
          activeBid = await api.createBid(t.id);
        }

        if (cancelled) return;
        setBid(activeBid);
        setItems(activeBid.items?.length > 0 ? activeBid.items : [emptyItem()]);
        setIvaRate(activeBid.iva_rate ?? 21);
        setPhase('ready');
      } catch (e: unknown) {
        if (!cancelled) {
          setErrorMsg(e instanceof Error ? e.message : 'Error conectando con cotizar-api');
          setPhase('error');
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [licitacion.id]);

  // Computed totals (local, no API needed for display)
  const { subtotal, ivaAmount, total } = useMemo(() => {
    const sub = items.reduce((acc, it) => acc + (it.cantidad || 0) * (it.precio_unitario || 0), 0);
    const iva = sub * (ivaRate / 100);
    return { subtotal: sub, ivaAmount: iva, total: sub + iva };
  }, [items, ivaRate]);

  const handleItemChange = useCallback((idx: number, field: keyof CotizarItem, value: string | number) => {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }, []);

  const addItem = useCallback(() => setItems(prev => [...prev, emptyItem()]), []);

  const removeItem = useCallback((idx: number) => {
    setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }, []);

  const importFromPliego = useCallback(() => {
    const plicItems = (licitacion.items || []).map(it => ({
      descripcion: it.description || '',
      cantidad: it.quantity || 1,
      unidad: it.unit || 'u.',
      precio_unitario: 0,
    }));
    if (plicItems.length > 0) setItems(plicItems);
  }, [licitacion.items]);

  const doSave = useCallback(async (silent = false) => {
    if (!bid) return null;
    if (!silent) setSaving(true);
    try {
      const basePrice = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio_unitario || 0), 0);
      await api.updateBid(bid.id, {
        items,
        commercialOffer: { basePrice, taxRate: ivaRate },
      });
      const updated = await api.calculateBid(bid.id, {
        labor: basePrice, materials: 0, equipment: 0, overhead: 0, other: 0,
      });
      setBid(updated);
      setSavedAt(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
      onBidSaved?.(updated);
      return updated;
    } catch (e) {
      console.error('Error saving bid:', e);
      return null;
    } finally {
      if (!silent) setSaving(false);
    }
  }, [bid, items, ivaRate, onBidSaved]);

  // Auto-save debounce
  useEffect(() => {
    if (phase !== 'ready' || !bid) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(true), 2000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [items, ivaRate, phase, bid]);

  const handleGeneratePDF = useCallback(async () => {
    if (!bid) return;
    setGeneratingPDF(true);
    try {
      await doSave(true);
      const result = await api.generatePDF(bid.id);
      if (typeof result === 'string' && result.startsWith('http')) {
        window.open(result, '_blank');
      } else if (result instanceof Blob) {
        const url = URL.createObjectURL(result);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oferta-${licitacion.id}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setGeneratingPDF(false);
    }
  }, [bid, licitacion.id, doSave]);

  if (phase === 'syncing' || phase === 'loading') {
    return (
      <div className="flex items-center gap-3 py-8 text-gray-500 text-sm">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        {phase === 'syncing' ? 'Sincronizando con el cotizador…' : 'Cargando cotización…'}
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
        <strong>Error al conectar con cotizar-api:</strong> {errorMsg}
      </div>
    );
  }

  const hasPliegoItems = (licitacion.items || []).length > 0;
  const openingFormatted = licitacion.opening_date
    ? new Date(licitacion.opening_date).toLocaleDateString('es-AR')
    : 'N/A';

  return (
    <div className="space-y-6">
      {/* Bloque 1: Header read-only */}
      <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Organismo</span>
          <p className="text-gray-800 font-medium mt-0.5">{licitacion.organization || 'N/A'}</p>
        </div>
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Apertura</span>
          <p className="text-gray-800 font-medium mt-0.5">{openingFormatted}</p>
        </div>
        <div className="sm:col-span-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Objeto</span>
          <p className="text-gray-800 mt-0.5 line-clamp-2">{licitacion.objeto || licitacion.title}</p>
        </div>
        {licitacion.budget && (
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Presupuesto oficial</span>
            <p className="text-gray-600 mt-0.5">{formatARS(licitacion.budget)} <span className="text-xs text-gray-400">(referencia)</span></p>
          </div>
        )}
      </div>

      {/* Bloque 2: Tabla items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Items de la Oferta</h3>
          {hasPliegoItems && (
            <button
              onClick={importFromPliego}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors"
            >
              Importar ítems del pliego
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left py-2 pr-3 w-6">#</th>
                <th className="text-left py-2 pr-3">Descripción</th>
                <th className="text-right py-2 pr-3 w-20">Cant</th>
                <th className="text-left py-2 pr-3 w-24">Unidad</th>
                <th className="text-right py-2 pr-3 w-36">P.Unit (ARS)</th>
                <th className="text-right py-2 pr-3 w-32">Subtotal</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 group">
                  <td className="py-2 pr-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      value={item.descripcion}
                      onChange={e => handleItemChange(idx, 'descripcion', e.target.value)}
                      placeholder="Descripción del ítem"
                      className="w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 placeholder-gray-300 py-1"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.cantidad}
                      onChange={e => handleItemChange(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                      className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-1"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      list={`units-${idx}`}
                      value={item.unidad}
                      onChange={e => handleItemChange(idx, 'unidad', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-1"
                    />
                    <datalist id={`units-${idx}`}>
                      {UNIT_OPTIONS.map(u => <option key={u} value={u} />)}
                    </datalist>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={e => handleItemChange(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                      className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-1"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-700 font-medium whitespace-nowrap">
                    {formatARS((item.cantidad || 0) * (item.precio_unitario || 0))}
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => removeItem(idx)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-1 rounded"
                      title="Eliminar ítem"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addItem}
          className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <span className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold leading-none">+</span>
          Agregar ítem
        </button>
      </div>

      {/* Bloque 3: Totales + acciones */}
      <div className="flex flex-col sm:flex-row gap-6 sm:justify-between sm:items-start">
        {/* Totales */}
        <div className="sm:ml-auto min-w-[280px]">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium">{formatARS(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-gray-600">
                <span>IVA</span>
                <select
                  value={ivaRate}
                  onChange={e => setIvaRate(parseFloat(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {IVA_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <span className="font-medium">{formatARS(ivaAmount)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
              <span>TOTAL</span>
              <span className="text-lg">{formatARS(total)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => doSave()}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : '✓'}
              Guardar
            </button>
            <button
              onClick={handleGeneratePDF}
              disabled={generatingPDF || !bid}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {generatingPDF ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : '↓'}
              Generar PDF
            </button>
          </div>

          {savedAt && (
            <p className="text-xs text-gray-400 text-right mt-2">
              Guardado {savedAt}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
