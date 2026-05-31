# Licitometro Core Estable - Runbook Operativo

## Objetivo

Mantener el nucleo critico Mendoza sin falsos verdes. Una fuente Core solo esta sana si la ultima corrida cumple su contrato de volumen, SLA, evidencia y calidad minima.

Fuentes Core:

- ComprasApps Mendoza: minimo 900 items, evidencia >= 95%.
- COMPR.AR Mendoza: minimo 50 items, documentos >= 85%, URL directa >= 90%, evidencia >= 95%.
- Boletin Oficial Mendoza: minimo 20 items, documentos 100%, evidencia 100%.

## Diagnostico Rapido

1. Abrir Admin -> Core Mza.
2. Revisar cola de reparacion:
   - `down`: fuente caida, sin corrida reciente o corrida fallida.
   - `at_risk`: corrida parcial o volumen bajo.
   - `up_degraded`: datos presentes pero contrato de calidad incumplido.
3. Confirmar ultimo run en Admin -> Scheduler, o por SSH:

```bash
ssh root@76.13.234.213 "cd /opt/licitometro && docker exec -w /app licitometro-backend-1 python3 scripts/deep_scraping_audit.py --probe-urls 0 --sample-items 3"
```

## Reparacion

Para una fuente con `partial`, `empty_suspicious` o volumen bajo:

1. Leer warnings/errors del ultimo run.
2. Comparar configuracion activa con el contrato:
   - `selectors.expected_min_items`
   - ventanas de busqueda
   - filtros por estado/tipo
   - URL policy y documentos
3. Ejecutar auditoria no ingestiva si el problema puede estar en scraping:

```bash
ssh root@76.13.234.213 "cd /opt/licitometro && docker exec -w /app licitometro-backend-1 python3 scripts/deep_scraping_audit.py --source 'Boletin Oficial Mendoza' --probe-urls 0 --sample-items 5"
```

4. Aplicar la correccion minima: config primero, codigo solo si el parser o contrato esta mal.
5. Relanzar corrida controlada desde Admin -> Scheduler, o via API/admin si corresponde.

## Backfills Minimos

Despues de reparar una fuente Core, correr primero en dry-run y despues aplicar si el conteo es razonable:

```bash
ssh root@76.13.234.213 "cd /opt/licitometro && docker exec -w /app licitometro-backend-1 python3 scripts/backfill_mendoza_core_evidence.py --dry-run"
ssh root@76.13.234.213 "cd /opt/licitometro && docker exec -w /app licitometro-backend-1 python3 scripts/backfill_mendoza_core_quality.py --dry-run"
```

Para ComprasApps vigente con detalle incompleto:

```bash
ssh root@76.13.234.213 "cd /opt/licitometro && docker exec -w /app licitometro-backend-1 python3 scripts/backfill_comprasapps_vigente_details.py --dry-run --limit 50"
```

## Validacion De Cierre

Una reparacion esta cerrada solo si:

- La ultima corrida queda `success`.
- `items_found` supera el minimo del contrato.
- `metadata.source_evidence.evidence_coverage` cumple contrato.
- La fuente desaparece de la cola de reparacion, salvo backlog historico aceptado.
- El cambio queda cubierto por test o por auditoria no ingestiva documentada.

No cerrar una reparacion con `partial` aunque haya traido items nuevos.
