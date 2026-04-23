/**
 * Sección "Mi Empresa" — datos privados de SGI Ultima Milla.
 * Protegida con PIN de 6 dígitos. Cookie sgi_unlocked dura 4h.
 */
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
const EmpresaKnowledge = lazy(() => import('./EmpresaKnowledge'));

const API_URL = process.env.REACT_APP_API_URL || '';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

// ── Types ─────────────────────────────────────────────────────────────────────

type SGISummary = {
  sgi_enabled: boolean;
  dashboard?: {
    facturado: number; cobrado: number; saldo: number;
    proyectosActivos: number; certificadosPendientes: number;
  };
  presupuestos?: {
    total: number; borradores: number; enviados: number;
    aprobados: number; rechazados: number; vencidos: number;
    win_rate: number; pipeline_total: number; aprobados_total: number;
  };
  proyectos_stats?: { total: number; activos: number; finalizados: number; monto_total: number };
  balance?: { facturado: number; cobrado: number; pendiente_cobro: number; gastos: number; saldo_neto: number };
};

type Proyecto = {
  id: string; nombre: string; cliente: string;
  presupuesto: number; certificado_total: number; estado: number;
};

type Certificado = {
  id: string; numero: number; monto: number; fechaEmision: string;
  proyecto: string; cliente: string; diasPendiente: number;
};

type Factura = {
  id: string; numero: string; cliente?: string; proveedor?: string;
  monto: number; fechaEmision: string; fechaVencimiento: string; diasVencido?: number;
};


// ── KPI Tile ──────────────────────────────────────────────────────────────────

