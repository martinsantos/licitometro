import React, { forwardRef } from 'react';
import { CotizarItem, AIAnalysisResult, MarcoLegal, PriceIntelligence, Antecedente } from '../../hooks/useCotizarAPI';

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

interface Licitacion {
  id: string;
  title: string;
  objeto?: string | null;
  organization?: string;
  opening_date?: string | null;
  budget?: number | null;
}

interface GarantiaData {
  oferta_pct: string;
  oferta_monto: number;
  oferta_manual: boolean;
  cumplimiento_pct: string;
  cumplimiento_monto: number;
  cumplimiento_manual: boolean;
  forma: string;
}

interface Props {
  licitacion: Licitacion;
  items: CotizarItem[];
  ivaRate: number;
  subtotal: number;
  ivaAmount: number;
  total: number;
  techData: TechnicalData;
  companyData: CompanyData;
  analysis: AIAnalysisResult | null;
  marcoLegal: MarcoLegal | null;
  marcoLegalChecks: Record<string, boolean>;
  priceIntelligence: PriceIntelligence | null;
  vinculados: string[];
  resolveAntecedente: (id: string) => Antecedente | undefined;
  garantiaData?: GarantiaData;
  monthlyView?: number | null; // number of months, null/undefined = no monthly
}

function formatARS(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}

/* ─── Section Header ─── */
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-2 h-2 bg-blue-700 rounded-full shrink-0" />
      <h3 className="font-bold uppercase text-xs tracking-widest text-gray-700" style={{ letterSpacing: '0.15em' }}>{title}</h3>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  );
}

/* ─── Score Bar ─── */
function ScoreBar({ label, score, max = 10 }: { label: string; score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-600 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-semibold text-gray-700">{score}/{max}</span>
    </div>
  );
}

