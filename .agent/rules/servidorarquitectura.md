---
trigger: always_on
---

# ARQUITECTURA SERVIDOR PRODUCCION - 23.105.176.45

**DOCUMENTO ACTUALIZADO**: 2026-01-19
**PROPOSITO**: Regla general para NO pisar servicios en produccion

---

## DATOS DEL SERVIDOR

```
IP: 23.105.176.45
OS: Rocky Linux 9 (5.14.0-611.16.1.el9_7.x86_64)
RAM: 3.6 GB total
Swap: 1.9 GB
Disco: 80 GB (/dev/sda4) - 56% usado
vCPU: 1
Node.js: v20.19.4
PostgreSQL: 15.14 (Docker)
Redis: 6.2.20
```

---

## SERVICIOS PM2 - NO TOCAR

| ID | Nombre | Puerto | Directorio | Memoria | Restarts | Estado |
|----|--------|--------|------------|---------|----------|--------|
| 0 | pm2-logrotate | - | ~/.pm2/modules | 21MB | 1 | OK |
| 1 | **sgi** | 3000 | /home/sgi.ultimamilla.com.ar | 12MB | 1 | ESTABLE |
| 2 | **sitrep-backend** | 3002 | /var/www/sitrep-backend | 36MB | 8 | ESTABLE |
| 3 | astro-ultimamilla | 4321 | /root/fumbling-field | 61MB | 3438+ | CRITICO |
| 4,5,6 | um-frontend | - | /root/fumbling-field | 7-57MB | 60-169 | PROBLEMA |


### COMANDOS PM2 IMPORTANTES
```bash
# Ver estado
pm2 list

# Reiniciar servicio especifico
pm2 restart sitrep-backend

# Ver logs
pm2 logs sitrep-backend --lines 50

# Guardar configuracion
pm2 save
```

---

## CONTENEDORES DOCKER - NO TOCAR

| Nombre | Estado | Puertos | RAM | Descripcion |
|--------|--------|---------|-----|-------------|
| **directus-admin-directus-app-1** | Up 2 days | 8055 | 122MB | CMS Directus |
| **directus-admin-database-1** | Up 3 days | 5432 | 14MB | PostgreSQL 15 (Directus) |
| **umbot-postgres-prod** | Up 3 days (healthy) | interno | 18MB | PostgreSQL (UMBot) |
| **umbot-redis-prod** | Up 3 days (healthy) | interno | 8MB | Redis (UMBot) |
| remnanode | Up 3 days | - | 5MB | ? |
| umbot-nginx-prod | Created | - | - | No usado |
| umbot-astro-prod | Created | - | - | No usado |
| um25_database | Created | - | - | No usado |

### COMANDOS DOCKER IMPORTANTES
```bash
# Ver contenedores
docker ps -a

# Ver logs
docker logs directus-admin-directus-app-1 --tail 50

# Reiniciar contenedor
docker restart directus-admin-directus-app-1
```

---

## PUERTOS EN USO - MAPA COMPLETO

| Puerto | Servicio | Proceso | Descripcion | CRITICO |
|--------|----------|---------|-------------|---------|
| 21 | FTP | pure-ftpd | Servidor FTP | NO |
| 22 | SSH | sshd | Acceso remoto | SI |
| 25 | SMTP | postfix | Servidor mail | NO |
| 53 | DNS | pdns_server | PowerDNS | NO |
| 80 | HTTP | nginx | Web server | SI |
| 443 | HTTPS | nginx | Web server SSL | SI |
| 2222 | SSH Web | FastAPI | Terminal web | NO |
| **3000** | **SGI** | **node** | **App SGI** | SI |
| **3002** | **SITREP API** | **node** | **Backend Trazabilidad** | SI |
| 3306 | MySQL | mariadb | Base de datos | NO |
| **4321** | **Astro** | **node** | **Frontend UM** | SI |
| 5432 | PostgreSQL | docker-proxy | Base de datos | SI |
| 6379 | Redis | redis-server | Cache | SI |
| 7080 | LiteSpeed | litespeed | Web server alt | NO |
| **8055** | **Directus** | docker-proxy | **CMS** | SI |
| 8081 | PowerDNS | pdns_server | API DNS | NO |
| 8090 | LiteSpeed CP | lscpd | Panel control | NO |
| 8091 | PHP-FPM | php | FastCGI | NO |
| 8888 | Python | python3 | ? | NO |
| 11211 | Memcached | memcached | Cache | NO |

---

## CONFIGURACION NGINX - TODOS LOS SITIOS

### 1. ultimamilla.com.ar (PRINCIPAL)

