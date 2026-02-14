# Working with Branches - Claude Code Workflow

**Flujo completo de desarrollo desde Claude Code con preview automático**

---

## 🚀 Quick Start

### Opción 1: Desde Branch Nueva (Recomendado)

```bash
# 1. Crear y cambiar a nueva branch
git checkout -b feature/mi-feature

# 2. Hacer cambios con Claude Code
# (editar archivos, etc.)

# 3. Commit y push
git add .
git commit -m "Add: Mi nueva feature"
git push -u origin feature/mi-feature

# 4. Crear PR en GitHub
# Ve a: https://github.com/martinsantos/licitometro/pulls
# Click "New pull request"
# Select: feature/mi-feature → main
# Click "Create pull request"
```

**Resultado:**
- ✅ Preview auto-deploy en ~2-3 minutos
- ✅ Comentario en PR con URL: `https://pr-X.dev.licitometro.ar`
- ✅ Auto-cleanup cuando cierres el PR

---

### Opción 2: Desde Claude Code Directamente

Claude Code puede crear branches automáticamente:

```bash
# Claude Code detecta que estás en main y te ofrece crear branch
# Acepta y Claude Code hará:
# - git checkout -b feature/auto-generated-name
# - Cambios
# - git add + commit + push
# - Abrir PR en GitHub
```

---

## 🔄 Workflow Completo Automatizado

```
1. Branch creada
   ↓
2. Push a GitHub
   ↓
3. Crear PR
   ↓
4. GitHub Actions → Deploy Preview (~2-3 min)
   ↓
5. Comentario con URL: pr-X.dev.licitometro.ar
   ↓
6. Desarrollas, commiteas, pusheas
   ↓
7. Preview auto-actualiza en cada push
   ↓
8. Merge PR
   ↓
9. Production auto-deploy (~3-5 min)
   ↓
10. Preview auto-cleanup (~30 seg)
```

---

## 📋 Workflows Disponibles

| Workflow | Trigger | Duración | Output |
|----------|---------|----------|--------|
| **Preview** | PR open/update | ~2-3 min | `pr-X.dev.licitometro.ar` |
| **Production** | Merge to main | ~3-5 min | `licitometro.ar` |
| **Cleanup** | PR closed | ~30 seg | Resources freed |

---

## 🎯 Ejemplo Completo: Agregar Feature

### Paso 1: Crear Branch

```bash
git checkout main
git pull
git checkout -b feature/add-nodo-filters
```

### Paso 2: Hacer Cambios con Claude Code

```
Prompt a Claude: "Agrega filtros por nodos en la sidebar"
Claude Code hace cambios en:
- frontend/src/components/licitaciones/FilterSidebar.tsx
- frontend/src/hooks/useLicitacionFilters.ts
```

### Paso 3: Commit y Push

```bash
git add .
git commit -m "Add: Nodo filters in sidebar

- Added nodos section to FilterSidebar
- Updated useLicitacionFilters hook
- Added faceted counts for nodos"

git push -u origin feature/add-nodo-filters
```

### Paso 4: Crear PR

```bash
# Opción A: Via web
# GitHub mostrará banner: "Compare & pull request"

# Opción B: Via CLI (si tienes gh)
gh pr create --title "Add: Nodo filters in sidebar" \
  --body "Enables filtering licitaciones by nodo in sidebar"
```

### Paso 5: Esperar Preview

- Ve al PR en GitHub
- Tab "Checks" → "Deploy Preview" running
- Espera comentario con URL (~2-3 min)
- Click en URL para ver preview

### Paso 6: Iterar si Necesario

```bash
# Hacer más cambios
# Claude Code: "Agrega contador de items por nodo"

git add .
git commit -m "Add: Item count per nodo filter"
git push

# Preview auto-actualiza en ~2-3 min
```

### Paso 7: Merge

- Review en GitHub
- Click "Merge pull request"
- **Automático:**
  - Production deploy (~3-5 min)
  - Preview cleanup (~30 seg)
  - Branch remota borrada (opcional)

### Paso 8: Limpiar Local

```bash
git checkout main
git pull
git branch -d feature/add-nodo-filters
```

---

## 🛠️ Comandos Útiles

### Ver Branches

