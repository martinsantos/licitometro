import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  useCotizarAPI, CotizarItem, AIAnalysisResult, BudgetHints, Antecedente,
  PliegoInfo, MarcoLegal, PriceIntelligence, MongoCotizacion, Documento,
} from '../../hooks/useCotizarAPI';
import DocumentRepository from './DocumentRepository';
import HunterPanel from '../hunter/HunterPanel';
import NotaCotizacion from './NotaCotizacion';
import OfertaSections, { PliegoDoc } from './OfertaSections';
import { OfferSection } from '../../hooks/useCotizarAPI';

interface Licitacion {
  id: string;
  title: string;
  objeto?: string | null;
  organization?: string;
  opening_date?: string | null;
  budget?: number | null;
  items?: Array<Record<string, unknown>>;
  workflow_state?: string;
}

interface Props {
  licitacion: Licitacion;
  onSaved?: () => void;
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
  { id: 4, label: 'Marco Legal', icon: '⚖️' },
  { id: 5, label: 'Análisis IA', icon: '🤖' },
  { id: 6, label: 'Secciones', icon: '📑' },
];

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}

function emptyItem(): CotizarItem {
  return { descripcion: '', cantidad: 1, unidad: 'u.', precio_unitario: 0 };
}

function parseNumber(raw: string): number {
  const clean = raw.trim().replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseInteger(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

// NumericInput that stores a raw string locally and only parses on blur
function NumericInput({
  value, onChange, integer = false, min = 0, placeholder = '0', className = '',
}: {
  value: number; onChange: (n: number) => void; integer?: boolean; min?: number; placeholder?: string; className?: string;
}) {
  const [raw, setRaw] = useState(integer ? String(Math.round(value)) : (value === 0 ? '' : String(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(integer ? String(Math.round(value)) : (value === 0 ? '' : String(value)));
  }, [value, focused, integer]);

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={raw}
      placeholder={placeholder}
      onChange={e => {
        const v = e.target.value;
        if (integer ? !/^\d*$/.test(v) : !/^[\d.,]*$/.test(v)) return;
        setRaw(v);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const parsed = integer ? parseInteger(raw) : parseNumber(raw);
        const clamped = Math.max(min, parsed);
        setRaw(integer ? String(clamped) : (clamped === 0 ? '' : String(clamped)));
        onChange(clamped);
      }}
      className={className}
    />
  );
}

// Error banner with retry
function ErrorBanner({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3 text-sm">
      <span className="text-red-500 shrink-0">⚠</span>
      <span className="flex-1 text-red-700">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-red-600 hover:text-red-800 text-xs font-medium underline">
          Reintentar
        </button>
      )}
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600 text-xs">✕</button>
    </div>
  );
}