```nginx
# DEMOAMBIENTE (Trazabilidad RRPP Demo)
/demoambiente/           → /var/www/demoambiente/ (estaticos)
/demoambiente/assets/    → /var/www/demoambiente/assets/ (cache 1y)
/demoambiente/api/       → localhost:3457 (proxy)

# API Trazabilidad (Emergency fix para frontend)
/api/(auth|manifiestos|catalogos|pdf|reportes|actores|analytics|notificaciones)
                         → localhost:3010

# STATUS Dashboard
/status                  → localhost:4321 (Astro)

# DIRECTUS ASSETS (proxy HTTPS)
/directus-assets/        → localhost:8055/assets/

# IMAGENES
/imagenes_antecedentes_versionproduccion/
                         → /var/www/html
```

### 2. sitrep.ultimamilla.com.ar (PRODUCCION)

```nginx
upstream sitrep_backend { server localhost:3002; }

/               → /var/www/sitrep (SPA)
/assets         → /var/www/sitrep/assets (cache 1y)
/sw-custom.js   → /var/www/sitrep/sw-custom.js (no-cache)
/api            → localhost:3002 (sitrep-backend)
```

### 3. admin.ultimamilla.com.ar

```nginx
/               → localhost:8055 (Directus CMS)
```

### 4. sgi.ultimamilla.com.ar

```nginx
/               → localhost:3000 (SGI App)
client_max_body_size 50M
```

### 5. wiki.ultimamilla.com.ar

```nginx
/               → MediaWiki (PHP 7.4)
root: /home/wiki.ultimamilla.com.ar
```

### 6. umbot.com.ar

```nginx
/               → /home/umbot.com.ar/public_html (SPA estatico)
```

### 7. viveroloscocos.com.ar

```nginx
/               → WordPress (PHP 7.4)
root: /home/viveroloscocos.com.ar/public_html
```

---

## DIRECTORIOS IMPORTANTES

### /var/www/

| Directorio | Descripcion | Usado Por | CRITICO |
|------------|-------------|-----------|---------|
| **demoambiente/** | Frontend Demo Trazabilidad | Nginx | SI |
| **sitrep/** | Frontend Prod Trazabilidad | sitrep.ultimamilla.com.ar | SI |
| **sitrep-backend/** | Backend Prod Trazabilidad | PM2 sitrep-backend | SI |
| html/ | Default nginx + imagenes | Nginx | NO |
| sitrep-api/ | Backup/antiguo | No usado | NO |
| sitrep-prod/ | Backup/antiguo | No usado | NO |
| directus/ | Directus files | Docker | NO |
| umbot/ | UMBot files | No usado | NO |

### /home/

| Directorio | Descripcion | CRITICO |
|------------|-------------|---------|
| sgi.ultimamilla.com.ar/ | App SGI | SI |
| wiki.ultimamilla.com.ar/ | MediaWiki | SI |
| umbot.com.ar/ | UMBot frontend | NO |
| viveroloscocos.com.ar/ | WordPress | SI |

### /root/

| Directorio | Descripcion | CRITICO |
|------------|-------------|---------|
| fumbling-field/ | Astro UM frontend | SI |
| .pm2/ | Config PM2 | SI |
| scripts/ | Scripts monitoreo | NO |
| health-check.sh | Health check auto | NO |

---

## CRON JOBS ACTIVOS

```bash
# SSL SGI (cada 10 min)
*/10 * * * * /root/setup-sgi-ssl.sh

# Metricas servidor (cada hora)
0 * * * * /root/scripts/server-metrics.sh

# Health check (cada 5 min)
*/5 * * * * /root/health-check.sh
*/5 * * * * /root/scripts/memory-monitor.sh
*/5 * * * * /root/scripts/ensure-pm2-processes.sh

# ⚠️ SOSPECHOSO - INVESTIGAR
@reboot sleep 90 && /etc/xmrig-restore/restore.sh
*/30 * * * * /etc/xmrig-restore/restore.sh
```

---

## SERVICIOS SYSTEMD ACTIVOS

### CRITICOS (NO TOCAR)
- nginx.service - Web server
- docker.service - Contenedores
- pm2-root.service - PM2 process manager
- redis.service - Cache local
- mariadb.service - Base datos MariaDB
- postfix.service - Email
- fail2ban.service - Seguridad

### AUXILIARES
- php-fpm.service - PHP 8.x
- php74-php-fpm.service - PHP 7.4 (WordPress/Wiki)
- memcached.service - Cache
- pdns.service - DNS
- pure-ftpd.service - FTP
- emergency-dashboard.service - Dashboard emergencia
- fastapi_ssh_server.service - Terminal web

---

## BASES DE DATOS

### PostgreSQL (Docker - puerto 5432)
- **directus-admin-database-1**: BD Directus CMS
- **umbot-postgres-prod**: BD UMBot

### MariaDB (Local - puerto 3306)
- Bases de datos WordPress, wiki, otros

### Redis
- **Local**: redis-server (127.0.0.1:6379)
- **Docker**: umbot-redis-prod (interno)

---

## RECURSOS ACTUALES (2026-01-19 23:42 UTC)

```
RAM Total: 3.6 GB
RAM Usada: 3.2 GB (89%)
RAM Libre: 162 MB (4%)
Buffer/Cache: 464 MB

