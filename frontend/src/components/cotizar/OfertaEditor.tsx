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

interface TechnicalData {
  methodology: string;
  plazo: string;
  lugar: string;
  validez: string;
  notas: string;
}

interface CompanyData {
  nombre: string;
  cuit: string;
  email: string;
  telefono: string;
  domicilio: string;
}

const IVA_OPTIONS = [
  { label: 'Exento (0%)', value: 0 },
  { label: '10.5%', value: 10.5 },
  { label: '21%', value: 21 },
  { label: '27%', value: 27 },
];

const UNIT_OPTIONS = ['u.', 'kg', 'm', 'm²', 'm³', 'hs', 'gl', 'l', 'tn', 'km', 'mes', 'año'];

const STEPS = [
  { id: 1, label: 'Items', icon: '📋' },
  { id: 2, label: 'Propuesta', icon: '📝' },
  { id: 3, label: 'Empresa', icon: '🏢' },
  { id: 4, label: 'Resumen', icon: '✅' },
];

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}

function emptyItem(): CotizarItem {
  return { descripcion: '', cantidad: 1, unidad: 'u.', precio_unitario: 0 };
}

// Parse a number string tolerating both "." and "," as decimal separator
function parseNumber(raw: string): number {
  const clean = raw.trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

// Parse an integer string
function parseInteger(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

type Phase = 'syncing' | 'loading' | 'ready' | 'error';

// NumericInput that stores a raw string locally and only parses on blur
function NumericInput({
  value,
  onChange,
  integer = false,
  min = 0,
  placeholder = '0',
  className = '',
}: {
  value: number;
  onChange: (n: number) => void;
  integer?: boolean;
  min?: number;
  placeholder?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState(
    integer ? String(Math.round(value)) : (value === 0 ? '' : String(value))
  );
  const [focused, setFocused] = useState(false);

  // Sync when value changes externally (not while focused)
  useEffect(() => {
    if (!focused) {
      setRaw(integer ? String(Math.round(value)) : (value === 0 ? '' : String(value)));
    }
  }, [value, focused, integer]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    // Only allow digits, dot, comma, minus
    if (integer) {
      if (!/^\d*$/.test(v)) return;
    } else {
      if (!/^[\d.,]*$/.test(v)) return;
    }
    setRaw(v);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = integer ? parseInteger(raw) : parseNumber(raw);
    const clamped = Math.max(min, parsed);
    setRaw(integer ? String(clamped) : (clamped === 0 ? '' : String(clamped)));
    onChange(clamped);
  };

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={raw}
      placeholder={placeholder}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      className={className}
    />
  );
}

export default function OfertaEditor({ licitacion, onBidSaved }: Props) {
  const api = useCotizarAPI();
  const [phase, setPhase] = useState<Phase>('syncing');
  const [errorMsg, setErrorMsg] = useState('');
  const [bid, setBid] = useState<CotizarBid | null>(null);
  const [step, setStep] = useState(1);
  const [items, setItems] = useState<CotizarItem[]>([emptyItem()]);
  const [ivaRate, setIvaRate] = useState(21);
  const [techData, setTechData] = useState<TechnicalData>({
    methodology: '',
    plazo: '',
    lugar: '',
    validez: '30',
    notas: '',
  });
  const [companyData, setCompanyData] = useState<CompanyData>({
    nombre: '',
    cuit: '',
    email: '',
    telefono: '',
    domicilio: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount: sync + load/create bid
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const t = await api.syncLicitacion(licitacion);
        if (cancelled) return;
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
        if (activeBid.items?.length > 0) setItems(activeBid.items);
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
    const pItems = (licitacion.items || []).map(it => ({
      descripcion: it.description || '',
      cantidad: it.quantity || 1,
      unidad: it.unit || 'u.',
      precio_unitario: 0,
    }));
    if (pItems.length > 0) setItems(pItems);
  }, [licitacion.items]);

  const doSave = useCallback(async (silent = false) => {
    if (!bid) return null;
    if (!silent) setSaving(true);
    try {
      const basePrice = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio_unitario || 0), 0);
      await api.updateBid(bid.id, { items, commercialOffer: { basePrice, taxRate: ivaRate } });
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

  // Auto-save on items change
  useEffect(() => {
    if (phase !== 'ready' || !bid) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(true), 2500);
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

  const openingFormatted = licitacion.opening_date
    ? new Date(licitacion.opening_date).toLocaleDateString('es-AR')
    : 'N/A';
  const hasPliegoItems = (licitacion.items || []).length > 0;

  return (
    <div className="space-y-6">
      {/* Licitacion header */}
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
        {licitacion.budget ? (
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Presupuesto oficial</span>
            <p className="text-gray-600 mt-0.5">{formatARS(licitacion.budget)} <span className="text-xs text-gray-400">(referencia)</span></p>
          </div>
        ) : null}
      </div>

      {/* Step navigator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <button
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                step === s.id
                  ? 'bg-blue-600 text-white'
                  : step > s.id
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{step > s.id ? '✓' : s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${step > s.id ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Items */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
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

          {/* Mobile: card per item */}
          <div className="block sm:hidden space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">ÍTEM {idx + 1}</span>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-xs">
                      Eliminar
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
                  <input
                    type="text"
                    value={item.descripcion}
                    onChange={e => handleItemChange(idx, 'descripcion', e.target.value)}
                    placeholder="Descripción del ítem"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Cantidad</label>
                    <NumericInput
                      value={item.cantidad}
                      onChange={v => handleItemChange(idx, 'cantidad', v)}
                      integer
                      min={1}
                      placeholder="1"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Unidad</label>
                    <input
                      list={`units-m-${idx}`}
                      value={item.unidad}
                      onChange={e => handleItemChange(idx, 'unidad', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <datalist id={`units-m-${idx}`}>
                      {UNIT_OPTIONS.map(u => <option key={u} value={u} />)}
                    </datalist>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Precio unitario (ARS)</label>
                  <NumericInput
                    value={item.precio_unitario}
                    onChange={v => handleItemChange(idx, 'precio_unitario', v)}
                    min={0}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-gray-800">
                    {formatARS((item.cantidad || 0) * (item.precio_unitario || 0))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 w-6">#</th>
                  <th className="text-left py-2 pr-3">Descripción</th>
                  <th className="text-right py-2 pr-3 w-24">Cantidad</th>
                  <th className="text-left py-2 pr-3 w-24">Unidad</th>
                  <th className="text-right py-2 pr-3 w-40">P.Unit (ARS)</th>
                  <th className="text-right py-2 pr-3 w-36">Subtotal</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50/30 group">
                    <td className="py-2.5 pr-2 text-gray-400 text-xs font-mono">{idx + 1}</td>
                    <td className="py-2.5 pr-3">
                      <input
                        type="text"
                        value={item.descripcion}
                        onChange={e => handleItemChange(idx, 'descripcion', e.target.value)}
                        placeholder="Descripción del ítem…"
                        className="w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 placeholder-gray-300 py-0.5"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <NumericInput
                        value={item.cantidad}
                        onChange={v => handleItemChange(idx, 'cantidad', v)}
                        integer
                        min={1}
                        placeholder="1"
                        className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-0.5"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        list={`units-${idx}`}
                        value={item.unidad}
                        onChange={e => handleItemChange(idx, 'unidad', e.target.value)}
                        className="w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-0.5"
                      />
                      <datalist id={`units-${idx}`}>
                        {UNIT_OPTIONS.map(u => <option key={u} value={u} />)}
                      </datalist>
                    </td>
                    <td className="py-2.5 pr-3">
                      <NumericInput
                        value={item.precio_unitario}
                        onChange={v => handleItemChange(idx, 'precio_unitario', v)}
                        min={0}
                        placeholder="0.00"
                        className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-0.5"
                      />
                    </td>
                    <td className="py-2.5 pr-3 text-right text-gray-700 font-medium whitespace-nowrap">
                      {formatARS((item.cantidad || 0) * (item.precio_unitario || 0))}
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 disabled:opacity-0 transition-all p-1 rounded text-xs"
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
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium"
          >
            <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold leading-none">+</span>
            Agregar ítem
          </button>

          {/* Subtotals preview */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm mt-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal sin IVA</span>
              <span className="font-medium tabular-nums">{formatARS(subtotal)}</span>
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
              <span className="font-medium tabular-nums">{formatARS(ivaAmount)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
              <span>TOTAL</span>
              <span className="text-lg tabular-nums">{formatARS(total)}</span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <div>
              {savedAt && <p className="text-xs text-gray-400">Guardado {savedAt}</p>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => doSave()}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl disabled:opacity-60 transition-colors"
              >
                {saving ? <div className="w-4 h-4 border-2 border-gray-400/40 border-t-gray-600 rounded-full animate-spin" /> : '💾'}
                Guardar
              </button>
              <button
                onClick={() => { doSave(true); setStep(2); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Siguiente
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Propuesta Técnica */}
      {step === 2 && (
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-800">Propuesta Técnica</h3>
          <p className="text-sm text-gray-500">Completá los datos técnicos de tu oferta. Estos campos aparecerán en el documento PDF.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Metodología / Descripción del servicio
              </label>
              <textarea
                value={techData.methodology}
                onChange={e => setTechData(p => ({ ...p, methodology: e.target.value }))}
                placeholder="Describí cómo vas a ejecutar el contrato, qué incluye la propuesta…"
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Plazo de ejecución
                </label>
                <input
                  type="text"
                  value={techData.plazo}
                  onChange={e => setTechData(p => ({ ...p, plazo: e.target.value }))}
                  placeholder="Ej: 30 días hábiles"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Lugar de entrega / prestación
                </label>
                <input
                  type="text"
                  value={techData.lugar}
                  onChange={e => setTechData(p => ({ ...p, lugar: e.target.value }))}
                  placeholder="Ej: Sede del organismo, Mendoza"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Validez de la oferta (días)
                </label>
                <NumericInput
                  value={parseInt(techData.validez) || 30}
                  onChange={v => setTechData(p => ({ ...p, validez: String(v) }))}
                  integer
                  min={1}
                  placeholder="30"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Notas adicionales
              </label>
              <textarea
                value={techData.notas}
                onChange={e => setTechData(p => ({ ...p, notas: e.target.value }))}
                placeholder="Condiciones especiales, garantías, observaciones…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"
            >
              <span>←</span> Anterior
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Siguiente <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Empresa */}
      {step === 3 && (
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-800">Datos de la Empresa</h3>
          <p className="text-sm text-gray-500">Estos datos identifican al oferente en el documento oficial.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Razón social / Nombre</label>
              <input
                type="text"
                value={companyData.nombre}
                onChange={e => setCompanyData(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Nombre de la empresa o persona"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">CUIT</label>
              <input
                type="text"
                value={companyData.cuit}
                onChange={e => setCompanyData(p => ({ ...p, cuit: e.target.value }))}
                placeholder="20-12345678-9"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={companyData.email}
                onChange={e => setCompanyData(p => ({ ...p, email: e.target.value }))}
                placeholder="contacto@empresa.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono</label>
              <input
                type="tel"
                value={companyData.telefono}
                onChange={e => setCompanyData(p => ({ ...p, telefono: e.target.value }))}
                placeholder="+54 261 4000000"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Domicilio legal</label>
              <input
                type="text"
                value={companyData.domicilio}
                onChange={e => setCompanyData(p => ({ ...p, domicilio: e.target.value }))}
                placeholder="Calle, Número, Ciudad"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"
            >
              <span>←</span> Anterior
            </button>
            <button
              onClick={() => { doSave(true); setStep(4); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Ver resumen <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Resumen */}
      {step === 4 && (
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-800">Resumen de la Oferta</h3>

          {/* Items summary */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Items ({items.length})</span>
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <div key={idx} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-400 text-xs mr-2">#{idx + 1}</span>
                    <span className="text-gray-800">{item.descripcion || <em className="text-gray-400">Sin descripción</em>}</span>
                    <span className="text-gray-400 text-xs ml-2">{item.cantidad} {item.unidad}</span>
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-medium text-gray-800 tabular-nums">
                      {formatARS((item.cantidad || 0) * (item.precio_unitario || 0))}
                    </div>
                    <div className="text-xs text-gray-400 tabular-nums">
                      {formatARS(item.precio_unitario || 0)}/u.
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 space-y-1">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatARS(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>IVA ({ivaRate}%)</span>
                <span className="tabular-nums">{formatARS(ivaAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200">
                <span>TOTAL</span>
                <span className="tabular-nums">{formatARS(total)}</span>
              </div>
            </div>
          </div>

          {/* Tech summary */}
          {(techData.methodology || techData.plazo || techData.lugar) && (
            <div className="border border-gray-200 rounded-xl p-4 text-sm space-y-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Propuesta Técnica</span>
              {techData.methodology && (
                <p className="text-gray-700 line-clamp-3">{techData.methodology}</p>
              )}
              <div className="flex gap-6 text-gray-500 text-xs flex-wrap">
                {techData.plazo && <span>⏱ Plazo: {techData.plazo}</span>}
                {techData.lugar && <span>📍 Lugar: {techData.lugar}</span>}
                {techData.validez && <span>📅 Validez: {techData.validez} días</span>}
              </div>
            </div>
          )}

          {/* Company summary */}
          {companyData.nombre && (
            <div className="border border-gray-200 rounded-xl p-4 text-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Empresa</span>
              <p className="font-medium text-gray-800">{companyData.nombre}</p>
              <div className="text-gray-500 text-xs flex gap-4 flex-wrap mt-1">
                {companyData.cuit && <span>CUIT: {companyData.cuit}</span>}
                {companyData.email && <span>{companyData.email}</span>}
                {companyData.telefono && <span>{companyData.telefono}</span>}
              </div>
            </div>
          )}

          {savedAt && (
            <p className="text-xs text-gray-400">Guardado automáticamente {savedAt}</p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => setStep(3)}
              className="flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 border border-gray-200 transition-colors"
            >
              <span>←</span> Editar
            </button>
            <button
              onClick={() => doSave()}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '💾'}
              Guardar oferta
            </button>
            <button
              onClick={handleGeneratePDF}
              disabled={generatingPDF || !bid}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors"
            >
              {generatingPDF ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '📄'}
              Generar PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