```bash
# Local
git branch

# Remote
git branch -r

# Todas
git branch -a
```

### Limpiar Branches Viejas

```bash
# Eliminar branch local
git branch -d feature/old-feature

# Eliminar branch remota
git push origin --delete feature/old-feature

# Limpiar referencias a branches remotas borradas
git fetch --prune
```

### Ver Estado de Workflows

```bash
# Si tienes gh CLI
gh pr checks
gh pr view --web

# Via web
https://github.com/martinsantos/licitometro/actions
```

---

## 🔍 Troubleshooting

### Preview no desplegó

**Verifica:**
1. Workflow ejecutó? → GitHub → PR → Checks
2. Health check pasó? → `curl http://76.13.234.213:800X/api/health`
3. Logs → Workflow → "Deploy Preview" → Ver logs

**Fix común:**
```bash
# Re-trigger workflow
git commit --allow-empty -m "Trigger preview rebuild"
git push
```

### Preview URL no carga (DNS)

**Verifica Cloudflare DNS:**
```bash
# DNS resuelve?
dig pr-X.dev.licitometro.ar

# Debe retornar: 76.13.234.213
```

**Fix:**
- Cloudflare → DNS → Verificar record `*.dev` existe
- Proxy status: ON (orange cloud)
- SSL mode: Flexible

### Cleanup no ejecutó

**Limpieza manual:**
```bash
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/cleanup-preview.sh X"
```

### Production deploy falló

**Rollback manual:**
```bash
ssh root@76.13.234.213 "cd /opt/licitometro && git reset --hard HEAD~1 && bash deploy.sh"
```

---

## 📊 Límites y Recursos

### Previews Concurrentes

- **Max:** 5 previews simultáneos
- **Por preview:** ~1.1GB RAM (mongodb 256MB + backend 768MB + nginx 64MB)
- **Total disponible:** ~5.5GB (de 8GB VPS)

### Qué Hacer Si Alcanzas el Límite

```bash
# Ver previews activos
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/list-previews.sh"

# Limpiar previews viejos
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/cleanup-old-previews.sh"

# Limpiar preview específico
ssh root@76.13.234.213 "bash /opt/licitometro/scripts/cleanup-preview.sh X"
```

---

## 🎨 Tips para Claude Code

### 1. Descripción Clara de Branch

```
❌ "crea una branch"
✅ "crea una branch feature/add-export-csv para agregar exportación CSV"
```

### 2. Commits Atómicos

```
❌ git commit -m "cambios"
✅ git commit -m "Add: CSV export button in LicitacionesList

- Added ExportButton component
- Implemented CSV generation logic
- Added download trigger"
```

### 3. Testing Local Antes de Push

```bash
# Backend
cd backend && pytest tests/

# Frontend
cd frontend && npm test

# Linting
npm run lint
```

### 4. Pull Antes de Branch Nueva

```bash
# SIEMPRE antes de crear branch
git checkout main
git pull

# Ahora sí
git checkout -b feature/nueva
```

---

## 📖 Referencias

- **Workflows:** `.github/workflows/`
- **Scripts VPS:** `scripts/`
- **Docs completa:** `docs/CICD.md`
- **Troubleshooting:** `docs/PREVIEW_ENVIRONMENTS.md`
- **Status actual:** `CICD_IMPLEMENTATION_STATUS.md`

---

## ✅ Checklist: Primera Branch con Claude Code

- [ ] `git checkout main && git pull`
- [ ] `git checkout -b feature/mi-feature`
- [ ] Hacer cambios con Claude Code
- [ ] `git add . && git commit -m "..."`
- [ ] `git push -u origin feature/mi-feature`
- [ ] Crear PR en GitHub
- [ ] Esperar preview (~2-3 min)
- [ ] Verificar preview URL funciona
- [ ] Iterar si necesario
- [ ] Merge PR
- [ ] Verificar production deploy
- [ ] `git checkout main && git pull && git branch -d feature/mi-feature`

---

**¡Listo para trabajar con branches desde Claude Code!** 🚀

Cada PR automáticamente:
- ✅ Despliega preview
- ✅ Comenta URL
- ✅ Auto-actualiza en cada push
- ✅ Auto-limpia al cerrar