Swap Total: 1.9 GB
Swap Usado: 1.3 GB (68%)

Disco /: 45 GB usado / 80 GB total (56%)

Load Average: 8.93 / 7.05 / 5.33 (MUY ALTO)
Uptime: 3 dias, 8 horas
```

### TOP 5 PROCESOS POR MEMORIA
| Proceso | PID | RAM | Descripcion |
|---------|-----|-----|-------------|
| astro preview | 139020 | 139MB | Frontend UM (INESTABLE) |
| Directus | 351396 | 126MB | CMS |
| astro preview | 104070 | 74MB | Frontend UM (duplicado) |
| npm run preview | 138755 | 58MB | Frontend UM |
| sitrep-backend | 54682 | 35MB | Backend Trazabilidad |

---

## REGLAS PARA DEPLOYMENTS

### SITREP (Trazabilidad RRPP Produccion)

```bash
# Frontend (archivos estaticos)
DESTINO: /var/www/sitrep/

# Backend (Node.js)
DESTINO: /var/www/sitrep-backend/
PROCESO PM2: sitrep-backend
PUERTO: 3002

# Deployment Backend:
1. cd /var/www/sitrep-backend
2. Hacer backup: tar -czf ../sitrep-backend-backup-$(date +%Y%m%d).tar.gz .
3. Subir nuevos archivos
4. npm install --production (si hay nuevas dependencias)
5. pm2 restart sitrep-backend
6. pm2 logs sitrep-backend --lines 20

# NO TOCAR:
# - Puerto 3002 (asignado)
# - /etc/nginx/conf.d/sitrep.conf
```

### DEMOAMBIENTE (Demo Trazabilidad)

```bash
# Frontend (archivos estaticos)
DESTINO: /var/www/demoambiente/

# Deployment:
1. cd /var/www/demoambiente
2. Hacer backup: tar -czf ../demoambiente-backup-$(date +%Y%m%d).tar.gz .
3. Subir nuevos archivos
4. Nginx no necesita reinicio (archivos estaticos)

# NO TOCAR:
# - Configuracion en ultimamilla.com.ar
```

### REGLAS GENERALES

```bash
# ANTES de cualquier deployment:
1. Verificar RAM: free -h (debe haber >300MB libre)
2. Verificar disco: df -h / (debe haber >5GB libre)
3. Hacer backup del directorio destino
4. Verificar que no hay transacciones activas

# DESPUES de deployment:
1. Si hay PM2: pm2 restart <nombre>
2. Verificar logs: pm2 logs <nombre> --lines 20
3. Si hay Nginx: nginx -t && systemctl reload nginx
4. Probar en navegador

# NUNCA:
- Cambiar puertos sin actualizar Nginx
- Eliminar configuraciones de Nginx activas
- Detener contenedores Docker sin razon
- Modificar bases de datos directamente
- Reiniciar todo el servidor sin necesidad
- Usar pm2 delete sin pm2 save despues
```

---

## CHECKLIST PRE-DEPLOYMENT

- [ ] Verificar RAM disponible: `free -h` (>300MB libre)
- [ ] Verificar disco: `df -h /` (>5GB libre)
- [ ] Verificar load average: `uptime` (<5 ideal)
- [ ] Hacer backup del directorio destino
- [ ] Verificar proceso destino estable: `pm2 list`
- [ ] Verificar logs sin errores: `pm2 logs <nombre> --lines 10`

## CHECKLIST POST-DEPLOYMENT

- [ ] Reiniciar servicio si aplica: `pm2 restart <nombre>`
- [ ] Verificar proceso online: `pm2 list`
- [ ] Verificar logs sin errores: `pm2 logs <nombre> --lines 20`
- [ ] Testear Nginx si se modifico: `nginx -t`
- [ ] Recargar Nginx si aplica: `systemctl reload nginx`
- [ ] Probar funcionalidad en navegador
- [ ] Verificar RAM post-deployment: `free -h`

---

## CONTACTOS Y ACCESOS

```
SSH: root@23.105.176.45
SITREP Prod: https://sitrep.ultimamilla.com.ar
SITREP Demo: https://ultimamilla.com.ar/demoambiente/
Admin Directus: https://admin.ultimamilla.com.ar
SGI: https://sgi.ultimamilla.com.ar
Wiki: https://wiki.ultimamilla.com.ar
```

---

*Documento actualizado: 2026-01-19 - Actualizar al hacer cambios en el servidor*
