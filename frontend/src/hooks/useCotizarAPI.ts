const COTIZAR_API = '/cotizar/api';

export interface CotizarItem {
  id?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal?: number;
}

export interface CommercialOffer {
  basePrice?: number;
  taxRate?: number;
  total?: number;
  subtotal?: number;
  taxAmount?: number;
}

export interface CotizarBid {
  id: string;
  tenderId: string;
  licitometroId?: string;
  items: CotizarItem[];
  iva_rate: number;
  subtotal: number;
  iva_amount: number;
  total: number;
  company_name?: string;
  commercialOffer?: CommercialOffer;
  created_at?: string;
  updated_at?: string;
}

export interface CotizarTender {
  id: string;
  licitometroId: string;
  title?: string;
  organization?: string;
}

export interface MarketRates {
  usd: number;
  eur?: number;
  updated_at: string;
}

export interface CurrencyRate {
  pair: string;
  buy?: number;
  sell?: number;
  value?: number;
}

export interface InflationData {
  rate: number;
  period: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${COTIZAR_API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`cotizar-api ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function parseCurrenciesToRates(currencies: CurrencyRate[]): MarketRates {
  const usdEntry = currencies.find(c =>
    c.pair?.toLowerCase().includes('usd') &&
    c.pair?.toLowerCase().includes('ars') &&
    c.pair?.toLowerCase().includes('oficial')
  ) || currencies.find(c =>
    c.pair?.toLowerCase().includes('usd')
  );
  return {
    usd: usdEntry?.sell ?? usdEntry?.value ?? usdEntry?.buy ?? 0,
    updated_at: new Date().toISOString(),
  };
}

export function useCotizarAPI() {
  return {
    async syncLicitacion(licitacion: {
      id: string;
      title: string;
      objeto?: string | null;
      organization?: string;
      opening_date?: string | null;
      budget?: number | null;
      items?: Array<Record<string, unknown>>;
    }): Promise<CotizarTender> {
      const tenderId = `lm-${licitacion.id}`;
      // Upsert the tender — POST /api/tenders creates or updates
      return apiFetch<CotizarTender>('/tenders', {
        method: 'POST',
        body: JSON.stringify({
          id: tenderId,
          title: licitacion.objeto || licitacion.title,
          agency: licitacion.organization || '',
          region: 'Mendoza',
          budget: licitacion.budget || 0,
          closingDate: licitacion.opening_date || null,
          status: 'abierta',
          licitometroId: licitacion.id,
        }),
      });
    },

    async listBids(tenderId?: string): Promise<CotizarBid[]> {
      const qs = tenderId ? `?tenderId=${encodeURIComponent(tenderId)}` : '';
      return apiFetch<CotizarBid[]>(`/bids${qs}`);
    },

    async createBid(tenderId: string): Promise<CotizarBid> {
      return apiFetch<CotizarBid>('/bids', {
        method: 'POST',
        body: JSON.stringify({ tenderId }),
      });
    },

    async updateBid(id: string, data: {
      items?: CotizarItem[];
      commercialOffer?: { basePrice: number; taxRate: number };
      company_name?: string;
    }): Promise<CotizarBid> {
      // PUT /bids/:id doesn't exist — use calculate endpoint with basePrice
      const basePrice = data.commercialOffer?.basePrice ?? 0;
      return apiFetch<CotizarBid>(`/bids/${id}/calculate`, {
        method: 'POST',
        body: JSON.stringify({
          labor: basePrice,
          materials: 0,
          equipment: 0,
          overhead: 0,
          other: 0,
        }),
      });
    },

    async calculateBid(id: string, costs?: {
      labor?: number;
      materials?: number;
      equipment?: number;
      overhead?: number;
      other?: number;
    }): Promise<CotizarBid> {
      return apiFetch<CotizarBid>(`/bids/${id}/calculate`, {
        method: 'POST',
        body: costs ? JSON.stringify(costs) : undefined,
      });
    },

    async generatePDF(id: string): Promise<Blob | string> {
      const res = await fetch(`${COTIZAR_API}/bids/${id}/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pdf' }),
      });
      if (!res.ok) throw new Error(`PDF generation failed: ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const json = await res.json();
        return json.url || json.download_url || '';
      }
      return res.blob();
    },

    async getMarketRates(): Promise<MarketRates> {
      try {
        const currencies = await apiFetch<CurrencyRate[]>('/market/currencies');
        return parseCurrenciesToRates(currencies);
      } catch {
        // Fallback: try legacy endpoint
        return apiFetch<MarketRates>('/market/rates');
      }
    },

    async getInflation(): Promise<InflationData> {
      return apiFetch<InflationData>('/market/inflation');
    },
  };
}
