# GitHub Secrets Setup para CI/CD

Este documento describe cómo configurar los secrets necesarios para que funcionen los workflows de GitHub Actions.

## Secrets Requeridos

Navega a: `https://github.com/santosma/licitometro/settings/secrets/actions`

### 1. VPS_HOST
**Valor:** `76.13.234.213`

**Descripción:** IP del servidor VPS Hostinger

---

### 2. VPS_USER
**Valor:** `root`

**Descripción:** Usuario SSH para conectarse al VPS

---

### 3. VPS_SSH_KEY
**Valor:** Contenido de la private key SSH

**Obtener la key:**
```bash
cat ~/.ssh/licitometro-deploy
```

**IMPORTANTE:** Copiar TODO el contenido, incluyendo `-----BEGIN OPENSSH PRIVATE KEY-----` y `-----END OPENSSH PRIVATE KEY-----`

**Si la key no existe, generarla:**
```bash
# Generar nueva key
ssh-keygen -t ed25519 -C "github-actions@licitometro" -f ~/.ssh/licitometro-deploy

# Copiar public key al VPS
ssh-copy-id -i ~/.ssh/licitometro-deploy.pub root@76.13.234.213

# Test connection
ssh -i ~/.ssh/licitometro-deploy root@76.13.234.213 "echo 'Connection OK'"
```

---

### 4. VPS_KNOWN_HOSTS
**Valor:** Fingerprints SSH del VPS (3 líneas)

**Obtener fingerprints:**
```bash
ssh-keyscan -H 76.13.234.213
```

**Copiar las 3 líneas que comienzan con `|1|`:**
```
|1|RY+eFIZzr2dt/uJLi0XaQwx4Sig=|rOoR2/Xo9ZRZQRoWtRzNmvM6dC0= ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDRAKpVOVNnb/LtJQ4vPMF6wxNqP+OXnYSEdFb/S0r0ayS5ddO/+Em17aYNHLA9CeB58AD+o/GfmITJ4vGgJO0Z7n6PgL9C03FV/uVWHXWh3/4XHp58DfsGuWfHEdET0CrXQC7SJjvWrOGDFfZgUY87c77qQp/UmYmZfdInzu4IUYqSHo7s2cvTOeXufHwoYTpfvurfnh8phD7IdOEL8l/JTuzsWJ1egpXMo+BQdCQJBjCXjDW7peXrzvOX0C49H/aFA7/LQu090EpHPeIt/+CMuzVB1rMB8fBj4yiT/Rm4fzkUFAnv9+8DS/lqfRDtusvCC3c6ez223rcxrz6ZeE6bTu14C/vtCEfrzzqUzxbLMzWHjAJA5qFt5OxhUXP7Jpp2qnmKwu5kJ5QkEiaUqjdCWOdX0+fFk5BAep2yfWF4GraKcjR2XSp59yUIb5kSPVTRAFOQ0hZTLcxFYZmN+rDaS33r7rBXRKrD2kPeJTDRxizMWFoRzYn8jLH5fUFwn2M=
|1|7Ax8LI4pxLHXqUOhudm4sqVswDI=|+qbCfvGriyyTe+DJcjyqgjqXJ6M= ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBOqGz7xzO59ML1q2R9QIxivFIX7SmnqHuF27QVjI4Zizul8DSVwNirE2fw0A1IqJ40uZ0hq0rm4rVYOUGOvn6FA=
|1|D4WQANBJqi3ZA/uBMdfBJwMecIE=|QhJljXQ4NDvMTEy53NtxefPvLTg= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDoVABJsytBPOkgunaJZ5hX8sNIUsNrqcaqEEcS/CwOL
```

**Por qué esto arregla el problema:**
- Evita ssh-keyscan durante el workflow (fallo de conectividad)
- Fingerprints pre-generados son más confiables
- Faster execution (no network call durante workflow)

---

## Verificación

Una vez agregados todos los secrets, puedes verificar que estén configurados:

1. Ve a https://github.com/santosma/licitometro/settings/secrets/actions
2. Debes ver 4 secrets:
   - `VPS_HOST`
   - `VPS_USER`
   - `VPS_SSH_KEY`
   - `VPS_KNOWN_HOSTS`

---

## Probar los Workflows

### Test Manual de Production Workflow

1. Ve a: https://github.com/santosma/licitometro/actions/workflows/production.yml
2. Click "Run workflow"
3. Select branch "main"
4. Click "Run workflow"

El workflow debe completarse exitosamente en ~2-3 minutos.

### Test de Preview Workflow

1. Crea una nueva branch: `git checkout -b test-cicd`
2. Haz un cambio trivial (ej: agregar comentario en README)
3. Push: `git push origin test-cicd`
4. Crea PR en GitHub desde `test-cicd` a `main`
5. El workflow debe ejecutarse automáticamente

El PR debe recibir un comment con la URL del preview: `https://pr-X.dev.licitometro.ar`

---

## Troubleshooting

### Error: "Permission denied (publickey)"
- Verificar que VPS_SSH_KEY contenga la key completa (incluyendo headers)
- Verificar que la public key esté en el VPS: `ssh root@76.13.234.213 cat ~/.ssh/authorized_keys`

### Error: "Host key verification failed"
- Verificar que VPS_KNOWN_HOSTS contenga las 3 líneas correctas
- Re-generar con: `ssh-keyscan -H 76.13.234.213`

### Workflow queda colgado en "Deploy to production"
- Revisar logs del VPS: `ssh root@76.13.234.213 docker logs licitometro-backend-1`
- Verificar health check: `curl https://licitometro.ar/api/health`
