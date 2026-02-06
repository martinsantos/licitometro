"""
ComprasApps Mendoza Scraper - Buscador de Licitaciones hli00049

Este scraper está diseñado para capturar licitaciones desde el sistema
ComprasApps de Mendoza (GeneXus servlet hli00049).

URL: https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049

NOTA: Este sitio tiene restricciones de red y solo es accesible desde
IPs autorizadas (red provincial o VPN configurada). El scraper funcionará
cuando se ejecute desde una red con acceso permitido.

Características:
- Búsqueda por: año fiscal, número licitación, CUC, fechas de apertura
- Filtros por: estado (vigentes, en trámite, adjudicadas), tipo contratación
- Soporte para navegación paginada
- Extracción de detalles completos de cada licitación
"""

from typing import List, Dict, Any, Optional
import asyncio
import logging
from bs4 import BeautifulSoup
from urllib.parse import urljoin, parse_qs, urlparse
from datetime import datetime, timedelta
import re
import uuid
import sys
import hashlib
from pathlib import Path
import os

# Add parent directory to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.scraper_config import ScraperConfig
from models.licitacion import LicitacionCreate
from scrapers.base_scraper import BaseScraper
from utils.dates import parse_date_guess, last_business_days_set

logger = logging.getLogger("scraper.comprasapps_mendoza")