const NotaCotizacion = forwardRef<HTMLDivElement, Props>(({
  licitacion, items, ivaRate, subtotal, ivaAmount, total,
  techData, companyData, analysis, marcoLegal, marcoLegalChecks,
  priceIntelligence, vinculados, resolveAntecedente, garantiaData, monthlyView,
}, ref) => {
  const months = monthlyView && monthlyView > 1 ? monthlyView : 0;
  return (
    <div ref={ref} className="bg-white border border-gray-200 rounded-xl overflow-hidden text-sm leading-relaxed print:border-none print:shadow-none print:rounded-none print:p-0">
      {/* ─── Blue accent bar ─── */}
      <div className="h-2 bg-gradient-to-r from-blue-700 to-blue-500 print:bg-blue-700" />

      <div className="p-8">
        {/* ─── Header ─── */}
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div>
            <h2 className="text-xl font-bold tracking-wide text-gray-900" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.1em' }}>
              NOTA DE COTIZACION
            </h2>
            {companyData.nombre && (
              <p className="text-sm text-gray-500 mt-1 font-medium">{companyData.nombre}</p>
            )}
          </div>
          <p className="text-sm text-gray-500 text-right">
            Mendoza, {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* ─── Recipient ─── */}
        <div className="mb-6 space-y-2">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-semibold text-gray-800">Sres. {licitacion.organization || 'Organismo licitante'}</p>
            <p className="text-gray-600 mt-1">Ref: {licitacion.title}</p>
            {licitacion.objeto && <p className="text-gray-500 text-xs mt-0.5">Objeto: {licitacion.objeto}</p>}
          </div>
        </div>

        {/* ─── Salutation ─── */}
        <div className="mb-6">
          <p className="text-justify">
            De nuestra mayor consideracion: por medio de la presente, <strong>{companyData.nombre || '[EMPRESA]'}</strong>
            {companyData.cuit ? ` (CUIT: ${companyData.cuit})` : ''}
            {companyData.domicilio ? `, con domicilio en ${companyData.domicilio}` : ''}
            , tiene el agrado de cotizar lo siguiente:
          </p>
        </div>

        {/* ─── Items Table ─── */}
        <div className="mb-8">
          <SectionHeader title="Detalle de la Oferta" />

          {/* Monthly breakdown table */}
          {months > 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2 font-medium">
                Contrato: {months} meses · {formatARS(subtotal / months)}/mes
              </p>
              <div className="rounded-xl overflow-hidden border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-blue-700 text-white">
                      <th className="px-2 py-2 text-left font-semibold sticky left-0 bg-blue-700 min-w-[180px]">Item</th>
                      {Array.from({ length: months }, (_, m) => (
                        <th key={m} className="px-2 py-2 text-right font-semibold min-w-[100px]">Mes {m + 1}</th>
                      ))}
                      <th className="px-2 py-2 text-right font-semibold min-w-[110px] bg-blue-800">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const itemTotal = (item.cantidad || 0) * (item.precio_unitario || 0);
                      const perMonth = itemTotal / months;
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                          <td className="px-2 py-1.5 text-gray-800 font-medium sticky left-0 bg-inherit truncate max-w-[180px]" title={item.descripcion}>
                            {idx + 1}. {item.descripcion || '-'}
                          </td>
                          {Array.from({ length: months }, (_, m) => (
                            <td key={m} className="px-2 py-1.5 text-right tabular-nums text-gray-600">{formatARS(perMonth)}</td>
                          ))}
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-gray-800 bg-blue-50">{formatARS(itemTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-700 text-white font-bold">
                      <td className="px-2 py-2 sticky left-0 bg-blue-700">TOTAL MENSUAL</td>
                      {Array.from({ length: months }, (_, m) => (
                        <td key={m} className="px-2 py-2 text-right tabular-nums">{formatARS(subtotal / months)}</td>
                      ))}
                      <td className="px-2 py-2 text-right tabular-nums bg-blue-800">{formatARS(subtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Flat items table (always shown as summary, or as primary when no monthly) */}
          <div className="rounded-xl overflow-hidden border border-gray-200">
            {months > 0 && <p className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wide">Resumen por item</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-700 text-white">
                  <th className="px-3 py-2.5 text-center w-10 font-semibold">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Descripcion</th>
                  <th className="px-3 py-2.5 text-center w-16 font-semibold">Cant.</th>
                  <th className="px-3 py-2.5 text-center w-14 font-semibold">Ud.</th>
                  <th className="px-3 py-2.5 text-right w-28 font-semibold">P.Unitario</th>
                  <th className="px-3 py-2.5 text-right w-28 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                    <td className="px-3 py-2 text-center text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 text-gray-800">{item.descripcion || '-'}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{item.cantidad}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{item.unidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatARS(item.precio_unitario || 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatARS((item.cantidad || 0) * (item.precio_unitario || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Totals */}
            <div className="border-t-2 border-gray-200">
              <div className="flex justify-end">
                <div className="w-72">
                  <div className="flex justify-between px-4 py-1.5 text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatARS(subtotal)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-1.5 text-sm text-gray-600">
                    <span>IVA ({ivaRate}%)</span>
                    <span className="tabular-nums">{formatARS(ivaAmount)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3 bg-blue-700 text-white font-bold text-base rounded-b-xl">
                    <span>TOTAL</span>
                    <span className="tabular-nums">{formatARS(total)}</span>
                  </div>
                  {months > 0 && (
                    <div className="flex justify-between px-4 py-2 text-sm text-blue-700 font-medium bg-blue-50 rounded-b-xl">
                      <span>{months} meses</span>
                      <span className="tabular-nums">{formatARS(subtotal / months)}/mes</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Marco Legal ─── */}
        {marcoLegal && (
          <div className="mb-6">
            <SectionHeader title="Marco Legal" />
            <div className="space-y-1.5 text-sm">
              {marcoLegal.encuadre_legal && <p><span className="text-gray-500 font-semibold text-xs">Encuadre:</span> {marcoLegal.encuadre_legal}</p>}
              {marcoLegal.tipo_procedimiento_explicado && <p><span className="text-gray-500 font-semibold text-xs">Procedimiento:</span> {marcoLegal.tipo_procedimiento_explicado}</p>}
              {marcoLegal.normativa_aplicable && marcoLegal.normativa_aplicable.length > 0 && (
                <p className="text-xs text-gray-600">Normativa: {marcoLegal.normativa_aplicable.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Documentacion ─── */}
        {marcoLegal?.documentacion_obligatoria && marcoLegal.documentacion_obligatoria.length > 0 && (
          <div className="mb-6">
            <SectionHeader title="Documentacion Adjunta" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {marcoLegal.documentacion_obligatoria.map((doc, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1">
                  <span className={`w-5 h-5 flex items-center justify-center rounded text-xs ${marcoLegalChecks[`doc-${i}`] ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                    {marcoLegalChecks[`doc-${i}`] ? '✓' : '○'}
                  </span>
                  <span>{doc.documento}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Garantias ─── */}
        {(garantiaData && (garantiaData.oferta_monto > 0 || garantiaData.cumplimiento_monto > 0)) ? (
          <div className="mb-6">
            <SectionHeader title="Garantias" />
            <div className="space-y-1.5">
              {garantiaData.oferta_monto > 0 && (
                <div className="flex justify-between">
                  <span>Garantia de Oferta ({garantiaData.oferta_pct}%)</span>
                  <span className="font-semibold">{formatARS(garantiaData.oferta_monto)}</span>
                </div>
              )}
              {garantiaData.cumplimiento_monto > 0 && (
                <div className="flex justify-between">
                  <span>Garantia de Cumplimiento ({garantiaData.cumplimiento_pct}%)</span>
                  <span className="font-semibold">{formatARS(garantiaData.cumplimiento_monto)}</span>
                </div>
              )}
              <p className="text-xs text-gray-500">Forma: {garantiaData.forma}</p>
            </div>
          </div>
        ) : marcoLegal?.garantias_requeridas && marcoLegal.garantias_requeridas.length > 0 ? (
          <div className="mb-6">
            <SectionHeader title="Garantias" />
            <div className="space-y-1">
              {marcoLegal.garantias_requeridas.map((g, i) => (
                <p key={i} className="text-sm">{g.tipo}: {g.porcentaje || 'Segun pliego'}{g.forma ? ` (${g.forma})` : ''}</p>
              ))}
            </div>
          </div>
        ) : null}

        {/* ─── Propuesta Tecnica ─── */}
        {(techData.methodology || techData.plazo || techData.lugar) && (
          <div className="mb-6">
            <SectionHeader title="Propuesta Tecnica" />
            {techData.methodology && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Metodologia</p>
                {techData.methodology.includes('\n') ? (
                  <ol className="space-y-2">
                    {techData.methodology.split('\n').filter(l => l.trim()).map((line, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                        <span className="text-sm text-gray-700">{line.replace(/^\d+[\.\)\-]\s*/, '')}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-justify text-gray-700">{techData.methodology}</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {techData.plazo && (
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <svg className="w-5 h-5 mx-auto mb-1 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-xs text-gray-500 font-semibold">Plazo</p>
                  <p className="text-sm font-medium text-gray-800">{techData.plazo}</p>
                </div>
              )}
              {techData.lugar && (
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <svg className="w-5 h-5 mx-auto mb-1 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <p className="text-xs text-gray-500 font-semibold">Lugar</p>
                  <p className="text-sm font-medium text-gray-800">{techData.lugar}</p>
                </div>
              )}
              {techData.validez && (
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <svg className="w-5 h-5 mx-auto mb-1 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <p className="text-xs text-gray-500 font-semibold">Validez</p>
                  <p className="text-sm font-medium text-gray-800">{techData.validez} dias</p>
                </div>
              )}
            </div>
            {techData.notas && (
              <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">Condiciones especiales</p>
                <p className="text-sm text-gray-700 text-justify">{techData.notas}</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Antecedentes y Competencia ─── */}
        {vinculados.length > 0 && (
          <div className="mb-6">
            <SectionHeader title="Antecedentes y Experiencia" />
            <p className="text-sm text-justify mb-3">
              El monto de nuestra oferta se encuentra dentro del presupuesto oficial establecido para la presente contratacion.
              {companyData.nombre ? ` ${companyData.nombre}` : ' Nuestra empresa'} cuenta con amplia trayectoria y experiencia
              comprobable en proyectos de similar envergadura, lo que nos permite garantizar el cumplimiento de los
              requerimientos establecidos en el pliego de condiciones.
              {priceIntelligence?.price_range && (
                ` Nuestros precios son competitivos y se encuentran alineados con los valores de mercado para contrataciones de esta naturaleza.`
              )}
            </p>

            <p className="text-xs font-semibold text-gray-600 mb-2">Proyectos de referencia ({vinculados.length}):</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {vinculados.map(id => {
                const ant = resolveAntecedente(id);
                if (!ant) return (
                  <div key={id} className="border-l-4 border-gray-300 bg-gray-50 rounded-r-lg px-3 py-2 text-xs text-gray-400">Cargando...</div>
                );
                return (
                  <div key={id} className="border-l-4 border-blue-600 bg-blue-50/30 rounded-r-lg px-3 py-2.5 flex gap-3 items-start">
                    {ant.image_url && (
                      <img src={ant.image_url} alt="" className="w-12 h-12 object-cover rounded-md shrink-0 bg-gray-200"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-xs line-clamp-1">{ant.title || ant.objeto || 'Antecedente'}</p>
                      {ant.organization && <p className="text-xs text-gray-500 line-clamp-1">{ant.organization}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        {ant.category && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{ant.category}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Company Data ─── */}
        {companyData.nombre && (
          <div className="mb-6">
            <SectionHeader title="Datos del Oferente" />
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-base font-bold text-gray-900 mb-2">{companyData.nombre}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                {companyData.cuit && <p><span className="text-gray-400 text-xs">CUIT:</span> {companyData.cuit}</p>}
                {companyData.domicilio && <p><span className="text-gray-400 text-xs">Domicilio:</span> {companyData.domicilio}</p>}
                {companyData.telefono && <p><span className="text-gray-400 text-xs">Tel:</span> {companyData.telefono}</p>}
                {companyData.email && <p><span className="text-gray-400 text-xs">Email:</span> {companyData.email}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ─── Signature ─── */}
        <div className="mt-10 pt-4">
          <p className="text-sm text-gray-500 mb-1">Sin otro particular, saludamos atentamente.</p>
          <div className="mt-10 w-64">
            <div className="border-t border-gray-800" />
            <p className="text-center mt-1 text-xs text-gray-600">Firma y sello</p>
            {companyData.nombre && <p className="text-center text-xs font-medium">{companyData.nombre}</p>}
          </div>
        </div>
      </div>

      {/* ─── Competitiveness Summary (screen only) ─── */}
      {analysis && (
        <div className="border-t border-gray-100 p-6 bg-gray-50 print:hidden">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Evaluacion IA</h4>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${analysis.win_probability >= 70 ? 'text-emerald-600' : analysis.win_probability >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                {analysis.win_probability}%
              </span>
              <span className="text-xs text-gray-500">probabilidad</span>
            </div>
          </div>
          {/* Win probability bar */}
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full rounded-full transition-all ${analysis.win_probability >= 70 ? 'bg-emerald-500' : analysis.win_probability >= 40 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${analysis.win_probability}%` }}
            />
          </div>
          <div className="space-y-2">
            <ScoreBar label="Precio" score={(analysis.precio || { score: 0 }).score} />
            <ScoreBar label="Metodologia" score={(analysis.metodologia || { score: 0 }).score} />
            <ScoreBar label="Empresa" score={(analysis.empresa || { score: 0 }).score} />
            <ScoreBar label="Cronograma" score={(analysis.cronograma || { score: 0 }).score} />
          </div>
          {analysis.veredicto && (
            <p className="mt-3 text-sm font-medium text-gray-700">{analysis.veredicto}</p>
          )}
        </div>
      )}
    </div>
  );
});

NotaCotizacion.displayName = 'NotaCotizacion';
export default NotaCotizacion;
