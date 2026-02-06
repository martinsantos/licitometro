# Testing de Scrapers - MENDOZA

**Fecha:** 2026-02-05
**Estado:** ✅ Funcionando

---

## Resultados de Testing

### ✅ Scrapers Funcionando

| Scraper | Estado | Resultado | Tiempo |
|---------|--------|-----------|--------|
| **Boletín Oficial Mendoza** | ✅ | 4 licitaciones | ~5s |
| **OSEP** | ✅ | 11 licitaciones | ~10s |
| **COMPR.AR Mendoza** | ✅ | ~85 licitaciones | ~2-3 min |

### ⚠️ Scrapers con Limitaciones

| Scraper | Estado | Notas |
|---------|--------|-------|
| **AYSAM** | ⚠️ | El sitio cambió o usa protección. URLs devuelven 404 |
| **UNCuyo** | ⚠️ | No testeado completamente |
| **Vialidad Mendoza** | ⚠️ | No testeado completamente |

---

## Cómo Probar

### 1. Verificar que los scrapers están configurados

```bash
python3 scripts/test_scrapers.py
```

Deberías ver:
```
✅ Boletin Oficial Mendoza: Scraper creado correctamente
✅ COMPR.AR Mendoza: Scraper creado correctamente
✅ AYSAM: Scraper creado correctamente
✅ OSEP: Scraper creado correctamente
✅ UNCuyo: Scraper creado correctamente
✅ Vialidad Mendoza: Scraper creado correctamente
```

### 2. Ejecutar un scraper específico

```bash
# Boletín Oficial (rápido)
python3 scripts/test_scrapers.py --run 'Boletin Oficial Mendoza'

# OSEP (rápido)
python3 scripts/test_scrapers.py --run 'OSEP'

# COMPR.AR Mendoza (tarda 2-3 minutos)
python3 scripts/test_scrapers.py --run 'COMPR.AR Mendoza'
```

### 3. Ejecutar desde el Panel Admin

1. Iniciar backend:
```bash
cd backend && python3 server.py
```

2. Iniciar frontend:
```bash
cd frontend && npm start
```

3. Abrir: http://localhost:3000/admin

4. Ir a "Monitoreo del Scheduler"

5. Click en "Ejecutar Ahora" en cualquier scraper

---

## Endpoints API para Testing

```bash
# Ver estado del scheduler
curl http://localhost:8001/api/scheduler/status

# Ejecutar scraper manualmente
curl -X POST http://localhost:8001/api/scheduler/trigger/Boletin%20Oficial%20Mendoza

# Ver ejecuciones recientes
curl http://localhost:8001/api/scheduler/runs
```

---

## Troubleshooting

### Error: "Can't instantiate abstract class"
El scraper no implementa todos los métodos abstractos. Verificar que `extract_links` y `get_next_page_url` estén definidos.

### Error: "'HttpUrl' object has no attribute 'lower'"
El factory está tratando de llamar `.lower()` en un objeto HttpUrl. Debe usar `str(config.url).lower()`.

### Error: "No specific scraper found"
La URL o el nombre del scraper no coinciden con ningún patrón en `scraper_factory.py`. Verificar que el nombre/URL esté correcto.

### Timeout en COMPR.AR Mendoza
Es normal. El scraper usa Selenium para navegar el sitio y extraer URLs de PLIEGO. Puede tardar 2-3 minutos.

---

## Recomendaciones

1. **Usar Boletín Oficial y OSEP** para testing rápido (funcionan en segundos)
2. **COMPR.AR Mendoza** es el más completo pero tarda más
3. **AYSAM** puede necesitar actualización si cambió el sitio web
4. Los scrapers guardan resultados en MongoDB automáticamente

---

*Documento creado: 2026-02-05*