const KpiTile: React.FC<{ label: string; value: string; sub?: string; color?: string }> = ({ label, value, sub, color = 'text-gray-900' }) => (
  <div className="bg-white border border-gray-100 rounded p-4">
    <div className="text-xs text-gray-500 uppercase mb-1">{label}</div>
    <div className={`text-xl font-bold ${color}`}>{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
  </div>
);

// ── Pipeline Bar ──────────────────────────────────────────────────────────────

const PipelineBar: React.FC<{ presupuestos: SGISummary['presupuestos'] }> = ({ presupuestos: p }) => {
  if (!p) return null;
  const total = p.total || 1;
  const stages = [
    { label: 'Borradores', count: p.borradores, color: 'bg-gray-300' },
    { label: 'Enviados', count: p.enviados, color: 'bg-blue-400' },
    { label: 'Aprobados', count: p.aprobados, color: 'bg-green-500' },
    { label: 'Rechazados', count: p.rechazados, color: 'bg-red-400' },
    { label: 'Vencidos', count: p.vencidos, color: 'bg-yellow-400' },
  ];
  return (
    <div>
      <div className="flex rounded overflow-hidden h-6 mb-2">
        {stages.map((s) => (
          <div
            key={s.label}
            className={`${s.color} transition-all`}
            style={{ width: `${(s.count / total) * 100}%` }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="flex gap-4 flex-wrap text-xs text-gray-600">
        {stages.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${s.color}`} />
            {s.label}: <strong>{s.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
};

// ── Sub-tabs ──────────────────────────────────────────────────────────────────

type SubTab = 'resumen' | 'proyectos' | 'certificados' | 'cobros' | 'pago' | 'conocimiento';

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'certificados', label: 'Certificados' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'pago', label: 'Pagos' },
  { id: 'conocimiento', label: '📚 Base Conocimiento' },
];

// ── Main Component ────────────────────────────────────────────────────────────

export const SGISection: React.FC = () => {
  const [subTab, setSubTab] = useState<SubTab>('resumen');
  const [summary, setSummary] = useState<SGISummary | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [facturasCobro, setFacturasCobro] = useState<Factura[]>([]);
  const [facturasPago, setFacturasPago] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_URL}/api/analytics/sgi/summary`, { credentials: 'include' });
      if (r.status === 401 || r.status === 403) { setError('Sin acceso — iniciá sesión con tu cuenta'); return; }
      if (!r.ok) { setError('Error cargando datos SGI'); return; }
      const data = await r.json();
      setSummary(data);
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  }, []);

  const fetchTab = useCallback(async (tab: SubTab) => {
    if (tab === 'resumen') return;
    const endpoints: Record<SubTab, string> = {
      resumen: '',
      proyectos: '/api/analytics/sgi/proyectos',
      certificados: '/api/analytics/sgi/certificados',
      cobros: '/api/analytics/sgi/facturas/cobro',
      pago: '/api/analytics/sgi/facturas/pago',
      conocimiento: '',
    };
    const url = endpoints[tab];
    if (!url) return;
    try {
      const r = await fetch(`${API_URL}${url}`, { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      if (tab === 'proyectos') setProyectos(data.proyectos || []);
      if (tab === 'certificados') setCertificados(data.certificados || []);
      if (tab === 'cobros') setFacturasCobro(data.facturas || []);
      if (tab === 'pago') setFacturasPago(data.facturas || []);
    } catch {}
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTab(subTab); }, [subTab, fetchTab]);

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t transition-colors ${
              subTab === t.id
                ? 'bg-white border border-b-white border-gray-200 text-blue-700 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={fetchSummary}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2"
          title="Actualizar"
        >
          ↻
        </button>
      </div>

      {loading && <div className="text-xs text-gray-400 py-4 text-center">Cargando…</div>}
      {error && <div className="text-xs text-red-600 py-2">{error}</div>}

      {/* RESUMEN */}
      {subTab === 'resumen' && summary && (
        <div className="space-y-6">
          {/* KPIs Financieros */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Facturado total" value={fmt(summary.balance?.facturado ?? summary.dashboard?.facturado ?? 0)} />
            <KpiTile label="Cobrado" value={fmt(summary.balance?.cobrado ?? summary.dashboard?.cobrado ?? 0)} color="text-green-700" />
            <KpiTile label="Saldo neto" value={fmt(summary.balance?.saldo_neto ?? 0)} color="text-blue-700" />
            <KpiTile label="Gastos" value={fmt(summary.balance?.gastos ?? 0)} color="text-red-600" />
          </div>

          {/* KPIs Operativos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiTile label="Win Rate" value={`${summary.presupuestos?.win_rate ?? 0}%`} sub="Efectividad global" color="text-indigo-700" />
            <KpiTile label="Pipeline" value={fmt(summary.presupuestos?.pipeline_total ?? 0)} sub="Presupuestos activos" />
            <KpiTile label="Proyectos activos" value={String(summary.dashboard?.proyectosActivos ?? summary.proyectos_stats?.activos ?? 0)} />
            <KpiTile label="Cert. pendientes" value={String(summary.dashboard?.certificadosPendientes ?? 0)} color="text-orange-600" />
          </div>

          {/* Pipeline de Presupuestos */}
          {summary.presupuestos && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Pipeline de Presupuestos</h3>
              <div className="bg-white border border-gray-100 rounded p-4">
                <PipelineBar presupuestos={summary.presupuestos} />
                <div className="mt-3 text-xs text-gray-500">
                  Total: <strong>{summary.presupuestos.total}</strong> presupuestos •
                  Aprobados: <strong>{fmt(summary.presupuestos.aprobados_total)}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PROYECTOS */}
      {subTab === 'proyectos' && (
        <div className="overflow-x-auto">
          {proyectos.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">No hay proyectos activos</div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Proyecto</th>
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Cliente</th>
                  <th className="text-right py-2 pr-4 text-gray-500 font-medium">Presupuesto</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Certificado</th>
                </tr>
              </thead>
              <tbody>
                {proyectos.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-900 max-w-xs truncate" title={p.nombre}>{p.nombre}</td>
                    <td className="py-2 pr-4 text-gray-600 max-w-xs truncate">{p.cliente}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fmt(p.presupuesto)}</td>
                    <td className="py-2 text-right text-gray-500">{fmt(p.certificado_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CERTIFICADOS */}
      {subTab === 'certificados' && (
        <div className="overflow-x-auto">
          {certificados.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">No hay certificados pendientes</div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-3 text-gray-500 font-medium">Proyecto</th>
                  <th className="text-left py-2 pr-3 text-gray-500 font-medium">Cliente</th>
                  <th className="text-right py-2 pr-3 text-gray-500 font-medium">Monto</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Días pendiente</th>
                </tr>
              </thead>
              <tbody>
                {certificados.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-3 max-w-xs truncate" title={c.proyecto}>{c.proyecto}</td>
                    <td className="py-2 pr-3 text-gray-600">{c.cliente}</td>
                    <td className="py-2 pr-3 text-right">{fmt(c.monto)}</td>
                    <td className={`py-2 text-right font-medium ${c.diasPendiente > 60 ? 'text-red-600' : 'text-orange-600'}`}>
                      {c.diasPendiente}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* COBROS */}
      {subTab === 'cobros' && (
        <FacturasTable facturas={facturasCobro} tipo="cobro" />
      )}

      {/* PAGOS */}
      {subTab === 'pago' && (
        <FacturasTable facturas={facturasPago} tipo="pago" />
      )}
      {subTab === 'conocimiento' && (
        <Suspense fallback={<div className="text-xs text-gray-400 py-6 text-center">Cargando…</div>}>
          <EmpresaKnowledge />
        </Suspense>
      )}
    </div>
  );
};

const FacturasTable: React.FC<{ facturas: Factura[]; tipo: 'cobro' | 'pago' }> = ({ facturas, tipo }) => {
  const label = tipo === 'cobro' ? 'cliente' : 'proveedor';
  if (facturas.length === 0) {
    return <div className="text-xs text-gray-400 py-6 text-center">No hay facturas pendientes</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 pr-3 text-gray-500 font-medium capitalize">{label}</th>
            <th className="text-left py-2 pr-3 text-gray-500 font-medium">N°</th>
            <th className="text-right py-2 pr-3 text-gray-500 font-medium">Monto</th>
            <th className="text-right py-2 text-gray-500 font-medium">Vencimiento</th>
          </tr>
        </thead>
        <tbody>
          {facturas.slice(0, 30).map((f) => (
            <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-3 max-w-xs truncate">{f.cliente || f.proveedor}</td>
              <td className="py-2 pr-3 text-gray-500">{f.numero}</td>
              <td className="py-2 pr-3 text-right font-medium">{fmt(f.monto)}</td>
              <td className={`py-2 text-right text-gray-500 ${(f.diasVencido ?? 0) > 30 ? 'text-red-500' : ''}`}>
                {f.fechaVencimiento?.slice(0, 10)}
                {f.diasVencido != null && f.diasVencido > 0 && (
                  <span className="text-red-500 ml-1">({f.diasVencido}d)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {facturas.length > 30 && (
        <div className="text-xs text-gray-400 text-center py-2">
          Mostrando 30 de {facturas.length}
        </div>
      )}
    </div>
  );
};