export default function OfertaEditor({ licitacion, onSaved }: Props) {
  const api = useCotizarAPI();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [step, setStep] = useState(() => {
    const saved = sessionStorage.getItem(`cotizar_step_${licitacion.id}`);
    return saved ? parseInt(saved, 10) : 1;
  });
  const [items, setItems] = useState<CotizarItem[]>([emptyItem()]);
  const [ivaRate, setIvaRate] = useState(21);
  const [techData, setTechData] = useState<TechnicalData>({ methodology: '', plazo: '', lugar: '', validez: '30', notas: '' });
  const [companyData, setCompanyData] = useState<CompanyData>({ nombre: '', cuit: '', email: '', telefono: '', domicilio: '' });
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [budgetHints, setBudgetHints] = useState<BudgetHints | null>(null);
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [loadingHints, setLoadingHints] = useState(false);
  const [hunterOpen, setHunterOpen] = useState(false);
  const [hunterTab, setHunterTab] = useState<'pliego' | 'inteligencia' | 'antecedentes'>('pliego');
  const [showPriceTools, setShowPriceTools] = useState(false);
  const [priceInstruction, setPriceInstruction] = useState('');
  const [adjustingPrices, setAdjustingPrices] = useState(false);
  const [contractMonths, setContractMonths] = useState(12);
  const [suggestingPropuesta, setSuggestingPropuesta] = useState(false);
  const [antecedentes, setAntecedentes] = useState<Antecedente[]>([]);
  const [loadingAntecedentes, setLoadingAntecedentes] = useState(false);
  const [showAntecedentes, setShowAntecedentes] = useState(false);
  const [vinculados, setVinculados] = useState<string[]>([]);
  const [companyProfiles, setCompanyProfiles] = useState<CompanyData[]>([]);
  const [selectedProfile, setSelectedProfile] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);
  const [pliegoInfo, setPliegoInfo] = useState<PliegoInfo | null>(null);
  const [marcoLegal, setMarcoLegal] = useState<MarcoLegal | null>(null);
  const [loadingMarcoLegal, setLoadingMarcoLegal] = useState(false);
  const [marcoLegalChecks, setMarcoLegalChecks] = useState<Record<string, boolean>>({});
  const [priceIntelligence, setPriceIntelligence] = useState<PriceIntelligence | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showDocRepo, setShowDocRepo] = useState(false);
  const [companyDocs, setCompanyDocs] = useState<Documento[]>([]);
  const [companyAntecedentes, setCompanyAntecedentes] = useState<Antecedente[]>([]);
  const [loadingCompanyAntecedentes, setLoadingCompanyAntecedentes] = useState(false);
  const [showCompanyAntecedentes, setShowCompanyAntecedentes] = useState(false);
  const [companyAntSectors, setCompanyAntSectors] = useState<Array<{ sector: string; count: number }>>([]);
  const [selectedCompanyAntSector, setSelectedCompanyAntSector] = useState<string>('');
  const [antecedentesTotal, setAntecedentesTotal] = useState(0);
  const [companyAntTotal, setCompanyAntTotal] = useState(0);
  const [vinculadosCache, setVinculadosCache] = useState<Record<string, Antecedente>>({});
  const [offerSections, setOfferSections] = useState<OfferSection[]>([]);
  const [pliegoDocuments, setPliegoDocuments] = useState<PliegoDoc[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{id: string; name: string; slug: string; template_type: string; description: string; sections_count: number}>>([]);
  const offerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist current step in sessionStorage
  useEffect(() => {
    sessionStorage.setItem(`cotizar_step_${licitacion.id}`, String(step));
  }, [step, licitacion.id]);

  // Resolve vinculado IDs to full antecedente objects
  const resolveAntecedente = useCallback((id: string): Antecedente | undefined => {
    return antecedentes.find(a => a.id === id)
      || companyAntecedentes.find(a => a.id === id)
      || vinculadosCache[id];
  }, [antecedentes, companyAntecedentes, vinculadosCache]);

  // Auto-fetch missing vinculado details
  const vinculadosCacheRef = useRef(vinculadosCache);
  vinculadosCacheRef.current = vinculadosCache;
  useEffect(() => {
    const cache = vinculadosCacheRef.current;
    const allLoaded = [...antecedentes, ...companyAntecedentes];
    const missing = vinculados.filter(id =>
      !allLoaded.find(a => a.id === id) && !cache[id]
    );
    if (missing.length === 0) return;
    api.getAntecedentesByIds(missing).then(results => {
      setVinculadosCache(prev => {
        const next = { ...prev };
        results.forEach(r => { next[r.id] = r; });
        return next;
      });
    }).catch(() => {});
  }, [vinculados, antecedentes.length, companyAntecedentes.length]);

  // Normalize licitacion items
  const normalizeLicItems = useCallback((rawItems: Array<Record<string, unknown>>): CotizarItem[] => {
    return rawItems
      .filter(it => it.descripcion || it.description)
      .map(it => {
        // Parse cantidad: can be number, "1,00", "1,00 UNIDAD/S", etc.
        let cantidadRaw = it.cantidad || it.quantity || 1;
        let cantidad = 1;
        let unitFromCantidad = '';
        if (typeof cantidadRaw === 'string') {
          // Extract number part: "1,00 UNIDAD/S" → "1,00"
          const numMatch = cantidadRaw.match(/^[\d.,]+/);
          if (numMatch) {
            cantidad = parseFloat(numMatch[0].replace(/\./g, '').replace(',', '.')) || 1;
          }
          // Extract unit part: "1,00 UNIDAD/S" → "UNIDAD/S"
          const unitPart = cantidadRaw.replace(/^[\d.,\s]+/, '').trim();
          if (unitPart) unitFromCantidad = unitPart;
        } else {
          cantidad = Number(cantidadRaw) || 1;
        }

        // Parse unidad: from explicit field, from cantidad suffix, or from descripcion
        let unidad = String(it.unidad || it.unidad_medida || it.unit || '').trim();
        if (!unidad && unitFromCantidad) {
          unidad = unitFromCantidad;
        }
        if (!unidad) {
          // Try to extract from descripcion: "Presentación: UNIDAD"
          const desc = String(it.descripcion || it.description || '');
          const presMatch = desc.match(/Presentaci[oó]n:\s*(\S+)/i);
          if (presMatch) unidad = presMatch[1];
        }
        if (!unidad) unidad = 'u.';

        // Clean up descripcion: remove "Presentación: X  Solicitado: Y" suffix
        let descripcion = String(it.descripcion || it.description || '');
        descripcion = descripcion.replace(/\s+Presentaci[oó]n:\s*.+$/i, '').trim();

        return {
          descripcion,
          cantidad,
          unidad,
          precio_unitario: Number(it.precio_unitario || 0),
        };
      });
  }, []);

  // Mount: load from MongoDB or auto-import
  useEffect(() => {
    let cancelled = false;
    async function init() {
      let hasSavedSections = false;
      try {
        setPhase('loading');
        const mongoCot = await api.getCotizacionFromMongo(licitacion.id);
        if (cancelled) return;

        if (mongoCot && mongoCot.items?.length > 0) {
          setItems(mongoCot.items);
          setIvaRate(mongoCot.iva_rate ?? 21);
          if (mongoCot.tech_data) {
            setTechData(prev => ({
              ...prev,
              methodology: mongoCot.tech_data.methodology || prev.methodology,
              plazo: mongoCot.tech_data.plazo || prev.plazo,
              lugar: mongoCot.tech_data.lugar || prev.lugar,
              validez: mongoCot.tech_data.validez || prev.validez,
              notas: mongoCot.tech_data.notas || prev.notas,
            }));
          }
          if (mongoCot.company_data && Object.keys(mongoCot.company_data).length > 0 && (mongoCot.company_data as any).nombre) {
            setCompanyData(prev => ({ ...prev, ...mongoCot.company_data as unknown as CompanyData }));
          } else {
            // Load from company profile if cotizacion has no company data
            try {
              const profile = await api.getCompanyProfile();
              if (profile && profile.nombre) {
                setCompanyData({ nombre: profile.nombre, cuit: profile.cuit, email: profile.email, telefono: profile.telefono, domicilio: profile.domicilio });
              }
            } catch { /* silent */ }
          }
          if (mongoCot.analysis) setAnalysis(mongoCot.analysis);
          if (mongoCot.pliego_info) setPliegoInfo(mongoCot.pliego_info);
          if (mongoCot.marco_legal) setMarcoLegal(mongoCot.marco_legal);
          if (mongoCot.antecedentes_vinculados) setVinculados(mongoCot.antecedentes_vinculados);
          if (mongoCot.price_intelligence) setPriceIntelligence(mongoCot.price_intelligence);
          if ((mongoCot as unknown as Record<string, unknown>).budget_override != null) setBudgetOverride((mongoCot as unknown as Record<string, unknown>).budget_override as number);
          const savedSections = (mongoCot as unknown as Record<string, unknown>).offer_sections as OfferSection[] | undefined;
          if (savedSections && savedSections.length > 0) {
            setOfferSections(savedSections);
            setShowTemplateSelector(false);
            hasSavedSections = true;
          }
          const savedPliegos = (mongoCot as unknown as Record<string, unknown>).pliego_documents as PliegoDoc[] | undefined;
          if (savedPliegos && savedPliegos.length > 0) setPliegoDocuments(savedPliegos);
          const savedChecks = (mongoCot as unknown as Record<string, unknown>).marco_legal_checks as Record<string, boolean> | undefined;
          if (savedChecks) setMarcoLegalChecks(savedChecks);
        } else if (licitacion.items && licitacion.items.length > 0) {
          const normalized = normalizeLicItems(licitacion.items as Array<Record<string, unknown>>);
          if (normalized.length > 0) setItems(normalized);
        }

        // Always ensure company data is loaded from profile if empty
        if (!companyData.nombre) {
          try {
            const profile = await api.getCompanyProfile();
            if (profile && profile.nombre) {
              setCompanyData({ nombre: profile.nombre, cuit: profile.cuit, email: profile.email, telefono: profile.telefono, domicilio: profile.domicilio });
            }
          } catch { /* silent */ }
        }

        if (cancelled) return;
        setPhase('ready');

        // Fetch enrichments in background
        api.getBudgetHints(licitacion.id).then(h => { if (!cancelled) setBudgetHints(h); }).catch(() => {});
        api.extractPliegoInfo(licitacion.id).then(p => {
          if (cancelled || p.error) return;
          setPliegoInfo(p);
          // Auto-import items from pliego analysis if editor is empty
          if (p.items && p.items.length > 0) {
            setItems(prev => {
              const hasRealItems = prev.some(it => it.descripcion.trim() !== '');
              if (!hasRealItems) {
                return p.items!.map(it => ({
                  descripcion: it.descripcion || '',
                  cantidad: it.cantidad || 1,
                  unidad: it.unidad || 'u.',
                  precio_unitario: 0,
                }));
              }
              return prev;
            });
          }
        }).catch(() => {});
        api.listDocuments().then(d => { if (!cancelled) setCompanyDocs(d); }).catch(() => {});
        // Load templates list for selector
        api.listTemplates().then(t => { if (!cancelled) setAvailableTemplates(t); }).catch(() => {});
        // If no sections saved/loaded, show template selector
        if (!hasSavedSections) {
          setShowTemplateSelector(true);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          if (licitacion.items && licitacion.items.length > 0) {
            const normalized = normalizeLicItems(licitacion.items as Array<Record<string, unknown>>);
            if (normalized.length > 0) setItems(normalized);
          }
          setErrorMsg(e instanceof Error ? e.message : 'Error al cargar');
          setPhase('ready');
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
    setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  }, []);

  const addItem = useCallback(() => setItems(prev => [...prev, emptyItem()]), []);
  const removeItem = useCallback((idx: number) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev), []);

  const importFromPliego = useCallback(() => {
    if (!licitacion.items?.length) return;
    const normalized = normalizeLicItems(licitacion.items as Array<Record<string, unknown>>);
    if (normalized.length > 0) setItems(normalized);
  }, [licitacion.items, normalizeLicItems]);

  const doSave = useCallback(async (silent = false) => {
    if (!silent) setSaving(true);
    try {
      const sub = items.reduce((s, i) => s + (i.cantidad || 0) * (i.precio_unitario || 0), 0);
      const iva = sub * (ivaRate / 100);
      const tot = sub + iva;

      await api.saveCotizacionToMongo(licitacion.id, {
        licitacion_title: licitacion.title,
        licitacion_objeto: licitacion.objeto,
        organization: licitacion.organization,
        items,
        iva_rate: ivaRate,
        subtotal: sub,
        iva_amount: iva,
        total: tot,
        tech_data: techData as unknown as Record<string, string>,
        company_data: companyData as unknown as Record<string, string>,
        analysis,
        pliego_info: pliegoInfo,
        marco_legal: marcoLegal,
        antecedentes_vinculados: vinculados,
        price_intelligence: priceIntelligence,
        budget_override: budgetOverride,
        offer_sections: offerSections,
        pliego_documents: pliegoDocuments,
        marco_legal_checks: marcoLegalChecks,
        status: 'borrador',
      });

      setSavedAt(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
      setErrorMsg('');
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      if (silent) {
        setAutoSaveFailed(true);
        setTimeout(() => setAutoSaveFailed(false), 8000);
      } else {
        setErrorMsg(msg);
      }
    } finally {
      if (!silent) setSaving(false);
    }
  }, [items, ivaRate, techData, companyData, analysis, pliegoInfo, marcoLegal, marcoLegalChecks, vinculados, priceIntelligence, budgetOverride, offerSections, pliegoDocuments, licitacion, onSaved]);

  // Auto-save debounced
  useEffect(() => {
    if (phase !== 'ready') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(true), 2500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [items, ivaRate, techData, companyData, analysis, pliegoInfo, marcoLegal, marcoLegalChecks, vinculados, priceIntelligence, budgetOverride, offerSections, pliegoDocuments, phase]);

  // Load company profiles from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cotizar_empresas');
      if (saved) {
        const profiles = JSON.parse(saved) as CompanyData[];
        setCompanyProfiles(profiles);
        if (profiles.length > 0 && !companyData.nombre) {
          setCompanyData(profiles[profiles.length - 1]);
          setSelectedProfile(profiles.length - 1);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const handleSuggestPropuesta = useCallback(async () => {
    setSuggestingPropuesta(true);
    try {
      const result = await api.suggestPropuesta(licitacion.id);
      if (!result.error) {
        setTechData(prev => ({
          ...prev,
          methodology: result.metodologia || prev.methodology,
          plazo: result.plazo || prev.plazo,
          lugar: result.lugar || prev.lugar,
          notas: result.notas || prev.notas,
        }));
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al sugerir propuesta');
    } finally {
      setSuggestingPropuesta(false);
    }
  }, [licitacion.id]);

  const handleLoadAntecedentes = useCallback(async (loadMore = false) => {
    if (!loadMore && antecedentes.length > 0) { setShowAntecedentes(p => !p); return; }
    setLoadingAntecedentes(true);
    setShowAntecedentes(true);
    try {
      const skip = loadMore ? antecedentes.length : 0;
      const { results, total } = await api.searchAntecedentes(licitacion.id, skip);
      setAntecedentes(prev => loadMore ? [...prev, ...results] : results);
      setAntecedentesTotal(total);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error buscando antecedentes');
    } finally {
      setLoadingAntecedentes(false);
    }
  }, [licitacion.id, antecedentes.length]);

  const handleLoadCompanyAntecedentes = useCallback(async (sector?: string, loadMore = false) => {
    if (!sector && !loadMore && companyAntecedentes.length > 0 && !selectedCompanyAntSector) {
      setShowCompanyAntecedentes(p => !p);
      return;
    }
    setLoadingCompanyAntecedentes(true);
    setShowCompanyAntecedentes(true);
    try {
      const skip = loadMore ? companyAntecedentes.length : 0;
      const [response, sectors] = await Promise.all([
        api.searchCompanyAntecedentes(licitacion.id, undefined, sector || undefined, skip),
        companyAntSectors.length ? Promise.resolve(companyAntSectors) : api.getCompanyAntecedenteSectors(),
      ]);
      setCompanyAntecedentes(prev => loadMore ? [...prev, ...response.results] : response.results);
      setCompanyAntTotal(response.total);
      if (!companyAntSectors.length && sectors.length) setCompanyAntSectors(sectors);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error buscando antecedentes empresa');
    } finally {
      setLoadingCompanyAntecedentes(false);
    }
  }, [licitacion.id, companyAntecedentes.length, selectedCompanyAntSector, companyAntSectors.length]);

  const handleSectorFilter = useCallback(async (sector: string) => {
    const newSector = sector === selectedCompanyAntSector ? '' : sector;
    setSelectedCompanyAntSector(newSector);
    setLoadingCompanyAntecedentes(true);
    try {
      const response = await api.searchCompanyAntecedentes(licitacion.id, undefined, newSector || undefined);
      setCompanyAntecedentes(response.results);
      setCompanyAntTotal(response.total);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoadingCompanyAntecedentes(false);
    }
  }, [licitacion.id, selectedCompanyAntSector]);

  const handleVincular = useCallback(async (antId: string) => {
    try {
      await api.vincularAntecedente(licitacion.id, antId);
      setVinculados(prev => prev.includes(antId) ? prev : [...prev, antId]);
    } catch { /* silent */ }
  }, [licitacion.id]);

  const handleDesvincular = useCallback(async (antId: string) => {
    try {
      await api.desvincularAntecedente(licitacion.id, antId);
      setVinculados(prev => prev.filter(id => id !== antId));
    } catch { /* silent */ }
  }, [licitacion.id]);

  const handleImportAIItems = useCallback(async () => {
    if (budgetHints?.items_from_pliego?.length) {
      setItems(budgetHints.items_from_pliego.map(it => ({
        descripcion: it.descripcion, cantidad: it.cantidad, unidad: it.unidad, precio_unitario: 0,
      })));
    } else {
      setLoadingHints(true);
      try {
        const hints = await api.getBudgetHints(licitacion.id);
        setBudgetHints(hints);
        if (hints.items_from_pliego?.length) {
          setItems(hints.items_from_pliego.map(it => ({
            descripcion: it.descripcion, cantidad: it.cantidad, unidad: it.unidad, precio_unitario: 0,
          })));
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Error cargando items');
      } finally {
        setLoadingHints(false);
      }
    }
  }, [licitacion.id, budgetHints]);

  const handleApplyTemplate = useCallback(async (slug: string) => {
    try {
      const t = await api.getDefaultTemplate(slug);
      if (t.sections) {
        setOfferSections(t.sections.map(s => ({
          slug: s.slug,
          title: s.name,
          content: s.default_content || '',
          generated_by: 'template' as const,
          order: s.order,
          required: s.required,
        })));
        setTemplateName(t.name);
        setShowTemplateSelector(false);
      }
    } catch { /* silent */ }
  }, []);

  const handleLoadMarcoLegal = useCallback(async () => {
    setLoadingMarcoLegal(true);
    try {
      const effectiveBudget = budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? null;
      const result = await api.extractMarcoLegal(licitacion.id, effectiveBudget);
      if (!result.error) setMarcoLegal(result);
      else setErrorMsg(result.error);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error al extraer marco legal');
    } finally {
      setLoadingMarcoLegal(false);
    }
  }, [licitacion.id, budgetOverride, budgetHints, licitacion.budget]);

  const handleLoadPriceIntelligence = useCallback(async () => {
    setLoadingPrices(true);
    try {
      const result = await api.getPriceIntelligence(licitacion.id);
      if (!result.error) setPriceIntelligence(result);
    } catch { /* silent */ }
    finally { setLoadingPrices(false); }
  }, [licitacion.id]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setAnalyzeError('');
    try {
      const effectiveBudget = budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? null;
      const result = await api.analyzeBidAI(licitacion.id, {
        items, total, metodologia: techData.methodology, empresa_nombre: companyData.nombre,
        budget_override: effectiveBudget,
      });
      setAnalysis(result);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Error al analizar');
    } finally {
      setAnalyzing(false);
    }
  }, [licitacion.id, items, total, techData.methodology, companyData.nombre, budgetOverride, budgetHints, licitacion.budget]);

  const handleSaveProfile = useCallback(() => {
    if (!companyData.nombre) return;
    const existing = companyProfiles.findIndex(p => p.cuit === companyData.cuit && p.nombre === companyData.nombre);
    let updated: CompanyData[];
    if (existing >= 0) { updated = [...companyProfiles]; updated[existing] = companyData; }
    else { updated = [...companyProfiles, companyData]; }
    setCompanyProfiles(updated);
    setSelectedProfile(existing >= 0 ? existing : updated.length - 1);
    localStorage.setItem('cotizar_empresas', JSON.stringify(updated));
  }, [companyData, companyProfiles]);

  const handleDeleteProfile = useCallback(() => {
    if (selectedProfile < 0) return;
    const updated = companyProfiles.filter((_, i) => i !== selectedProfile);
    setCompanyProfiles(updated);
    setSelectedProfile(-1);
    localStorage.setItem('cotizar_empresas', JSON.stringify(updated));
  }, [selectedProfile, companyProfiles]);

  const competitiveness = useMemo(() => {
    if (!budgetHints?.budget || total <= 0) return null;
    const ratio = total / budgetHints.budget;
    if (ratio < 0.6) return { label: 'Muy bajo', color: 'text-orange-600 bg-orange-50', hint: 'Podria parecer poco serio' };
    if (ratio < 0.85) return { label: 'Competitivo', color: 'text-emerald-600 bg-emerald-50', hint: 'Buen rango' };
    if (ratio <= 1.0) return { label: 'Ajustado', color: 'text-yellow-600 bg-yellow-50', hint: 'Cerca del tope' };
    return { label: 'Excede PO', color: 'text-red-600 bg-red-50', hint: 'Supera presupuesto oficial' };
  }, [total, budgetHints]);

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-3 py-8 text-gray-500 text-sm">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        Cargando cotizacion…
      </div>
    );
  }

  const openingFormatted = licitacion.opening_date
    ? new Date(licitacion.opening_date).toLocaleDateString('es-AR')
    : 'N/A';
  const hasPliegoItems = (licitacion.items || []).length > 0;

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {errorMsg && <ErrorBanner message={errorMsg} onDismiss={() => setErrorMsg('')} />}

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
        <div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Presupuesto oficial</span>
          {editingBudget ? (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-gray-400 text-sm">$</span>
              <input
                type="number"
                className="w-40 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                defaultValue={budgetOverride ?? licitacion.budget ?? ''}
                autoFocus
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (val > 0) {
                    setBudgetOverride(val);
                    setBudgetHints(prev => prev ? { ...prev, budget: val, budget_source: 'manual_override' } : prev);
                  }
                  setEditingBudget(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingBudget(false);
                }}
              />
            </div>
          ) : (
            <p className="text-gray-600 mt-0.5 cursor-pointer hover:text-blue-600 group" onClick={() => setEditingBudget(true)}>
              {formatARS(budgetOverride ?? licitacion.budget ?? 0)}
              {budgetOverride ? (
                <span className="text-xs text-blue-500 ml-1">(corregido)</span>
              ) : (
                <span className="text-xs text-gray-400 ml-1">(click para corregir)</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Pliego Intelligence Banner */}
      {pliegoInfo && pliegoInfo.info_faltante && pliegoInfo.info_faltante.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 text-lg leading-none mt-0.5">!</span>
            <div className="flex-1">
              <p className="font-semibold text-amber-800 mb-1">Informacion faltante del pliego</p>
              <ul className="space-y-1">
                {pliegoInfo.info_faltante.map((info, i) => (
                  <li key={i} className="text-amber-700 flex items-start gap-1.5">
                    <span className="text-amber-400 mt-0.5">-</span>
                    <span>{info}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Step navigator */}
      <div className="flex items-center gap-0 overflow-x-auto">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <button
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
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
              <div className={`flex-1 h-0.5 mx-0.5 min-w-[8px] ${step > s.id ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Global save indicator */}
      <div className="flex items-center justify-end gap-2 text-xs">
        {savedAt && <span className="text-gray-400">Guardado {savedAt}</span>}
        {autoSaveFailed && <span className="text-red-500">Error al guardar</span>}
        <button onClick={() => doSave()} disabled={saving}
          className="px-3 py-1 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors flex items-center gap-1">
          {saving && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          Guardar
        </button>
      </div>

      {/* ─── Step 1: Items ─── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Budget banner — prompt to edit */}
          <div className={`rounded-xl px-4 py-3 text-sm ${
            budgetOverride ? 'bg-blue-50 border-2 border-blue-300' :
            'bg-gray-50 border border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Presupuesto Oficial {budgetOverride ? '(corregido)' : ''}
              </span>
              <button type="button"
                className="text-xs px-2.5 py-1 bg-white border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 text-gray-600 hover:text-blue-600 font-medium"
                onClick={() => {
                  const current = budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? 0;
                  const input = window.prompt('Ingrese el presupuesto oficial real (sin puntos ni $):', String(current));
                  if (input !== null) {
                    const raw = input.replace(/\./g, '').replace(',', '.').replace(/\$/g, '').trim();
                    const val = parseFloat(raw);
                    if (val > 0) {
                      setBudgetOverride(val);
                      setBudgetHints(prev => prev
                        ? { ...prev, budget: val, budget_source: 'manual_override' }
                        : { budget: val, budget_source: 'manual_override' } as any);
                    }
                  }
                }}
              >
                Editar PO
              </button>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <p className="font-bold text-gray-800 text-lg">
                {formatARS(budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? 0)}
              </p>
              {budgetOverride && <span className="text-xs text-blue-600 font-semibold bg-blue-100 px-2 py-0.5 rounded-full">Corregido</span>}
              {budgetHints?.threshold_label && (
                <span className="text-xs px-2 py-1 rounded-full bg-white text-gray-600 border ml-auto">{budgetHints.threshold_label}</span>
              )}
            </div>
            {budgetHints?.uf_value && budgetHints.budget_in_ufs != null && (
              <p className="text-xs text-gray-500 mt-1.5">UF Mendoza: ${budgetHints.uf_value} · {budgetHints.budget_in_ufs} UF</p>
            )}
          </div>

          {/* Price Intelligence Panel */}
          {priceIntelligence && priceIntelligence.price_range && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Inteligencia de Precios</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  priceIntelligence.price_range.confidence === 'alta' ? 'bg-emerald-100 text-emerald-700' :
                  priceIntelligence.price_range.confidence === 'media' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  Confianza {priceIntelligence.price_range.confidence} ({priceIntelligence.price_range.sample_size} refs)
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500">Min: {formatARS(priceIntelligence.price_range.min)}</span>
                <div className="flex-1 h-2 bg-indigo-100 rounded-full relative">
                  <div className="absolute left-[25%] right-[25%] h-full bg-indigo-300 rounded-full" />
                  {total > 0 && priceIntelligence.price_range.max > 0 && (
                    <div
                      className="absolute w-3 h-3 bg-indigo-600 rounded-full -mt-0.5 border-2 border-white"
                      style={{ left: `${Math.min(100, Math.max(0, (total / priceIntelligence.price_range.max) * 100))}%` }}
                      title={`Tu oferta: ${formatARS(total)}`}
                    />
                  )}
                </div>
                <span className="text-xs text-gray-500">Max: {formatARS(priceIntelligence.price_range.max)}</span>
              </div>
              {priceIntelligence.your_offer_position && total > 0 && (
                <p className="text-xs text-indigo-700">
                  Tu oferta esta <strong>{priceIntelligence.your_offer_position === 'below' ? 'por debajo' : priceIntelligence.your_offer_position === 'above' ? 'por encima' : 'dentro'}</strong> del rango de mercado
                </p>
              )}
              {priceIntelligence.adjustment_coefficient && priceIntelligence.adjustment_coefficient !== 1 && (
                <p className="text-xs text-gray-500">Coeficiente IPC aplicado: {priceIntelligence.adjustment_coefficient.toFixed(2)}</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-800">Items de la Oferta</h3>
            <div className="flex gap-2">
              {!priceIntelligence && (
                <button
                  onClick={handleLoadPriceIntelligence}
                  disabled={loadingPrices}
                  className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {loadingPrices ? <span className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" /> : '📊'}
                  Precios ref.
                </button>
              )}
              {hasPliegoItems && (
                <button onClick={importFromPliego} className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors">
                  Importar del pliego
                </button>
              )}
              <button
                onClick={handleImportAIItems}
                disabled={loadingHints}
                className="text-xs text-purple-600 hover:text-purple-800 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {loadingHints ? <span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" /> : '✨'}
                Cargar items con IA
              </button>
              <button
                onClick={() => { setHunterTab('pliego'); setHunterOpen(true); }}
                className="text-xs text-amber-600 hover:text-amber-800 border border-amber-200 hover:border-amber-400 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-semibold"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
                </svg>
                HUNTER
              </button>
            </div>
          </div>

          {/* Price adjustment toolbar */}
          {items.length > 0 && items.some(it => it.descripcion.trim()) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800">Ajustar precios</span>
                <div className="flex gap-1.5">
                  <button onClick={async () => {
                    const po = budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? 0;
                    if (!po) { alert('No hay Presupuesto Oficial definido'); return; }
                    const res = await fetch('/api/cotizar-ai/adjust-prices', {
                      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ items, budget: po, iva_rate: ivaRate, action: 'prorate', percentage: 100 }),
                    });
                    if (res.ok) { const data = await res.json(); if (data.items) setItems(data.items); }
                  }} className="text-[10px] px-2 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium">
                    Prorratear al PO
                  </button>
                  <button onClick={async () => {
                    const po = budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? 0;
                    if (!po) return;
                    const res = await fetch('/api/cotizar-ai/adjust-prices', {
                      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ items, budget: po, iva_rate: ivaRate, action: 'prorate', percentage: 80 }),
                    });
                    if (res.ok) { const data = await res.json(); if (data.items) setItems(data.items); }
                  }} className="text-[10px] px-2 py-1 bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 font-medium">
                    80% del PO
                  </button>
                  <button onClick={() => setShowPriceTools(!showPriceTools)}
                    className="text-[10px] px-2 py-1 bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50">
                    {showPriceTools ? 'Cerrar' : 'Mas opciones'}
                  </button>
                </div>
              </div>

              {showPriceTools && (
                <div className="space-y-2 pt-1 border-t border-amber-200">
                  {/* Monthly proration */}
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] text-amber-700 shrink-0">Prorratear mensual:</span>
                    <select value={contractMonths} onChange={e => setContractMonths(parseInt(e.target.value))}
                      className="text-xs border border-amber-300 rounded px-2 py-1 bg-white">
                      {[1,2,3,6,9,12,18,24,36].map(m => <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>)}
                    </select>
                    <button onClick={async () => {
                      const po = budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? 0;
                      if (!po) { alert('No hay PO definido'); return; }
                      const res = await fetch('/api/cotizar-ai/adjust-prices', {
                        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items, budget: po, iva_rate: ivaRate, action: 'prorate_monthly', months: contractMonths, percentage: 100 }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (data.items) {
                          setItems(data.items);
                          alert(`Prorrateado: ${data.months} meses, $${Math.round(data.monthly_budget).toLocaleString('es-AR')}/mes por item`);
                        }
                      }
                    }} className="text-[10px] px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                      Aplicar
                    </button>
                  </div>
                  {/* Scale to custom target */}
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] text-amber-700 shrink-0">Total objetivo:</span>
                    <input type="number" placeholder="Ej: 120000000"
                      className="flex-1 text-xs border border-amber-300 rounded px-2 py-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const target = parseFloat((e.target as HTMLInputElement).value);
                          if (!target) return;
                          fetch('/api/cotizar-ai/adjust-prices', {
                            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items, budget: target, iva_rate: ivaRate, action: 'scale_to_target', target_total: target / (1 + ivaRate / 100) }),
                          }).then(r => r.json()).then(d => { if (d.items) setItems(d.items); });
                        }
                      }}
                    />
                    <span className="text-[9px] text-amber-500">Enter para aplicar</span>
                  </div>
                  {/* AI instruction */}
                  <div className="flex gap-2">
                    <input value={priceInstruction} onChange={e => setPriceInstruction(e.target.value)}
                      placeholder="Ej: pondera los primeros 3 items un 30% mas alto"
                      className="flex-1 text-xs border border-amber-300 rounded px-2 py-1.5"
                    />
                    <button disabled={adjustingPrices || !priceInstruction}
                      onClick={async () => {
                        setAdjustingPrices(true);
                        try {
                          const po = budgetOverride ?? budgetHints?.budget ?? licitacion.budget ?? 0;
                          const res = await fetch('/api/cotizar-ai/adjust-prices', {
                            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items, budget: po, iva_rate: ivaRate, action: 'ai_adjust', instruction: priceInstruction }),
                          });
                          if (res.ok) { const data = await res.json(); if (data.items) { setItems(data.items); setPriceInstruction(''); } else if (data.error) { alert(data.error); } }
                        } finally { setAdjustingPrices(false); }
                      }}
                      className="text-[10px] px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium shrink-0">
                      {adjustingPrices ? 'Ajustando...' : 'Aplicar con AI'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mobile: card per item */}
          <div className="block sm:hidden space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">ITEM {idx + 1}</span>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Descripcion</label>
                  <input type="text" value={item.descripcion} onChange={e => handleItemChange(idx, 'descripcion', e.target.value)} placeholder="Descripcion del item" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Cantidad</label>
                    <NumericInput value={item.cantidad} onChange={v => handleItemChange(idx, 'cantidad', v)} integer min={1} placeholder="1" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Unidad</label>
                    <input list={`units-m-${idx}`} value={item.unidad} onChange={e => handleItemChange(idx, 'unidad', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <datalist id={`units-m-${idx}`}>{UNIT_OPTIONS.map(u => <option key={u} value={u} />)}</datalist>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Precio unitario (ARS)</label>
                  <NumericInput value={item.precio_unitario} onChange={v => handleItemChange(idx, 'precio_unitario', v)} min={0} placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                {/* Item-level price reference */}
                {priceIntelligence?.item_level_prices?.find(p => item.descripcion && p.descripcion.toLowerCase().includes(item.descripcion.toLowerCase().slice(0, 20))) && (
                  <p className="text-xs text-indigo-500">
                    Ref: {formatARS(priceIntelligence.item_level_prices.find(p => p.descripcion.toLowerCase().includes(item.descripcion.toLowerCase().slice(0, 20)))?.ref_price_min || 0)} - {formatARS(priceIntelligence.item_level_prices.find(p => p.descripcion.toLowerCase().includes(item.descripcion.toLowerCase().slice(0, 20)))?.ref_price_max || 0)}
                  </p>
                )}
                <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-gray-800">{formatARS((item.cantidad || 0) * (item.precio_unitario || 0))}</span>
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
                  <th className="text-left py-2 pr-3">Descripcion</th>
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
                      <input type="text" value={item.descripcion} onChange={e => handleItemChange(idx, 'descripcion', e.target.value)} placeholder="Descripcion del item…" className="w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 placeholder-gray-300 py-0.5" />
                    </td>
                    <td className="py-2.5 pr-3">
                      <NumericInput value={item.cantidad} onChange={v => handleItemChange(idx, 'cantidad', v)} integer min={1} placeholder="1" className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-0.5" />
                    </td>
                    <td className="py-2.5 pr-3">
                      <input list={`units-${idx}`} value={item.unidad} onChange={e => handleItemChange(idx, 'unidad', e.target.value)} className="w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-0.5" />
                      <datalist id={`units-${idx}`}>{UNIT_OPTIONS.map(u => <option key={u} value={u} />)}</datalist>
                    </td>
                    <td className="py-2.5 pr-3">
                      <NumericInput value={item.precio_unitario} onChange={v => handleItemChange(idx, 'precio_unitario', v)} min={0} placeholder="0.00" className="w-full text-right bg-transparent border-b border-transparent focus:border-blue-400 outline-none text-gray-800 py-0.5" />
                    </td>
                    <td className="py-2.5 pr-3 text-right text-gray-700 font-medium whitespace-nowrap">
                      {formatARS((item.cantidad || 0) * (item.precio_unitario || 0))}
                    </td>
                    <td className="py-2.5">
                      <button onClick={() => removeItem(idx)} disabled={items.length === 1} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 disabled:opacity-0 transition-all p-1 rounded text-xs" title="Eliminar item">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={addItem} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium">
            <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold leading-none">+</span>
            Agregar item
          </button>

          {/* Subtotals */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm mt-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal sin IVA</span>
              <span className="font-medium tabular-nums">{formatARS(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-gray-600">
                <span>IVA</span>
                <select value={ivaRate} onChange={e => setIvaRate(parseFloat(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  {IVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <span className="font-medium tabular-nums">{formatARS(ivaAmount)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
              <span>TOTAL</span>
              <span className="text-lg tabular-nums cursor-pointer hover:text-blue-700 transition-colors"
                title="Click para editar total y redistribuir"
                onClick={() => {
                  const input = prompt('Nuevo total con IVA (se redistribuyen proporciones):', total > 0 ? Math.round(total).toString() : '');
                  if (input) {
                    const newTotal = parseFloat(input.replace(/[^\d.]/g, ''));
                    if (newTotal > 0) {
                      fetch('/api/cotizar-ai/adjust-prices', {
                        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items, budget: newTotal, iva_rate: ivaRate, action: 'scale_to_target', target_total: newTotal / (1 + ivaRate / 100) }),
                      }).then(r => r.json()).then(d => { if (d.items) setItems(d.items); });
                    }
                  }
                }}
              >{formatARS(total)}</span>
            </div>
          </div>

          {competitiveness && (
            <div className={`rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-between ${competitiveness.color}`}>
              <span>Tu oferta vs PO: <strong>{competitiveness.label}</strong></span>
              <span>{competitiveness.hint}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <div className="flex items-center gap-2">
              {savedAt && <p className="text-xs text-gray-400">Guardado {savedAt}</p>}
              {autoSaveFailed && (
                <button onClick={() => { setAutoSaveFailed(false); doSave(false); }} className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full hover:bg-red-100 transition-colors">
                  Error al guardar · Reintentar
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => doSave()} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl disabled:opacity-60 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-gray-400/40 border-t-gray-600 rounded-full animate-spin" /> : null}
                Guardar
              </button>
              <button onClick={() => { doSave(true); setStep(2); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
                Siguiente <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 2: Propuesta Tecnica ─── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Propuesta Tecnica</h3>
            <button onClick={handleSuggestPropuesta} disabled={suggestingPropuesta} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:text-purple-800 hover:border-purple-400 transition-colors disabled:opacity-50">
              {suggestingPropuesta ? <span className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" /> : '✨'}
              Sugerir con IA
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Metodologia / Descripcion del servicio</label>
              <textarea value={techData.methodology} onChange={e => setTechData(p => ({ ...p, methodology: e.target.value }))} placeholder="Describi como vas a ejecutar el contrato…" rows={4} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Plazo de ejecucion</label>
                <input type="text" value={techData.plazo} onChange={e => setTechData(p => ({ ...p, plazo: e.target.value }))} placeholder="Ej: 30 dias habiles" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Lugar de entrega</label>
                <input type="text" value={techData.lugar} onChange={e => setTechData(p => ({ ...p, lugar: e.target.value }))} placeholder="Ej: Sede del organismo" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Validez de la oferta (dias)</label>
                <NumericInput value={parseInt(techData.validez) || 30} onChange={v => setTechData(p => ({ ...p, validez: String(v) }))} integer min={1} placeholder="30" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas adicionales</label>
              <textarea value={techData.notas} onChange={e => setTechData(p => ({ ...p, notas: e.target.value }))} placeholder="Condiciones especiales, garantias, observaciones…" rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            </div>
          </div>

          {/* Antecedentes section */}
          <div className="border-t border-gray-100 pt-4">
            <button onClick={() => handleLoadAntecedentes()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              <span className={`transition-transform ${showAntecedentes ? 'rotate-90' : ''}`}>▶</span>
              Antecedentes similares
              {antecedentes.length > 0 && <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-full">{antecedentes.length}</span>}
            </button>

            {/* Vinculados badges */}
            {vinculados.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {vinculados.map(id => {
                  const ant = resolveAntecedente(id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                      {ant ? (ant.objeto || ant.title || '').slice(0, 30) + '...' : 'Cargando...'}
                      <button onClick={() => handleDesvincular(id)} className="text-blue-400 hover:text-blue-600">✕</button>
                    </span>
                  );
                })}
              </div>
            )}

            {showAntecedentes && (
              <div className="mt-3 space-y-2">
                {loadingAntecedentes ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-purple-500 rounded-full animate-spin" />
                    Buscando licitaciones similares...
                  </div>
                ) : antecedentes.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No se encontraron antecedentes similares.</p>
                ) : (
                  <>
                    {antecedentes.map(ant => (
                      <div key={ant.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-800 line-clamp-1 flex-1">{ant.objeto || ant.title}</p>
                          {vinculados.includes(ant.id) ? (
                            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Vinculado</span>
                          ) : (
                            <button onClick={() => handleVincular(ant.id)} className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full shrink-0 transition-colors">
                              Vincular
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>{ant.organization}</span>
                          {ant.budget != null && <span className="font-medium">{formatARS(ant.budget)}</span>}
                          {ant.price_ratio != null && (
                            <span className={`font-medium ${ant.price_ratio > 1.2 ? 'text-red-500' : ant.price_ratio < 0.8 ? 'text-emerald-500' : 'text-gray-600'}`}>
                              {(ant.price_ratio * 100).toFixed(0)}% vs actual
                            </span>
                          )}
                          {ant.publication_date && <span>{new Date(ant.publication_date).toLocaleDateString('es-AR')}</span>}
                          {ant.relevance_score != null && (
                            <span className="text-purple-500">Rel: {ant.relevance_score.toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {antecedentes.length < antecedentesTotal && (
                      <button onClick={() => handleLoadAntecedentes(true)} disabled={loadingAntecedentes}
                        className="w-full text-center text-xs text-blue-600 hover:text-blue-800 py-2 border border-dashed border-blue-200 rounded-lg transition-colors disabled:opacity-50">
                        {loadingAntecedentes ? 'Cargando...' : `Cargar mas (${antecedentes.length} de ${antecedentesTotal})`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Company Antecedentes (Ultima Milla) */}
          <div className="border-t border-gray-100 pt-4">
            <button onClick={() => handleLoadCompanyAntecedentes()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              <span className={`transition-transform ${showCompanyAntecedentes ? 'rotate-90' : ''}`}>▶</span>
              Antecedentes de la Empresa (Ultima Milla)
              {companyAntTotal > 0 && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{companyAntTotal}</span>}
            </button>

            {showCompanyAntecedentes && (
              <div className="mt-3 space-y-3">
                {/* Sector filter chips */}
                {companyAntSectors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {companyAntSectors.map(s => (
                      <button
                        key={s.sector}
                        onClick={() => handleSectorFilter(s.sector)}
                        className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                          selectedCompanyAntSector === s.sector
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                        }`}
                      >
                        {s.sector} <span className="opacity-60">({s.count})</span>
                      </button>
                    ))}
                    {selectedCompanyAntSector && (
                      <button onClick={() => handleSectorFilter(selectedCompanyAntSector)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕ limpiar</button>
                    )}
                  </div>
                )}

                {loadingCompanyAntecedentes ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                    Buscando proyectos de Ultima Milla...
                  </div>
                ) : companyAntecedentes.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No se encontraron antecedentes de la empresa.</p>
                ) : (
                  companyAntecedentes.map(ant => (
                    <div key={ant.id} className="bg-blue-50/50 rounded-lg p-3 text-sm">
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        {ant.image_url && (
                          <img
                            src={ant.image_url}
                            alt=""
                            className="w-20 h-14 object-cover rounded-md shrink-0 bg-gray-200"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-gray-800 line-clamp-1">{ant.title}</p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {vinculados.includes(ant.id) ? (
                                <button onClick={() => handleDesvincular(ant.id)} className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                                  ✓ Vinculado
                                </button>
                              ) : (
                                <button onClick={() => handleVincular(ant.id)} className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full shrink-0 transition-colors">
                                  + Vincular
                                </button>
                              )}
                              {ant.url && (
                                <a href={ant.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600 shrink-0 border border-gray-200 px-2 py-0.5 rounded-full transition-colors">
                                  Ver
                                </a>
                              )}
                            </div>
                          </div>
                          {ant.objeto && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ant.objeto}</p>}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {ant.category && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{ant.category}</span>
                            )}
                            {ant.organization && <span className="text-xs text-gray-500">{ant.organization}</span>}
                            {ant.estado_sgi === 3 && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Finalizado</span>}
                            {ant.estado_sgi === 2 && <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">En Progreso</span>}
                          </div>
                          {/* Financial info */}
                          {(ant.budget || ant.budget_adjusted || ant.certificado_total) && (
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                              {ant.budget != null && ant.budget > 0 && (
                                <span title="Presupuesto original">
                                  ${ant.budget.toLocaleString('es-AR')}
                                  {ant.budget_adjusted != null && ant.budget_adjusted > ant.budget && (
                                    <span className="text-amber-600 ml-1" title={`Ajustado por IPC (×${ant.ipc_coefficient?.toFixed(1)})`}>
                                      → ${ant.budget_adjusted >= 1e9
                                        ? `${(ant.budget_adjusted / 1e9).toFixed(1)}B`
                                        : ant.budget_adjusted >= 1e6
                                        ? `${(ant.budget_adjusted / 1e6).toFixed(1)}M`
                                        : ant.budget_adjusted.toLocaleString('es-AR')
                                      }
                                    </span>
                                  )}
                                </span>
                              )}
                              {ant.certificado_total != null && ant.certificado_total > 0 && (
                                <span title="Certificado total">Cert: ${ant.certificado_total.toLocaleString('es-AR')}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {companyAntecedentes.length > 0 && companyAntecedentes.length < companyAntTotal && (
                  <button onClick={() => handleLoadCompanyAntecedentes(selectedCompanyAntSector || undefined, true)} disabled={loadingCompanyAntecedentes}
                    className="w-full text-center text-xs text-blue-600 hover:text-blue-800 py-2 border border-dashed border-blue-200 rounded-lg transition-colors disabled:opacity-50">
                    {loadingCompanyAntecedentes ? 'Cargando...' : `Cargar mas (${companyAntecedentes.length} de ${companyAntTotal})`}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors">
              <span>←</span> Anterior
            </button>
            <button onClick={() => setStep(3)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
              Siguiente <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Empresa ─── */}
      {step === 3 && (
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-800">Datos de la Empresa</h3>

          {companyProfiles.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Perfil:</span>
              <select value={selectedProfile} onChange={e => { const idx = parseInt(e.target.value); setSelectedProfile(idx); if (idx >= 0) setCompanyData(companyProfiles[idx]); }} className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                <option value={-1}>— Nuevo —</option>
                {companyProfiles.map((p, i) => <option key={i} value={i}>{p.nombre} ({p.cuit})</option>)}
              </select>
              <button onClick={handleSaveProfile} disabled={!companyData.nombre} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-40 transition-colors">Guardar</button>
              {selectedProfile >= 0 && (
                <button onClick={handleDeleteProfile} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Eliminar</button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Razon social / Nombre</label>
              <input type="text" value={companyData.nombre} onChange={e => setCompanyData(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre de la empresa" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">CUIT</label>
              <input type="text" value={companyData.cuit} onChange={e => setCompanyData(p => ({ ...p, cuit: e.target.value }))} placeholder="20-12345678-9" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={companyData.email} onChange={e => setCompanyData(p => ({ ...p, email: e.target.value }))} placeholder="contacto@empresa.com" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefono</label>
              <input type="tel" value={companyData.telefono} onChange={e => setCompanyData(p => ({ ...p, telefono: e.target.value }))} placeholder="+54 261 4000000" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Domicilio legal</label>
              <input type="text" value={companyData.domicilio} onChange={e => setCompanyData(p => ({ ...p, domicilio: e.target.value }))} placeholder="Calle, Numero, Ciudad" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"><span>←</span> Anterior</button>
            <button onClick={() => { doSave(true); setStep(4); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">Siguiente <span>→</span></button>
          </div>

          {companyData.nombre && companyProfiles.findIndex(p => p.cuit === companyData.cuit && p.nombre === companyData.nombre) < 0 && (
            <button onClick={handleSaveProfile} className="text-xs text-blue-500 hover:text-blue-700 transition-colors">
              Guardar este perfil para proximas cotizaciones
            </button>
          )}
        </div>
      )}

      {/* ─── Step 4: Marco Legal ─── */}
      {step === 4 && (
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-800">Marco Legal</h3>
          <p className="text-sm text-gray-500">Analisis del encuadre legal de la licitacion y requisitos para participar.</p>

          {/* Static info from licitacion */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {licitacion.budget && budgetHints?.threshold_label && (
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs font-semibold text-gray-400 uppercase">Umbral</span>
                <p className="text-sm text-gray-800 font-medium mt-0.5">{budgetHints.threshold_label}</p>
                {budgetHints.threshold_system === 'uf_mendoza' && budgetHints.uf_value && (
                  <p className="text-xs text-gray-500 mt-1">Ley 8706 · UF {budgetHints.uf_value} · {budgetHints.budget_in_ufs} UF</p>
                )}
              </div>
            )}
          </div>

          {/* Document Repository + Pagare buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowDocRepo(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              📁 Repositorio de Documentos
            </button>
            <a
              href={`/api/documentos/pagare/${licitacion.id}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300 transition-colors"
            >
              📄 Generar Pagare Garantia
            </a>
          </div>

          {!marcoLegal && !loadingMarcoLegal && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">⚖️</div>
              <p className="text-gray-600 text-sm mb-4">
                Analizamos el tipo de procedimiento, requisitos legales y documentacion obligatoria.
              </p>
              <button
                onClick={handleLoadMarcoLegal}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-amber-200"
              >
                Analizar marco legal con IA
              </button>
            </div>
          )}

          {loadingMarcoLegal && (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-10 h-10 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Analizando marco legal...</p>
            </div>
          )}

          {marcoLegal && !marcoLegal.error && (
            <div className="space-y-4">
              {/* Encuadre legal */}
              {marcoLegal.encuadre_legal && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-amber-700 uppercase mb-1">Encuadre Legal</p>
                  <p className="text-sm text-gray-800">{marcoLegal.encuadre_legal}</p>
                </div>
              )}

              {/* Tipo procedimiento explicado */}
              {marcoLegal.tipo_procedimiento_explicado && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Tipo de Procedimiento</p>
                  <p className="text-sm text-gray-800">{marcoLegal.tipo_procedimiento_explicado}</p>
                </div>
              )}

              {/* Requisitos habilitacion - interactive checklist */}
              {marcoLegal.requisitos_habilitacion && marcoLegal.requisitos_habilitacion.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Requisitos de Habilitacion</p>
                  <div className="space-y-1.5">
                    {marcoLegal.requisitos_habilitacion.map((req, i) => (
                      <label key={i} className="flex items-start gap-2 text-sm cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={marcoLegalChecks[`req-${i}`] || false}
                          onChange={e => setMarcoLegalChecks(prev => ({ ...prev, [`req-${i}`]: e.target.checked }))}
                          className="mt-0.5 rounded border-gray-300"
                        />
                        <span className={marcoLegalChecks[`req-${i}`] ? 'text-gray-400 line-through' : 'text-gray-700'}>{req}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Documentacion obligatoria — with company doc cross-reference */}
              {marcoLegal.documentacion_obligatoria && marcoLegal.documentacion_obligatoria.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documentacion Obligatoria</p>
                    <a href="/empresa" className="text-xs text-blue-600 hover:text-blue-800 transition-colors">Repositorio</a>
                  </div>
                  <div className="space-y-2">
                    {marcoLegal.documentacion_obligatoria.map((doc, i) => {
                      // Cross-reference: find matching company doc by category or filename keyword
                      const docName = doc.documento.toLowerCase();
                      const matchingDoc = companyDocs.find(cd =>
                        docName.includes(cd.category.toLowerCase()) ||
                        cd.category.toLowerCase().includes(docName.slice(0, 10)) ||
                        cd.filename.toLowerCase().includes(docName.slice(0, 10))
                      );
                      const isExpired = matchingDoc?.expiration_date
                        ? new Date(matchingDoc.expiration_date) < new Date()
                        : false;
                      const docStatus = matchingDoc
                        ? isExpired ? 'expired' : 'available'
                        : 'missing';

                      return (
                        <label key={i} className={`flex items-start gap-2 text-sm rounded-lg p-2.5 cursor-pointer ${
                          docStatus === 'available' ? 'bg-emerald-50' :
                          docStatus === 'expired' ? 'bg-red-50' : 'bg-gray-50'
                        }`}>
                          <input
                            type="checkbox"
                            checked={marcoLegalChecks[`doc-${i}`] || docStatus === 'available'}
                            onChange={e => setMarcoLegalChecks(prev => ({ ...prev, [`doc-${i}`]: e.target.checked }))}
                            className="mt-0.5 rounded border-gray-300"
                          />
                          <div className={`flex-1 ${marcoLegalChecks[`doc-${i}`] ? 'text-gray-400' : ''}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{doc.documento}</span>
                              {docStatus === 'available' && (
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">En repositorio</span>
                              )}
                              {docStatus === 'expired' && (
                                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Vencido</span>
                              )}
                              {docStatus === 'missing' && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Falta</span>
                              )}
                            </div>
                            {doc.descripcion && <p className="text-xs text-gray-500 mt-0.5">{doc.descripcion}</p>}
                            {doc.donde_obtener && <p className="text-xs text-blue-500 mt-0.5">Obtener en: {doc.donde_obtener}</p>}
                            {matchingDoc && (
                              <a
                                href={`/api/documentos/${matchingDoc.id}/download`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800 mt-0.5 inline-block"
                              >
                                Descargar: {matchingDoc.filename}
                              </a>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Garantias */}
              {marcoLegal.garantias_requeridas && marcoLegal.garantias_requeridas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Garantias Requeridas</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {marcoLegal.garantias_requeridas.map((g, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-medium text-gray-800 text-sm">{g.tipo}</p>
                        {g.porcentaje && <p className="text-xs text-gray-500">Porcentaje: {g.porcentaje}</p>}
                        {g.monto_estimado && <p className="text-xs text-gray-500">Monto est.: {formatARS(g.monto_estimado)}</p>}
                        {g.forma && <p className="text-xs text-gray-500">Forma: {g.forma}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Guia paso a paso */}
              {marcoLegal.guia_paso_a_paso && marcoLegal.guia_paso_a_paso.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Guia Paso a Paso</p>
                  <ol className="space-y-1.5">
                    {marcoLegal.guia_paso_a_paso.map((paso, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="bg-amber-100 text-amber-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                        {paso}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Normativa aplicable */}
              {marcoLegal.normativa_aplicable && marcoLegal.normativa_aplicable.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Normativa Aplicable</p>
                  <div className="flex flex-wrap gap-1.5">
                    {marcoLegal.normativa_aplicable.map((n, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{n}</span>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleLoadMarcoLegal} className="text-xs text-amber-600 hover:text-amber-800 transition-colors">
                Volver a analizar
              </button>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(3)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"><span>←</span> Anterior</button>
            <button onClick={() => { doSave(true); setStep(5); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">Siguiente <span>→</span></button>
          </div>
        </div>
      )}

      {/* ─── Step 5: Analisis IA ─── */}
      {step === 5 && (
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-800">Analisis IA</h3>
          <p className="text-sm text-gray-500">Evaluacion automatica de tu oferta usando inteligencia artificial.</p>

          {!analysis && !analyzing && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🤖</div>
              <p className="text-gray-600 text-sm mb-4">Analizamos tus items, propuesta tecnica y datos de empresa contra la licitacion.</p>
              <button onClick={handleAnalyze} disabled={items.length === 0 || total <= 0} className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-200">
                Ejecutar Analisis IA
              </button>
              {(items.length === 0 || total <= 0) && (
                <p className="text-xs text-gray-400 mt-2">Necesitas al menos 1 item con precio para analizar.</p>
              )}
            </div>
          )}

          {analyzing && (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Analizando tu oferta...</p>
            </div>
          )}

          {analyzeError && (
            <ErrorBanner message={analyzeError} onRetry={handleAnalyze} onDismiss={() => setAnalyzeError('')} />
          )}

          {analysis && (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 ${
                analysis.win_probability >= 70 ? 'bg-emerald-50 border border-emerald-200' :
                analysis.win_probability >= 40 ? 'bg-yellow-50 border border-yellow-200' :
                'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Veredicto</span>
                  <span className={`text-2xl font-bold ${analysis.win_probability >= 70 ? 'text-emerald-600' : analysis.win_probability >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {analysis.win_probability}%
                  </span>
                </div>
                <p className="font-semibold text-gray-800">{analysis.veredicto}</p>
                <p className="text-sm text-gray-600 mt-1">{analysis.resumen}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['precio', 'metodologia', 'empresa', 'cronograma'] as const).map(key => {
                  const s = analysis[key] || { score: 0, detail: 'Sin datos' };
                  const label = key === 'precio' ? 'Precio' : key === 'metodologia' ? 'Metodologia' : key === 'empresa' ? 'Empresa' : 'Cronograma';
                  return (
                    <div key={key} className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase">{label}</span>
                        <span className={`text-lg font-bold ${s.score >= 7 ? 'text-emerald-600' : s.score >= 4 ? 'text-yellow-600' : 'text-red-600'}`}>{s.score}/10</span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{s.detail}</p>
                    </div>
                  );
                })}
              </div>

              {analysis.riesgos?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Riesgos</h4>
                  <div className="space-y-2">
                    {analysis.riesgos.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${r.nivel === 'alto' ? 'bg-red-100 text-red-700' : r.nivel === 'medio' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{r.nivel}</span>
                        <span className="text-gray-700">{r.detalle}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.recomendaciones?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recomendaciones</h4>
                  <ul className="space-y-1.5">
                    {analysis.recomendaciones.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-emerald-500 mt-0.5">•</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={handleAnalyze} className="text-xs text-purple-600 hover:text-purple-800 transition-colors">Volver a analizar</button>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(4)} className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"><span>←</span> Anterior</button>
            <button onClick={() => setStep(6)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">Ver resumen <span>→</span></button>
          </div>
        </div>
      )}

      {/* ─── Step 6: Oferta Profesional ─── */}
      {step === 6 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Oferta Profesional</h3>
            <div className="flex gap-2">
              <a
                href={`/api/cotizaciones/${licitacion.id}/pdf`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Descargar PDF
              </a>
              <a
                href={`/api/documentos/pagare/${licitacion.id}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
              >
                Pagare
              </a>
            </div>
          </div>

          {/* Template selector */}
          {showTemplateSelector && availableTemplates.length > 0 && (
            <div className="border-2 border-blue-200 bg-blue-50/30 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-800">Elegí una plantilla para tu oferta</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {availableTemplates.map(t => (
                  <button key={t.id} onClick={() => handleApplyTemplate(t.slug)}
                    className="text-left border border-gray-200 rounded-xl p-3 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <p className="font-semibold text-sm text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{t.sections_count} secciones</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!showTemplateSelector && (
            <>
              <p className="text-sm text-gray-500">Edita las secciones de tu oferta. Podes generar contenido con IA, agregar/quitar secciones, y reordenarlas.</p>

              <OfertaSections
                licitacionId={licitacion.id}
                sections={offerSections}
                onSectionsChange={setOfferSections}
                pliegoDocuments={pliegoDocuments}
                onPliegosChange={setPliegoDocuments}
                templateName={templateName}
                onChangeTemplate={() => setShowTemplateSelector(true)}
              />
            </>
          )}

          {savedAt && <p className="text-xs text-gray-400">Guardado {savedAt}</p>}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button onClick={() => setStep(5)} className="flex items-center justify-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium rounded-xl hover:bg-gray-100 border border-gray-200 transition-colors">
              <span>←</span> Anterior
            </button>
            <button onClick={() => doSave()} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded-xl disabled:opacity-60 transition-colors">
              {saving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
              Guardar oferta
            </button>
            <a
              href={`/api/cotizaciones/${licitacion.id}/pdf`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Descargar PDF
            </a>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:border-none, .print\\:border-none * { visibility: visible; }
          .print\\:hidden { display: none !important; }
          @page { margin: 2cm; }
          table { page-break-inside: avoid; }
        }
      `}</style>

      {/* Document Repository Modal */}
      <DocumentRepository open={showDocRepo} onClose={() => setShowDocRepo(false)} />

      {/* HUNTER Panel */}
      <HunterPanel
        licitacionId={licitacion.id}
        mode="cotizar"
        isOpen={hunterOpen}
        onClose={() => setHunterOpen(false)}
        initialTab={hunterTab}
        onImportItems={(importedItems) => {
          if (importedItems && importedItems.length > 0) {
            const newItems: CotizarItem[] = importedItems.map((it: any, idx: number) => ({
              id: `hunter-${Date.now()}-${idx}`,
              descripcion: it.descripcion || it.description || '',
              cantidad: it.cantidad || 1,
              unidad: it.unidad || 'u.',
              precio_unitario: it.precio_unitario || 0,
            }));
            setItems(prev => [...prev.filter(i => i.descripcion), ...newItems]);
            setHunterOpen(false);
          }
        }}
      />
    </div>
  );
}