class ComprasAppsMendozaScraper(BaseScraper):
    """
    Scraper for ComprasApps Mendoza bidding search system.

    This scraper handles the GeneXus-based servlet at hli00049 which provides
    a public search interface for procurement processes without login.

    Search Parameters (GeneXus form fields):
    - WAnioFiscal: Fiscal year (e.g., 2026)
    - WNroLicitacion: Bidding number
    - WCUC: Unique code
    - WFecAperDesde: Opening date from
    - WFecAperHasta: Opening date to
    - WEstado: Status (1=Vigentes, 2=En Trámite, 3=Adjudicadas)
    - WTipoContratacion: Contract type
    - WObjetoContratacion: Contract object/category
    """

    BASE_URL = "https://comprasapps.mendoza.gov.ar/Compras/servlet/hli00049"

    # Estado mappings
    ESTADOS = {
        "vigentes": "1",
        "en_tramite": "2",
        "adjudicadas": "3",
        "todas": ""
    }

    # Tipo contratación mappings (common GeneXus values)
    TIPOS_CONTRATACION = {
        "licitacion_publica": "1",
        "licitacion_privada": "2",
        "contratacion_directa": "3",
        "concurso": "4",
        "todas": ""
    }

    def __init__(self, config: ScraperConfig):
        super().__init__(config)
        self.session_initialized = False
        self.gx_state = {}  # GeneXus state variables

    async def _init_session(self) -> Optional[str]:
        """Initialize session and get initial page with GeneXus state."""
        try:
            html = await self.fetch_page(self.BASE_URL)
            if html:
                self._parse_gx_state(html)
                self.session_initialized = True
                logger.info("Session initialized successfully")
            return html
        except Exception as e:
            logger.error(f"Failed to initialize session: {e}")
            return None

    def _parse_gx_state(self, html: str):
        """Parse GeneXus state variables from HTML."""
        soup = BeautifulSoup(html, 'html.parser')

        # Find all hidden inputs that are part of GeneXus state
        for inp in soup.find_all('input', {'type': 'hidden'}):
            name = inp.get('name', '')
            value = inp.get('value', '')
            if name:
                self.gx_state[name] = value

        # Also look for GeneXus-specific state in meta tags or scripts
        for script in soup.find_all('script'):
            text = script.string or ''
            # Look for gx.evt.setGridId or similar patterns
            gx_matches = re.findall(r"gx\.(?:O|evt)\.(set\w+|ajax)\(['\"]([^'\"]+)['\"]", text)
            for match in gx_matches:
                if len(match) >= 2:
                    self.gx_state[f'_gx_{match[0]}'] = match[1]

    def _build_search_params(self,
                              anio_fiscal: Optional[int] = None,
                              nro_licitacion: Optional[str] = None,
                              cuc: Optional[str] = None,
                              fecha_desde: Optional[datetime] = None,
                              fecha_hasta: Optional[datetime] = None,
                              estado: str = "vigentes",
                              tipo_contratacion: str = "todas") -> Dict[str, str]:
        """Build search parameters for the GeneXus form."""
        params = dict(self.gx_state)  # Start with GeneXus state

        # Current year if not specified
        if anio_fiscal is None:
            anio_fiscal = datetime.now().year

        params['WAnioFiscal'] = str(anio_fiscal)

        if nro_licitacion:
            params['WNroLicitacion'] = nro_licitacion

        if cuc:
            params['WCUC'] = cuc

        if fecha_desde:
            params['WFecAperDesde'] = fecha_desde.strftime('%d/%m/%Y')

        if fecha_hasta:
            params['WFecAperHasta'] = fecha_hasta.strftime('%d/%m/%Y')

        params['WEstado'] = self.ESTADOS.get(estado, "")
        params['WTipoContratacion'] = self.TIPOS_CONTRATACION.get(tipo_contratacion, "")

        # GeneXus event for search
        params['BUTTON1'] = 'Buscar'

        return params

    async def _do_search(self, params: Dict[str, str]) -> Optional[str]:
        """Execute search with given parameters."""
        try:
            async with self.session.post(
                self.BASE_URL,
                data=params,
                headers={
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': self.BASE_URL
                }
            ) as response:
                if response.status == 200:
                    html = await response.text()
                    self._parse_gx_state(html)  # Update state
                    return html
                else:
                    logger.error(f"Search failed with status {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Search request failed: {e}")
            return None

    def _extract_results_from_table(self, html: str) -> List[Dict[str, Any]]:
        """Extract bidding results from the HTML table."""
        soup = BeautifulSoup(html, 'html.parser')
        results = []

        # GeneXus typically uses specific table IDs or classes
        # Common patterns: GridContainer, gxGridMain, or by name pattern
        table = None

        # Try various table identifiers
        table_patterns = [
            {'class_': re.compile(r'Grid|gx-grid', re.I)},
            {'id': re.compile(r'Grid|Table', re.I)},
            {'class_': 'WorkWith'},
        ]

        for pattern in table_patterns:
            table = soup.find('table', pattern)
            if table:
                break

        if not table:
            # Fallback: find any table with data rows
            tables = soup.find_all('table')
            for t in tables:
                rows = t.find_all('tr')
                if len(rows) > 2:  # Header + at least one data row
                    table = t
                    break

        if not table:
            logger.warning("No results table found in HTML")
            return results

        rows = table.find_all('tr')

        # Determine header row
        headers = []
        header_row = rows[0] if rows else None
        if header_row:
            header_cells = header_row.find_all(['th', 'td'])
            headers = [cell.get_text(' ', strip=True).lower() for cell in header_cells]

        # Map common header names to our fields
        header_map = {}
        header_patterns = {
            'numero': ['nro', 'número', 'numero', 'n°', '#'],
            'titulo': ['objeto', 'descripción', 'descripcion', 'titulo', 'título'],
            'tipo': ['tipo', 'procedimiento'],
            'fecha_apertura': ['apertura', 'fecha apertura', 'fec. apert'],
            'estado': ['estado', 'situación', 'situacion'],
            'organismo': ['organismo', 'entidad', 'repartición', 'reparticion'],
            'monto': ['monto', 'presupuesto', 'importe'],
            'cuc': ['cuc', 'código único', 'codigo unico'],
        }

        for idx, header in enumerate(headers):
            header_lower = header.lower()
            for field, patterns in header_patterns.items():
                if any(p in header_lower for p in patterns):
                    header_map[field] = idx
                    break

        # Parse data rows
        for row in rows[1:]:  # Skip header
            cells = row.find_all('td')
            if len(cells) < 3:  # Need at least 3 columns
                continue

            result = {}

            # Extract by mapped headers
            for field, idx in header_map.items():
                if idx < len(cells):
                    result[field] = cells[idx].get_text(' ', strip=True)

            # If no mapping, try positional extraction
            if not result.get('numero'):
                result['numero'] = cells[0].get_text(' ', strip=True) if len(cells) > 0 else ''
            if not result.get('titulo'):
                # Title is usually the longest text cell
                texts = [(i, len(c.get_text(' ', strip=True))) for i, c in enumerate(cells)]
                texts.sort(key=lambda x: x[1], reverse=True)
                if texts:
                    result['titulo'] = cells[texts[0][0]].get_text(' ', strip=True)

            # Extract link to detail page
            detail_link = None
            for cell in cells:
                link = cell.find('a', href=True)
                if link:
                    href = link.get('href', '')
                    if href and not href.startswith('javascript:'):
                        detail_link = urljoin(self.BASE_URL, href)
                        break
                    # Check for JavaScript click handler
                    onclick = link.get('onclick', '')
                    if onclick:
                        result['_onclick'] = onclick

            if detail_link:
                result['detail_url'] = detail_link

            # Extract any postback targets
            for cell in cells:
                link = cell.find('a', href=True)
                if link:
                    href = link.get('href', '')
                    # GeneXus postback pattern
                    m = re.search(r"javascript:gx\.evt\.click\('([^']+)'", href)
                    if m:
                        result['_gx_target'] = m.group(1)
                        break

            if result.get('numero') or result.get('titulo'):
                results.append(result)

        logger.info(f"Extracted {len(results)} results from table")
        return results

    def _extract_pagination_info(self, html: str) -> Dict[str, Any]:
        """Extract pagination information from HTML."""
        soup = BeautifulSoup(html, 'html.parser')

        pagination = {
            'current_page': 1,
            'total_pages': 1,
            'has_next': False,
            'has_prev': False,
            'page_links': []
        }

        # Look for pagination elements
        # GeneXus patterns: gx-grid-paging, Pager, pagination
        pager = soup.find(['div', 'span', 'td'], class_=re.compile(r'pag|Pager', re.I))
        if not pager:
            pager = soup.find(['div', 'span', 'td'], id=re.compile(r'pag|Pager', re.I))

        if pager:
            # Find page links
            links = pager.find_all('a', href=True)
            for link in links:
                text = link.get_text(' ', strip=True)
                href = link.get('href', '')

                if text.isdigit():
                    pagination['page_links'].append({
                        'page': int(text),
                        'href': href
                    })
                elif '>' in text or 'siguiente' in text.lower():
                    pagination['has_next'] = True
                elif '<' in text or 'anterior' in text.lower():
                    pagination['has_prev'] = True

            # Find current page (usually highlighted differently)
            current = pager.find(['span', 'b', 'strong'], string=re.compile(r'^\d+$'))
            if current:
                try:
                    pagination['current_page'] = int(current.get_text(strip=True))
                except ValueError:
                    pass

            if pagination['page_links']:
                pagination['total_pages'] = max(p['page'] for p in pagination['page_links'])

        return pagination

    async def _fetch_detail(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """Fetch and parse detail page for a result."""
        detail = {}

        # Try direct URL first
        if result.get('detail_url'):
            html = await self.fetch_page(result['detail_url'])
            if html:
                detail = self._parse_detail_page(html)
                detail['_source_url'] = result['detail_url']

        # If no URL, try GeneXus postback
        elif result.get('_gx_target'):
            params = dict(self.gx_state)
            params['gxEvent'] = result['_gx_target']
            html = await self._do_search(params)
            if html:
                detail = self._parse_detail_page(html)

        return detail

    def _parse_detail_page(self, html: str) -> Dict[str, Any]:
        """Parse detail information from a licitacion detail page."""
        soup = BeautifulSoup(html, 'html.parser')
        detail = {}

        # GeneXus pages often use label/value pairs in forms or divs

        # Pattern 1: Label-Value in form groups
        for label in soup.find_all(['label', 'span', 'td'], class_=re.compile(r'label|caption', re.I)):
            key = label.get_text(' ', strip=True).rstrip(':')
            if not key or len(key) < 2:
                continue

            # Find adjacent value element
            value_elem = label.find_next_sibling()
            if value_elem:
                value = value_elem.get_text(' ', strip=True)
                if value:
                    detail[key] = value

        # Pattern 2: Definition lists
        for dt in soup.find_all('dt'):
            key = dt.get_text(' ', strip=True).rstrip(':')
            dd = dt.find_next_sibling('dd')
            if dd and key:
                value = dd.get_text(' ', strip=True)
                if value:
                    detail[key] = value

        # Pattern 3: Table rows with label in first cell
        for row in soup.find_all('tr'):
            cells = row.find_all('td')
            if len(cells) >= 2:
                key = cells[0].get_text(' ', strip=True).rstrip(':')
                value = cells[1].get_text(' ', strip=True)
                if key and value and len(key) < 50:
                    detail[key] = value

        # Extract attached files
        attached_files = []
        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if any(ext in href.lower() for ext in ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip']):
                attached_files.append({
                    'name': a.get_text(' ', strip=True) or href.split('/')[-1],
                    'url': urljoin(self.BASE_URL, href),
                    'type': href.split('.')[-1].lower() if '.' in href else 'unknown'
                })

        if attached_files:
            detail['_attached_files'] = attached_files

        return detail

    def _create_licitacion(self, result: Dict[str, Any], detail: Dict[str, Any]) -> LicitacionCreate:
        """Create a LicitacionCreate object from extracted data."""

        # Map fields with fallbacks
        title = (
            detail.get('Objeto de la contratación') or
            detail.get('Objeto') or
            result.get('titulo') or
            result.get('numero', 'Proceso de compra')
        )

        organization = (
            detail.get('Organismo') or
            detail.get('Repartición') or
            detail.get('Entidad') or
            result.get('organismo') or
            'Gobierno de Mendoza'
        )

        numero = result.get('numero') or detail.get('Número') or detail.get('Nro. Licitación')

        description = (
            detail.get('Descripción') or
            detail.get('Objeto de la contratación') or
            title
        )

        # Parse dates
        fecha_apertura_raw = result.get('fecha_apertura') or detail.get('Fecha de Apertura')
        opening_date = parse_date_guess(fecha_apertura_raw) if fecha_apertura_raw else None

        fecha_pub_raw = detail.get('Fecha de Publicación') or detail.get('Fecha Publicación')
        publication_date = parse_date_guess(fecha_pub_raw) if fecha_pub_raw else opening_date or datetime.utcnow()

        # Type and status
        tipo = result.get('tipo') or detail.get('Tipo de Contratación') or 'Proceso de compra'
        estado = result.get('estado') or detail.get('Estado') or 'active'

        # Status mapping
        status = 'active'
        if estado:
            estado_lower = estado.lower()
            if 'adjudicad' in estado_lower:
                status = 'awarded'
            elif 'cerrad' in estado_lower or 'finaliz' in estado_lower:
                status = 'closed'
            elif 'cancelad' in estado_lower or 'desierto' in estado_lower:
                status = 'cancelled'

        # Source URL - prefer detail URL if available
        source_url = (
            detail.get('_source_url') or
            result.get('detail_url') or
            self.BASE_URL
        )

        # Content hash for deduplication
        content_hash = hashlib.md5(
            f"{title.lower().strip()}|{organization}|{publication_date.strftime('%Y%m%d')}".encode()
        ).hexdigest()

        # ID
        id_licitacion = numero or result.get('cuc') or str(uuid.uuid4())

        # Budget/Amount
        monto_raw = result.get('monto') or detail.get('Monto') or detail.get('Presupuesto Oficial')
        budget = None
        currency = 'ARS'
        if monto_raw:
            # Try to extract numeric value
            m = re.search(r'[\d.,]+', monto_raw.replace('.', '').replace(',', '.'))
            if m:
                try:
                    budget = float(m.group())
                except ValueError:
                    pass
            if 'USD' in monto_raw.upper() or 'U\$S' in monto_raw.upper():
                currency = 'USD'

        # Build metadata
        metadata = {
            'comprasapps_raw': result,
            'comprasapps_detail': detail,
            'comprasapps_cuc': result.get('cuc'),
        }

        # Attached files
        attached_files = detail.get('_attached_files', [])

        return LicitacionCreate(
            title=title,
            organization=organization,
            publication_date=publication_date,
            opening_date=opening_date,
            expedient_number=detail.get('Expediente') or detail.get('Número Expediente'),
            licitacion_number=numero,
            description=description,
            contact=detail.get('Contacto') or detail.get('Consultas'),
            source_url=source_url,
            canonical_url=source_url,
            source_urls={'comprasapps': source_url},
            url_quality='direct' if result.get('detail_url') else 'partial',
            content_hash=content_hash,
            status=status,
            location='Mendoza',
            attached_files=attached_files,
            id_licitacion=id_licitacion,
            jurisdiccion='Mendoza',
            tipo_procedimiento=tipo,
            tipo_acceso='ComprasApps',
            fecha_scraping=datetime.utcnow(),
            fuente='ComprasApps Mendoza',
            currency=currency,
            budget=budget,
            metadata=metadata,
        )

    async def run(self) -> List[LicitacionCreate]:
        """Execute the scraper and return list of licitaciones."""
        await self.setup()
        try:
            licitaciones: List[LicitacionCreate] = []

            logger.info("Starting ComprasApps Mendoza scraper")

            # Initialize session
            init_html = await self._init_session()
            if not init_html:
                logger.error("Failed to initialize session - site may be inaccessible from this network")
                return []

            # Get search parameters from config
            selectors = self.config.selectors or {}
            anio_fiscal = selectors.get('anio_fiscal')
            estado = selectors.get('estado', 'vigentes')
            tipo_contratacion = selectors.get('tipo_contratacion', 'todas')
            max_pages = int(selectors.get('max_pages', 10))
            fetch_details = selectors.get('fetch_details', True)

            # Date window from config
            window_days = int(selectors.get('business_days_window', 30))
            fecha_desde = datetime.now() - timedelta(days=window_days)
            fecha_hasta = datetime.now()

            # Build search parameters
            params = self._build_search_params(
                anio_fiscal=anio_fiscal,
                fecha_desde=fecha_desde,
                fecha_hasta=fecha_hasta,
                estado=estado,
                tipo_contratacion=tipo_contratacion
            )

            logger.info(f"Searching with params: anio={anio_fiscal}, estado={estado}, tipo={tipo_contratacion}")

            # Execute search
            search_html = await self._do_search(params)
            if not search_html:
                logger.error("Search request failed")
                return []

            # Extract results
            all_results = []
            current_page = 1

            results = self._extract_results_from_table(search_html)
            all_results.extend(results)
            logger.info(f"Page {current_page}: found {len(results)} results")

            # Handle pagination
            pagination = self._extract_pagination_info(search_html)

            while pagination['has_next'] and current_page < max_pages:
                current_page += 1

                # Find next page link
                next_page = None
                for pl in pagination['page_links']:
                    if pl['page'] == current_page:
                        next_page = pl
                        break

                if not next_page:
                    break

                # Navigate to next page
                await asyncio.sleep(self.config.wait_time)

                # Try to navigate via the page link
                # GeneXus typically uses JavaScript events
                if 'gx.evt' in next_page.get('href', ''):
                    m = re.search(r"gx\.evt\.click\('([^']+)'", next_page['href'])
                    if m:
                        nav_params = dict(self.gx_state)
                        nav_params['gxEvent'] = m.group(1)
                        page_html = await self._do_search(nav_params)
                        if page_html:
                            results = self._extract_results_from_table(page_html)
                            all_results.extend(results)
                            logger.info(f"Page {current_page}: found {len(results)} results")
                            pagination = self._extract_pagination_info(page_html)
                        else:
                            break
                else:
                    break

            logger.info(f"Total results found: {len(all_results)}")

            # Fetch details and create licitaciones
            seen_ids = set()

            for idx, result in enumerate(all_results):
                try:
                    # Fetch detail if configured
                    detail = {}
                    if fetch_details and (result.get('detail_url') or result.get('_gx_target')):
                        await asyncio.sleep(self.config.wait_time)
                        detail = await self._fetch_detail(result)
                        if idx < 3:
                            logger.info(f"Fetched detail for {result.get('numero', 'unknown')}")

                    # Create licitacion
                    lic = self._create_licitacion(result, detail)

                    if lic.id_licitacion not in seen_ids:
                        licitaciones.append(lic)
                        seen_ids.add(lic.id_licitacion)

                    if self.config.max_items and len(licitaciones) >= self.config.max_items:
                        break

                except Exception as e:
                    logger.error(f"Error processing result {idx}: {e}")
                    continue

            # Sort by publication date
            licitaciones.sort(key=lambda l: l.publication_date, reverse=True)

            logger.info(f"Scraper complete. Total licitaciones: {len(licitaciones)}")
            return licitaciones

        except Exception as e:
            logger.error(f"Scraper failed: {e}")
            return []
        finally:
            await self.cleanup()

    async def extract_licitacion_data(self, html: str, url: str) -> Optional[LicitacionCreate]:
        """Extract licitacion data from HTML - used for single page extraction."""
        detail = self._parse_detail_page(html)
        if detail:
            result = {'detail_url': url}
            return self._create_licitacion(result, detail)
        return None

    async def extract_links(self, html: str) -> List[str]:
        """Extract links to licitacion pages."""
        soup = BeautifulSoup(html, 'html.parser')
        links = []

        for a in soup.find_all('a', href=True):
            href = a.get('href', '')
            if href and not href.startswith('javascript:') and 'hli' in href:
                links.append(urljoin(self.BASE_URL, href))

        return list(dict.fromkeys(links))

    async def get_next_page_url(self, html: str, current_url: str) -> Optional[str]:
        """Get the URL of the next page for pagination."""
        pagination = self._extract_pagination_info(html)

        if pagination['has_next']:
            for pl in pagination['page_links']:
                if pl['page'] == pagination['current_page'] + 1:
                    href = pl.get('href', '')
                    if href and not href.startswith('javascript:'):
                        return urljoin(current_url, href)

        return None
