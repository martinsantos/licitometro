# Backup & Data Protection System

**Implemented:** February 14, 2026
**Status:** ✅ Production Ready

---

## 🎯 Overview

Sistema completo de protección de datos para prevenir pérdida de información en MongoDB.

### Componentes Implementados

1. ✅ **Backup automático** (`scripts/backup-mongodb.sh`)
2. ✅ **Restore seguro** (`scripts/restore-mongodb.sh`)
3. ✅ **Deploy mejorado** (`scripts/deploy-prod.sh`)
4. ✅ **Volumes protegidos** (docker-compose.prod.yml)
5. ✅ **Cron automation** (`scripts/setup-backup-cron.sh`)

---

## 📋 Scripts Disponibles

### 1. backup-mongodb.sh

**Ubicación:** `/opt/licitometro/scripts/backup-mongodb.sh`

**Función:**
- Crea backup comprimido de MongoDB
- Mantiene últimos 7 días de backups
- Verifica que el container esté corriendo
- Retorna path del backup creado

**Uso:**
```bash
bash /opt/licitometro/scripts/backup-mongodb.sh
```

**Output:**
```
/opt/licitometro/backups/mongodb_20260214_143022.gz
```

**Rotación:** Elimina backups >7 días automáticamente

---

### 2. restore-mongodb.sh

**Ubicación:** `/opt/licitometro/scripts/restore-mongodb.sh`

**Función:**
- Restaura backup de MongoDB
- Pide confirmación (operación destructiva)
- Verifica restore con document count
- Usa `mongorestore --drop` para reemplazar todo

**Uso:**
```bash
bash /opt/licitometro/scripts/restore-mongodb.sh <backup_file>
```

**Ejemplo:**
```bash
bash /opt/licitometro/scripts/restore-mongodb.sh /opt/licitometro/backups/mongodb_20260214_143022.gz
```

**Safety:** Requiere confirmación explícita (`yes`)

---

### 3. deploy-prod.sh (MEJORADO)

**Ubicación:** `/opt/licitometro/scripts/deploy-prod.sh`

**Función:**
- **NUNCA** usa `docker compose down` (previene data loss)
- Backup automático PRE-deployment
- Build sin detener containers
- Restart (no down/up)
- Health check con retry (30×10s)
- Rollback instructions si falla

**Uso:**
```bash
bash /opt/licitometro/scripts/deploy-prod.sh
```

**Flujo:**
```
1. Pre-backup → 2. Build → 3. Restart → 4. Health check → 5. Cleanup
```

**CRITICAL:** MongoDB NUNCA se detiene durante deploy

---

### 4. setup-backup-cron.sh

**Ubicación:** `/opt/licitometro/scripts/setup-backup-cron.sh`

**Función:**
- Configura cron job para backups automáticos
- Schedule: Cada 6 horas (0:00, 6:00, 12:00, 18:00)
- Logs: `/var/log/licitometro-backup.log`

**Instalación (una sola vez):**
```bash
# En VPS
ssh root@76.13.234.213 'bash /opt/licitometro/scripts/setup-backup-cron.sh'
```

**Verificar:**
```bash
crontab -l | grep backup
tail -f /var/log/licitometro-backup.log
```

---

## 🛡️ Docker Volume Protection

**Archivo:** `docker-compose.prod.yml`

### Volumes con Named Persistence

```yaml
volumes:
  mongo_data:
    name: licitometro_mongo_data
    external: false
  storage_data:
    name: licitometro_storage_data
    external: false
```

**Protección:**
- Volumes tienen nombres explícitos
- NO se eliminan con `docker compose down -v`
- Persisten entre recreaciones de containers
- Solo se eliminan con `docker volume rm` manual

---

## 🚀 Deployment Workflow (ACTUALIZADO)

### Método Seguro (CON backup automático)

```bash
# En VPS
ssh root@76.13.234.213
cd /opt/licitometro
bash scripts/deploy-prod.sh
```

**Resultado:**
- ✅ Backup automático antes de cambios
- ✅ Zero downtime (restart, no down)
- ✅ Health check con retry
- ✅ Datos protegidos

### ❌ NUNCA HACER

```bash
# ❌ PELIGROSO - Elimina volumes
docker compose down -v

# ❌ PELIGROSO - Puede perder datos
docker compose down && docker compose up -d
```

