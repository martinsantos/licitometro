# PR Guard + Main Guard - Sistema de Protección GRATIS

**Alternativa gratuita a Branch Protection de GitHub (que requiere pago para repos privados)**

---

## 🎯 Problema

GitHub requiere GitHub Team ($4/usuario/mes) para branch protection en repositorios **privados**.

Sin branch protection, no hay forma técnica de bloquear merges de PRs con CI fallido.

---

## ✅ Solución: Doble Capa de Protección

### Capa 1: **PR Guard** (Prevención)
Bloquea **visualmente** los PRs con build fallido

### Capa 2: **Main Guard** (Último recurso)
Auto-revierte commits rotos que llegaron a main

---

## 🛡️ Capa 1: PR Guard (Prevention)

### ¿Qué hace?

Cuando el CI falla en un PR:

1. ⛔ **Agrega label roja**: `⛔ DO NOT MERGE - Build Failed`
2. 💬 **Comenta en el PR** con error crítico visible
3. 🔗 **Link a logs** del CI para debugging

Cuando el CI pasa:

1. ✅ **Remueve el label** automáticamente
2. 💬 **Comenta confirmación** "Ready to Merge"

### Ejemplo de Comentario (CI Fallido)

```markdown
## ⛔ CRITICAL: Build Failed - DO NOT MERGE

**The CI checks have failed for this PR.**

❌ **Build Status**: FAILED
🔗 **Workflow Run**: [View logs](...)

### ⚠️ WARNING

**DO NOT merge this PR until the build is fixed.**

Merging broken code will:
- Break production deployment
- Cause downtime
- Require emergency hotfix

### ✅ To fix:

1. Check the CI logs for errors
2. Fix the build errors locally
3. Push the fix to this branch
4. Wait for CI to pass (green checkmark)
5. Only then merge the PR

---

🤖 This is an automated check. Once CI passes, this label will be removed automatically.
```

### Flujo Completo

```
Developer crea PR
    ↓
CI Checks workflow ejecuta (build + lint)
    ↓
┌─────────────────────────────────────┐
│ CI FALLA?                           │
└─────────────────────────────────────┘
         ↓ SÍ                    ↓ NO
    PR Guard activa         PR Guard limpia
         ↓                        ↓
    ⛔ Label roja              ✅ Label verde
    💬 Comentario crítico      💬 "Ready to merge"
    Developer ve ADVERTENCIA   Developer puede mergear
         ↓
    Developer NO debe mergear
    (pero técnicamente PUEDE - no hay bloqueo real)
```

### Archivo

`.github/workflows/pr-guard.yml`

---

## 🚨 Capa 2: Main Guard (Last Resort)

### ¿Qué hace?

**Si alguien mergea código roto a pesar del PR Guard:**

1. 🏗️ **Detecta build failure** en main
2. ↩️ **Auto-revierte el commit** roto
3. 📝 **Crea issue** notificando al autor
4. 🔔 **Marca como urgent** con labels

### Ejemplo de Auto-Revert

```
ANTES (código roto en main):
  * a1b2c3d - Fix apertures date validation (BROKEN) ← HEAD
  * e4f5g6h - Previous commit (OK)

DESPUÉS (auto-revert):
  * x9y8z7w - Revert "Fix apertures date validation" [skip-guard] ← HEAD
  * a1b2c3d - Fix apertures date validation (BROKEN)
  * e4f5g6h - Previous commit (OK)

Result: main vuelve al estado funcional de e4f5g6h
```

### Issue Creado Automáticamente

```markdown
## 🚨 Automatic Revert: Build Failed on Main

**A commit was automatically reverted because it broke the build.**

### Reverted Commit
- **SHA**: `a1b2c3d`
- **Message**: Fix apertures date validation
- **Author**: developer@example.com
- **Revert SHA**: `x9y8z7w`

### Build Errors
- Frontend build: **failure**
- Python syntax: **success**

### Action Required

Please:
1. Check the build logs
2. Fix the errors locally
3. Test with `CI=true npm run build` before pushing
4. Create a new PR with the fix

### Prevention

To prevent this in the future:
- Always test locally before pushing
- Wait for CI checks to pass on PRs
- Look for the ⛔ DO NOT MERGE label

---

🤖 Automated by Main Guard • [View workflow](...)
```

