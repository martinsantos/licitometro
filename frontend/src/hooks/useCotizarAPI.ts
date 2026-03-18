const COTIZAR_API = '/cotizar/api';

export interface CotizarItem {
  id?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  subtotal?: number;
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
      return apiFetch<CotizarTender>('/licitometro/sync', {
        method: 'POST',
        body: JSON.stringify({
          licitometroId: licitacion.id,
          title: licitacion.objeto || licitacion.title,
          organization: licitacion.organization,
          openingDate: licitacion.opening_date,
          budget: licitacion.budget,
          items: licitacion.items || [],
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

    async updateBid(id: string, data: Partial<Pick<CotizarBid, 'items' | 'iva_rate' | 'company_name'>>): Promise<CotizarBid> {
      return apiFetch<CotizarBid>(`/bids/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    async calculateBid(id: string): Promise<CotizarBid> {
      return apiFetch<CotizarBid>(`/bids/${id}/calculate`, { method: 'POST' });
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
      return apiFetch<MarketRates>('/market/rates');
    },

    async getInflation(): Promise<InflationData> {
      return apiFetch<InflationData>('/market/inflation');
    },
  };
}