### ✅ SIEMPRE HACER

```bash
# ✅ SEGURO - Usa el script
bash scripts/deploy-prod.sh

# ✅ SEGURO - Solo restart
docker compose restart backend nginx

# ✅ SEGURO - Rebuild sin detener
docker compose build && docker compose restart
```

---

## 📊 Backup Schedule

| Frecuencia | Trigger | Retención |
|------------|---------|-----------|
| Cada 6h | Cron (0,6,12,18) | 7 días |
| Pre-deploy | deploy-prod.sh | 7 días |
| Manual | backup-mongodb.sh | 7 días |

**Capacidad:** ~28 backups/semana (~196 backups/mes antes de rotación)

**Storage:** Backups gzipped (~5-10MB cada uno)

---

## 🔍 Verificación de Backups

### Listar backups disponibles

```bash
ls -lh /opt/licitometro/backups/
```

### Verificar último backup

```bash
LAST_BACKUP=$(ls -t /opt/licitometro/backups/mongodb_*.gz | head -1)
echo "Last backup: $LAST_BACKUP"
ls -lh "$LAST_BACKUP"
```

### Test de restore (dry-run)

```bash
# Ver contenido sin restaurar
zcat /opt/licitometro/backups/mongodb_20260214_143022.gz | head -100
```

---

## 🆘 Emergency Recovery

### Escenario 1: Deploy falló, backend no arranca

```bash
# 1. Ver logs
docker logs licitometro-backend-1 --tail 100

# 2. Si es corrupto, restore último backup
LAST_BACKUP=$(ls -t /opt/licitometro/backups/mongodb_*.gz | head -1)
bash /opt/licitometro/scripts/restore-mongodb.sh "$LAST_BACKUP"

# 3. Restart backend
docker restart licitometro-backend-1
```

### Escenario 2: Base de datos vacía después de accidente

```bash
# 1. Listar backups disponibles
bash /opt/licitometro/scripts/restore-mongodb.sh
# (muestra lista de backups)

# 2. Restore backup específico
bash /opt/licitometro/scripts/restore-mongodb.sh /opt/licitometro/backups/mongodb_YYYYMMDD_HHMMSS.gz

# 3. Verificar
docker exec licitometro-mongodb-1 mongosh licitaciones_db --eval 'db.licitaciones.countDocuments()'
```

### Escenario 3: Rollback a versión anterior

```bash
# 1. Restore backup PRE-deploy
# (deploy-prod.sh imprime path del backup al inicio)
bash /opt/licitometro/scripts/restore-mongodb.sh /opt/licitometro/backups/mongodb_YYYYMMDD_HHMMSS.gz

# 2. Git rollback (si es necesario)
git reset --hard HEAD~1

# 3. Re-deploy
bash scripts/deploy-prod.sh
```

---

## 📈 Monitoring

### Check backup cron status

```bash
# Ver cron jobs activos
crontab -l

# Ver logs de backup
tail -f /var/log/licitometro-backup.log

# Ver último backup
ls -lth /opt/licitometro/backups/ | head -5
```

### Check disk usage

```bash
# Tamaño de backups
du -sh /opt/licitometro/backups/

# Cantidad de backups
ls /opt/licitometro/backups/mongodb_*.gz | wc -l
```

---

## 🔒 Security Notes

- Backups NO están encriptados (solo gzip)
- Almacenados en `/opt/licitometro/backups/` (mismo VPS)
- Acceso: solo root user
- **TODO:** Offsite backup a S3/B2 (futuro)

---

## ✅ Testing Checklist

- [ ] Backup manual funciona
- [ ] Restore funciona
- [ ] Deploy script funciona
- [ ] Cron job configurado
- [ ] Logs de cron visibles
- [ ] Volume protection verificado
- [ ] Emergency recovery testeado

---

## 📝 Changelog

### 2026-02-14 - Initial Implementation
- ✅ Created backup-mongodb.sh (7-day retention)
- ✅ Created restore-mongodb.sh (with confirmation)
- ✅ Created deploy-prod.sh (NO down, only restart)
- ✅ Protected volumes in docker-compose.prod.yml
- ✅ Created setup-backup-cron.sh (6h schedule)
- ✅ Documented all procedures

---

**Desarrollado con ❤️ para prevenir data loss**
