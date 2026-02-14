# Branch Protection Setup

**CRÍTICO**: Estas reglas previenen que código roto llegue a producción.

## ¿Por qué es necesario?

Sin branch protection, es posible mergear PRs que rompen el build, causando fallos en producción.

**Incidente real (Feb 14, 2026)**: PR #22 se mergeó con un error de ESLint, causando fallo en producción por 20 minutos.

---

## Pasos para Configurar

### 1. Ir a Branch Protection Rules

1. Abrir GitHub en el navegador
2. Ir al repositorio: https://github.com/martinsantos/licitometro
3. Click en **Settings** (tab superior)
4. Click en **Branches** (menú izquierdo)
5. Click en **Add rule** (o **Add branch protection rule**)

### 2. Configurar la Regla

**Branch name pattern**: `main`

**Configuración obligatoria**:

#### ✅ Protect matching branches

Marcar las siguientes opciones:

- [x] **Require a pull request before merging**
  - **NO** marcar "Require approvals" (permite merge desde la app de Android)

- [x] **Require status checks to pass before merging**
  - [x] **Require branches to be up to date before merging**
  - En "Status checks that are required", buscar y agregar:
    - ✅ `Lint & Build Check` (del workflow ci.yml)

- [ ] **Require conversation resolution before merging** (opcional)

- [ ] **Require signed commits** (NO marcar - complica desarrollo desde app)

- [ ] **Require linear history** (opcional)

- [x] **Include administrators** (recomendado para evitar bypasses accidentales)

#### ❌ NO marcar estas opciones

- [ ] **Require approvals from someone other than the last pusher**
  - Esto bloquearía merge desde la app de Android

- [ ] **Require deployments to succeed before merging**
  - El preview deployment puede ser lento/fallar por recursos

### 3. Guardar

Click en **Create** o **Save changes**

---

## Resultado Esperado

Después de configurar:

1. **❌ NO se puede mergear** si el workflow "CI Checks" falla
2. **❌ NO se puede mergear** si el branch está desactualizado con main
3. **✅ SÍ se puede mergear** desde la app de Android (sin aprovers requeridos)
4. **✅ SÍ se puede mergear** si todos los checks pasan

---

## Verificación

### Test 1: Mergear con checks pasando

1. Crear PR con código que compila
2. Esperar a que "Lint & Build Check" pase (✓)
3. El botón "Merge" debe estar **habilitado** ✅

### Test 2: Intentar mergear con checks fallando

1. Crear PR con código que NO compila (ej: error de sintaxis)
2. Esperar a que "Lint & Build Check" falle (✗)
3. El botón "Merge" debe estar **deshabilitado** ❌
4. Mensaje: "Merging is blocked - Required status check 'Lint & Build Check' has not passed"

---

## Troubleshooting

### "No status checks found in the last week for this repository"

**Causa**: El workflow ci.yml aún no se ha ejecutado.

**Solución**:
1. Crear un PR de prueba
2. Esperar a que el workflow se ejecute
3. Volver a Settings → Branches
4. Ahora debería aparecer "Lint & Build Check" en la lista

### "Can't merge from Android app"

**Causa**: Está marcado "Require approvals".

**Solución**: Desmarcar esa opción en branch protection.

### "CI check is taking too long"

El workflow ci.yml está optimizado para ser rápido:
- ✅ Cache de npm dependencies
- ✅ Solo build (no deployment)
- ✅ Timeout de 8 minutos

**Tiempo esperado**: 2-4 minutos

---

## Mantenimiento

### Agregar más checks requeridos

Cuando se agreguen nuevos workflows (tests, linting, etc.), agregar sus jobs a "Required status checks":

1. Settings → Branches → Edit rule para `main`
2. Scroll a "Require status checks to pass before merging"
3. Buscar el nombre del nuevo check
4. Click para agregarlo a la lista
5. Save changes

### Actualizar la regla

Si necesitas cambiar algo:

1. Settings → Branches
2. Click en **Edit** junto a la regla `main`
3. Modificar opciones
4. Save changes

---

## Referencias

- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Required Status Checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging)

---

**IMPORTANTE**: Una vez configurado, **TODOS los PRs** deben pasar el CI check antes de poder mergearse. Esto previene 100% de builds rotos en producción.