### Flujo Completo

```
Código roto llega a main (alguien ignoró PR Guard)
    ↓
Main Guard workflow ejecuta
    ↓
Build falla en main
    ↓
Main Guard auto-revierte
    ↓
main vuelve a estado funcional
    ↓
Issue creado notificando al autor
    ↓
Developer arregla y crea nuevo PR
```

### Archivo

`.github/workflows/main-guard.yml`

---

## 📊 Comparación: Branch Protection vs PR Guard

| Feature | Branch Protection (PAGO) | PR Guard + Main Guard (GRATIS) |
|---------|--------------------------|----------------------------------|
| **Costo** | $4/usuario/mes | $0 (usa GitHub Actions free tier) |
| **Bloqueo técnico** | ✅ Sí (imposible mergear) | ❌ No (solo visual) |
| **Prevención visual** | ✅ Botón deshabilitado | ✅ Label + comentarios |
| **Auto-revert** | ❌ No | ✅ Sí (Capa 2) |
| **Notificaciones** | ❌ No | ✅ Issues automáticos |
| **Tiempo downtime** | 0 (previene merge) | ~30 segundos (revert automático) |
| **Requiere disciplina** | No | Sí (no hay bloqueo técnico) |

---

## 🔧 Instalación

### 1. Los workflows ya están creados

```bash
.github/workflows/ci.yml          # CI checks (ya existía)
.github/workflows/pr-guard.yml    # NUEVO - PR protection
.github/workflows/main-guard.yml  # NUEVO - Auto-revert
```

### 2. Permisos necesarios

Ya están configurados en los workflows:

```yaml
permissions:
  pull-requests: write  # Para labels y comentarios
  contents: write       # Para auto-revert
  issues: write         # Para crear issues
```

### 3. Commit y push

```bash
git add .github/workflows/pr-guard.yml .github/workflows/main-guard.yml README.md
git commit -m "Add PR Guard + Main Guard system (free alternative to branch protection)"
git push origin main
```

¡Listo! El sistema está activo inmediatamente.

---

## 🧪 Testing

### Test 1: PR Guard detecta build fallido

1. Crear branch con código roto (ej: syntax error)
2. Abrir PR
3. CI falla
4. **Resultado esperado**:
   - Label `⛔ DO NOT MERGE - Build Failed` aparece
   - Comentario crítico en el PR
   - PR visualmente bloqueado

### Test 2: PR Guard limpia cuando se arregla

1. Fix el error en el mismo PR
2. Push el fix
3. CI pasa
4. **Resultado esperado**:
   - Label roja removida
   - Comentario "✅ Ready to Merge"

### Test 3: Main Guard auto-revierte

1. Mergear código roto a main (ignorando PR Guard)
2. **Resultado esperado**:
   - Build falla en main
   - Auto-revert commit aparece
   - Issue creado con label `auto-revert`
   - main vuelve a estado funcional

---

## 💰 Costo

**GitHub Actions Free Tier**: 2000 minutos/mes

**Uso estimado del sistema**:
- CI Checks: ~40-60 min/mes (1-2 min por PR)
- PR Guard: ~5-10 min/mes (10 seg por trigger)
- Main Guard: ~10-20 min/mes (2 min por push a main)

**Total**: ~55-90 min/mes = **4.5% del free tier**

**Costo monetario**: **$0 USD/mes** ✅

---

## ⚠️ Limitaciones

### Limitación 1: No es bloqueo técnico real

**Problema**: Un developer determinado PUEDE ignorar el label y mergear de todos modos.

**Mitigación**:
- Capa 2 (Main Guard) revierte automáticamente
- Disciplina del equipo
- Educación sobre el sistema

### Limitación 2: Requiere disciplina

**Problema**: Depende de que los developers respeten el label `⛔ DO NOT MERGE`.

**Mitigación**:
- Comentarios muy visibles y alarmantes
- Auto-revert como red de seguridad
- Culture de "si el label está rojo, NO mergear"

### Limitación 3: ~30 segundos de downtime potencial

