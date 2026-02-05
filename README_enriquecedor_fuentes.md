# Enriquecedor de fuentes de datos

Este script automatiza el análisis técnico y el enriquecimiento de un relevamiento de fuentes de datos públicas de licitaciones en Argentina.

## ¿Qué hace?
- Analiza el archivo `docs/comprasargentina01.json` que contiene un listado de fuentes de datos públicas.
- Para cada fuente, detecta automáticamente los campos disponibles y faltantes accediendo a la URL indicada.
- Si los campos están marcados como "Requiere análisis técnico detallado", el script intenta obtenerlos automáticamente (analizando HTML, CSV, XLS, JSON, o navegando enlaces internos).
- Utiliza técnicas avanzadas de scraping, incluyendo Selenium para páginas dinámicas.
- Registra un log detallado de errores y limitaciones técnicas.
- Exporta un resumen en formato CSV para facilitar el análisis y la visualización.

## Archivos involucrados
- **Entrada:**
  - `docs/comprasargentina01.json` (listado de fuentes a analizar)
- **Salida:**
  - `docs/comprasargentina01.json` (enriquecido con los campos detectados)
  - `docs/analisis_fuentes_scraping.log` (log de errores y advertencias)
  - `docs/comprasargentina01_resumen.csv` (resumen tabular de los resultados)

## Dependencias
- Python 3
- requests
- beautifulsoup4
- pandas
- selenium (opcional, para scraping avanzado de páginas dinámicas)

Instalación de dependencias:
```bash
pip install requests beautifulsoup4 pandas selenium
```

Para scraping avanzado, asegúrate de tener instalado ChromeDriver y Google Chrome, o adapta el script para tu navegador preferido.

## Uso
1. Coloca el archivo `analisis_fuentes_scraping.py` en la raíz del proyecto.
2. Asegúrate de tener el archivo `docs/comprasargentina01.json` con el formato esperado.
3. Ejecuta el script:
   ```bash
   python3 analisis_fuentes_scraping.py
   ```
4. Revisa los archivos de salida en la carpeta `docs/`.

## Recomendaciones
- Si el script arroja errores de acceso o scraping, revisa el log para identificar si se requiere autenticación, scraping avanzado, o intervención manual.
- Puedes ajustar el script para seguir más enlaces internos o profundizar en la navegación según tus necesidades.
- El archivo CSV generado es ideal para análisis en Excel, Google Sheets o herramientas de BI.

---

**Autor:** Equipo Licitómetro

**Contacto:** contacto@licitometro.org 