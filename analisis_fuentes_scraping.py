import json
import requests
from bs4 import BeautifulSoup
import pandas as pd
import io
import csv
import os

# Intentar importar Selenium
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

LOG_PATH = "docs/analisis_fuentes_scraping.log"
CSV_PATH = "docs/comprasargentina01_resumen.csv"


def log_error(msg):
    with open(LOG_PATH, "a", encoding="utf-8") as logf:
        logf.write(msg + "\n")


def analizar_campos_fuente(fuente):
    url = fuente.get("url", "")
    tipo_acceso = fuente.get("tipo_acceso", "").lower()
    campos_detectados = []
    error = None

    def analizar_html(html, url_context):
        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table")
        if table:
            headers = [th.get_text(strip=True) for th in table.find_all("th")]
            if headers:
                return headers, None
            else:
                first_row = table.find("tr")
                if first_row:
                    return [td.get_text(strip=True) for td in first_row.find_all("td")], None
        # Si no hay tabla, buscar enlaces internos (máx 3)
        links = soup.find_all("a", href=True)
        checked = set()
        for link in links[:3]:
            href = link['href']
            if href.startswith("/"):
                next_url = url_context.rstrip("/") + href
            elif href.startswith("http"):
                next_url = href
            else:
                continue
            if next_url in checked:
                continue
            checked.add(next_url)
            try:
                r2 = requests.get(next_url, timeout=10)
                r2.raise_for_status()
                soup2 = BeautifulSoup(r2.text, "html.parser")
                table2 = soup2.find("table")
                if table2:
                    headers2 = [th.get_text(strip=True) for th in table2.find_all("th")]
                    if headers2:
                        return headers2, None
                    else:
                        first_row2 = table2.find("tr")
                        if first_row2:
                            return [td.get_text(strip=True) for td in first_row2.find_all("td")], None
            except Exception as e:
                log_error(f"Error siguiendo enlace {next_url}: {str(e)}")
        return ["No se detectaron tablas en la página principal ni en los primeros enlaces."], None

    try:
        if ("csv" in tipo_acceso or url.endswith(".csv")) and url.startswith("http"):
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            campos_detectados = list(df.columns)
        elif ("xls" in tipo_acceso or url.endswith(".xls") or url.endswith(".xlsx")) and url.startswith("http"):
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            df = pd.read_excel(io.BytesIO(r.content))
            campos_detectados = list(df.columns)
        elif ("json" in tipo_acceso or url.endswith(".json")) and url.startswith("http"):
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list) and data:
                campos_detectados = list(data[0].keys())
            elif isinstance(data, dict):
                campos_detectados = list(data.keys())
        elif ("portal web" in tipo_acceso or "scraping" in tipo_acceso or "html" in tipo_acceso) and url.startswith("http"):
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            campos_detectados, error = analizar_html(r.text, url)
            # Si no se detectaron tablas y Selenium está disponible, intentar con Selenium
            if (not campos_detectados or "No se detectaron tablas" in campos_detectados[0]) and SELENIUM_AVAILABLE:
                try:
                    chrome_options = Options()
                    chrome_options.add_argument("--headless")
                    chrome_options.add_argument('--no-sandbox')
                    chrome_options.add_argument('--disable-dev-shm-usage')
                    driver = webdriver.Chrome(options=chrome_options)
                    driver.get(url)
                    html = driver.page_source
                    campos_detectados, error = analizar_html(html, url)
                    driver.quit()
                except Exception as e:
                    error = f"Error con Selenium: {str(e)}"
                    log_error(f"Selenium error en {url}: {str(e)}")
            elif (not campos_detectados or "No se detectaron tablas" in campos_detectados[0]) and not SELENIUM_AVAILABLE:
                error = "Selenium no está instalado."
                log_error(f"Selenium no disponible para {url}")
        else:
            campos_detectados = ["No se pudo analizar automáticamente este tipo de fuente."]
    except Exception as e:
        campos_detectados = [f"Error al analizar: {str(e)}"]
        error = str(e)
        log_error(f"Error en {url}: {str(e)}")

    return campos_detectados, error


def main():
    # Limpiar log anterior
    if os.path.exists(LOG_PATH):
        os.remove(LOG_PATH)

    with open("docs/comprasargentina01.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    resumen = []

    for fuente in data["fuentes"]:
        # Analizar campos_faltantes
        error_faltantes = None
        error_disponibles = None
        if any("requiere análisis técnico detallado" in (c or "").lower() for c in fuente.get("campos_faltantes", [])):
            print(f"Analizando campos_faltantes: {fuente.get('nombre')}")
            campos, error_faltantes = analizar_campos_fuente(fuente)
            fuente["campos_faltantes"] = campos
        if any("requiere análisis técnico detallado" in (c or "").lower() for c in fuente.get("campos_disponibles", [])):
            print(f"Analizando campos_disponibles: {fuente.get('nombre')}")
            campos, error_disponibles = analizar_campos_fuente(fuente)
            fuente["campos_disponibles"] = campos
        resumen.append({
            "nombre": fuente.get("nombre", ""),
            "url": fuente.get("url", ""),
            "tecnologia_sugerida": fuente.get("tecnologia_sugerida", ""),
            "campos_disponibles": ", ".join(fuente.get("campos_disponibles", [])),
            "campos_faltantes": ", ".join(fuente.get("campos_faltantes", [])),
            "error_faltantes": error_faltantes or "",
            "error_disponibles": error_disponibles or ""
        })

    with open("docs/comprasargentina01.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Exportar resumen a CSV
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as csvfile:
        fieldnames = ["nombre", "url", "tecnologia_sugerida", "campos_disponibles", "campos_faltantes", "error_faltantes", "error_disponibles"]
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for row in resumen:
            writer.writerow(row)

if __name__ == "__main__":
    main() 