**Problema**: Si alguien mergea código roto, hay ~30 seg hasta que se revierte.

**Comparación**:
- Branch Protection: 0 segundos (previene merge)
- PR Guard + Main Guard: ~30 segundos (revert automático)
- Sin protección: 20+ minutos (revert manual como en PR #22)

**Conclusión**: 30 seg es **mucho mejor** que 20 minutos.

---

## 🎓 Educación del Equipo

### Regla de Oro

**Si ves ⛔ DO NOT MERGE, NO mergees. Punto.**

### ¿Qué hacer si aparece el label?

1. ✅ Leer el comentario del bot
2. ✅ Click en el link de logs
3. ✅ Fix el error localmente
4. ✅ Push el fix
5. ✅ Esperar que CI pase (label desaparece)
6. ✅ Ahora sí, mergear

### ¿Qué NO hacer?

❌ Ignorar el label y mergear de todos modos
❌ Remover el label manualmente
❌ Mergear "porque es urgente"

---

## 🔍 Monitoring

### Ver PRs bloqueados

```bash
# GitHub UI
Ir a Pull Requests → Filtrar por label "⛔ DO NOT MERGE - Build Failed"
```

### Ver auto-reverts recientes

```bash
# GitHub UI
Ir a Issues → Filtrar por label "auto-revert"
```

### Ver status de CI

Badges en README.md:
- ![CI Checks](...)  ← Verde = OK, Rojo = Falla
- ![Main Guard](...)  ← Verde = OK, Rojo = Revert activo

---

## 🆚 Alternativas Consideradas

### Opción A: GitHub Team ($4/user/mes)

❌ Costo monetario
✅ Bloqueo técnico real
✅ Sin configuración adicional

**Decisión**: Rechazada por costo.

### Opción B: Migrar a GitLab (Gratis)

✅ Branch protection gratis
❌ Migración de plataforma
❌ Cambio de workflows
❌ Re-training del equipo

**Decisión**: Rechazada por complejidad de migración.

### Opción C: Hacer repo público (Gratis)

✅ Branch protection gratis en repos públicos
❌ Código se vuelve público
❌ Pérdida de privacidad

**Decisión**: Rechazada por privacidad.

### Opción D: Solo pre-commit hooks locales (Gratis)

✅ Previene commits rotos en local
❌ NO funciona en web UI
❌ NO funciona en Android app
❌ Bypasseable con --no-verify

**Decisión**: Rechazada por falta de coverage.

### ✅ Opción E: PR Guard + Main Guard (ELEGIDA)

✅ Costo $0
✅ Funciona en web UI
✅ Funciona en Android app
✅ Auto-revert como red de seguridad
⚠️ Requiere disciplina (mitigado con Main Guard)

**Decisión**: **ELEGIDA** - Mejor balance costo/beneficio.

---

## 📚 Referencias

- **Incident que motivó esto**: PR #22 (Feb 14, 2026) - Código roto mergeado → 20 min downtime
- **GitHub Actions Pricing**: https://github.com/pricing
- **Workflow files**: `.github/workflows/pr-guard.yml`, `.github/workflows/main-guard.yml`
- **Setup guide**: Este documento

---

## 🆘 Troubleshooting

### PR Guard no está agregando label

**Causa**: Workflow no tiene permisos de `pull-requests: write`.

**Fix**: Los workflows ya tienen los permisos correctos. Verificar que el workflow se ejecutó:
```bash
gh run list --workflow="PR Guard"
```

### Main Guard no está revirtiendo

**Causa 1**: Commit message contiene `[skip-guard]`.
**Fix**: Remover `[skip-guard]` del mensaje.

**Causa 2**: Commit es ya un revert (empieza con "Revert").
**Fix**: Normal - Main Guard no revierte reverts para evitar loops.

### Label quedó pegado en PR

**Causa**: CI pasó pero PR Guard no ejecutó.

**Fix manual**:
```bash
# Remover label manualmente
gh pr edit NUMERO --remove-label "⛔ DO NOT MERGE - Build Failed"
```

---

**Última actualización**: Feb 14, 2026
**Autor**: Sistema automatizado
**Status**: ✅ PRODUCCIÓN
