# Guía: Desarrollar y Deployar desde el Teléfono (Claude Code App)

**Objetivo**: Hacer cambios, crear PRs y deployar desde tu teléfono Android usando Claude Code.

---

## Pre-requisitos ✅

Ya configurados en el paso anterior:
- ✅ GitHub secrets configurados
- ✅ Cloudflare DNS configurado (*.dev.licitometro.ar)
- ✅ Pipeline probado y funcionando al 100%

---

## Workflow Completo (5 pasos simples)

```
📱 Crear rama → 💬 Hacer cambios → 🚀 Push → 👀 Preview → ✅ Merge → 🌐 Producción
```

---

## Paso 1: Crear Nueva Rama desde Claude Code App

### Opción A: Desde el Chat de Claude Code

1. **Abre Claude Code app** en tu teléfono
2. **Navega al proyecto** licitometro
3. **Escribe en el chat**:
   ```
   Crea una nueva rama llamada "feature/mi-cambio" desde main
   ```
4. **Claude ejecutará**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/mi-cambio
   ```
5. **Verifica** que estás en la nueva rama:
   ```
   Muéstrame en qué rama estoy
   ```

### Opción B: Comandos Git Directos (Avanzado)

Si prefieres más control, puedes pedirle a Claude:

```
Ejecuta estos comandos:
1. git checkout main
2. git pull origin main
3. git checkout -b feature/nombre-descriptivo
```

**Nombres de rama recomendados**:
- `feature/nueva-funcionalidad` - Para nuevas features
- `fix/corregir-bug` - Para bug fixes
- `docs/actualizar-readme` - Para documentación
- `test/probar-cicd` - Para testing

---

## Paso 2: Hacer Cambios en el Código

### Ejemplo 1: Modificar un Archivo Existente

**En el chat de Claude Code**:

```
Modifica backend/routers/licitaciones.py:
- Cambia el límite default de página de 20 a 25
```

Claude hará el cambio automáticamente usando las herramientas de edición.

### Ejemplo 2: Crear un Nuevo Archivo

```
Crea un nuevo archivo en frontend/src/components/TestComponent.tsx
con un componente React simple que muestre "Hola desde mobile"
```

### Ejemplo 3: Actualizar Documentación

```
Agrega una línea al README.md que diga:
"✅ CI/CD configurado y funcionando desde mobile"
```

---

## Paso 3: Commit y Push

### Hacer Commit

**Pídele a Claude**:

```
Haz commit de estos cambios con el mensaje:
"feat: Incrementar límite de página a 25"
```

Claude ejecutará:
```bash
git add .
git commit -m "feat: Incrementar límite de página a 25"
```

### Push a GitHub

**Pídele a Claude**:

```
Haz push de esta rama a GitHub
```

Claude ejecutará:
```bash
git push origin feature/mi-cambio
```

---

## Paso 4: Crear Pull Request

### Opción A: Desde el Navegador del Teléfono

1. **GitHub te mostrará una notificación** al hacer push
2. **Haz click en** "Compare & pull request"
3. **Completa**:
   - Title: Descripción corta del cambio
   - Description: Qué hace este cambio y por qué
4. **Click** "Create pull request"

### Opción B: Usando gh CLI (si está instalado)

**Pídele a Claude**:

```
Crea un PR con título "Incrementar límite de página" y descripción "Cambia default de 20 a 25"
```

Claude ejecutará:
```bash
gh pr create --title "Incrementar límite de página" \
  --body "Cambia default de 20 a 25 para mejor UX"
```

---

## Paso 5: Monitorear el Preview Deployment

### Ver el Workflow en GitHub

1. **Abre en el navegador**:
   ```
   https://github.com/martinsantos/licitometro/actions
   ```

2. **Verás el workflow** "Preview Environment Deploy" ejecutándose

3. **Timeline esperado**:
   ```
   0:00 - Workflow starts
   0:30 - Code synced to VPS
   1:00 - Docker build starting
   2:00 - Preview deployed
   2:30 - PR comment with URL
   ```

### Encontrar la URL del Preview

**En el PR**, verás un comentario automático:

```
🚀 Preview Environment Deployed!

Preview URL: http://pr-15.dev.licitometro.ar:8080

API Health: http://pr-15.dev.licitometro.ar:8080/api/health
```

### Probar el Preview

**Abre en tu navegador**:
- URL principal: `http://pr-15.dev.licitometro.ar:8080`
- API health: `http://pr-15.dev.licitometro.ar:8080/api/health`

**Verifica**:
- ✅ La página carga (no 404)
- ✅ Tus cambios están visibles
- ✅ El backend funciona

---

## Paso 6: Merge a Producción

### Una vez que verificaste el preview

1. **En el PR en GitHub**, haz click en **"Merge pull request"**

2. **Confirma** con "Confirm merge"

3. **El workflow de producción se ejecuta automáticamente**:
   ```
   0:00 - Production workflow starts
   0:30 - Pre-deployment backup
   1:00 - Docker build
   2:00 - Services restarted
   2:30 - Health check passed
   ```

### Verificar Producción

**Abre**:
```
https://licitometro.ar
```

**Verifica**:
- ✅ Tus cambios están en producción
- ✅ La aplicación funciona correctamente
- ✅ No hay errores

### Cleanup Automático

El preview se limpia automáticamente al mergear:
- Containers removidos
- Volumes borrados
- URL del preview ya no funciona

---

## Ejemplos de Workflow Completos

### Ejemplo 1: Agregar un Nuevo Endpoint

**En Claude Code app**:

```
1. Crea rama "feature/nuevo-endpoint"
2. Agrega en backend/routers/licitaciones.py un endpoint GET /api/licitaciones/test que retorne {"status": "ok"}
3. Haz commit "feat: Add test endpoint"
4. Push a GitHub
5. Crea PR "Nuevo endpoint de prueba"
```

**Resultado**:
- Preview en `http://pr-X.dev.licitometro.ar:8080/api/licitaciones/test`
- Puedes probarlo desde el teléfono
- Si funciona, merge → producción

### Ejemplo 2: Fix de un Bug

```
1. Crea rama "fix/corregir-paginacion"
2. Corrige el bug en el archivo correspondiente
3. Commit "fix: Corregir límite de paginación"
4. Push y PR "Fix: Paginación incorrecta"
5. Verifica en preview que está arreglado
6. Merge a main
```

### Ejemplo 3: Actualizar Documentación

```
1. Crea rama "docs/actualizar-readme"
2. Edita README.md con nueva información
3. Commit "docs: Actualizar README con workflow mobile"
4. Push y PR
5. Merge directo (no necesita preview, solo docs)
```

---

## Comandos Útiles para Pedir a Claude

### Ver estado actual

```
- "Muéstrame en qué rama estoy"
- "Muéstrame qué archivos he modificado"
- "Muéstrame el último commit"
```

### Gestión de ramas

```
- "Lista todas las ramas"
- "Cámbiate a la rama main"
- "Borra la rama feature/vieja"
```

### Git operations

```
- "Muéstrame el diff de mis cambios"
- "Descarta los cambios en archivo.js"
- "Haz pull de main"
```

### Deploy operations

```
- "Muéstrame el status del último workflow"
- "Cuántos PRs tengo abiertos"
- "Cierra el PR #15"
```

---

## Troubleshooting desde el Teléfono

### Preview no está accesible

**Síntomas**: URL del preview retorna error

**Soluciones**:
1. Espera 2-3 minutos después del deploy
2. Verifica que el workflow terminó exitosamente en GitHub Actions
3. Intenta `http://` en vez de `https://`
4. Verifica el puerto `:8080` en la URL

### Workflow falla

**Síntomas**: GitHub Actions muestra workflow failed

**Soluciones**:
1. Haz click en el workflow fallido para ver logs
2. Lee el error en la sección que falló
3. Pídele a Claude que corrija el error:
   ```
   El workflow falló con este error: [copia el error]
   ¿Cómo lo arreglo?
   ```

### No puedo hacer push

**Síntomas**: `git push` falla con "permission denied"

**Soluciones**:
1. Verifica que estás autenticado en GitHub
2. Usa HTTPS en vez de SSH si hay problemas
3. Genera un Personal Access Token en GitHub

---

## Mejores Prácticas

### ✅ DO

- **Crea ramas descriptivas**: `feature/nueva-funcionalidad`
- **Commits pequeños y frecuentes**: Más fácil de revertir
- **Prueba en preview**: Siempre verifica antes de merge
- **Mensajes de commit claros**: "feat: Add X" mejor que "cambios"

### ❌ DON'T

- **No hagas push directo a main**: Siempre usa branches
- **No merges sin probar**: El preview existe para verificar
- **No dejes PRs abiertas mucho tiempo**: Merge o cierra
- **No crees muchos previews a la vez**: Max 5 concurrent

---

## Flujo Visual Simplificado

```
📱 TELÉFONO
    │
    ├─> "Crea rama feature/X"
    │   └─> Claude ejecuta: git checkout -b feature/X
    │
    ├─> "Modifica archivo.py y agrega función Y"
    │   └─> Claude usa Write tool
    │
    ├─> "Commit y push"
    │   └─> Claude ejecuta: git add . && git commit && git push
    │
    ├─> 🌐 Abres GitHub en navegador
    │   └─> Create Pull Request
    │
    ├─> ⏱️ GitHub Actions ejecuta (2min)
    │   └─> Preview deployed! 🎉
    │
    ├─> 🔍 Abres http://pr-X.dev.licitometro.ar:8080
    │   └─> Verificas que funciona ✅
    │
    ├─> ✅ Haces click en "Merge PR"
    │   └─> GitHub Actions ejecuta producción (2min)
    │
    └─> 🌐 https://licitometro.ar actualizado! 🎉
        └─> Preview limpiado automáticamente
```

---

## Resumen de Tiempos

| Acción | Tiempo |
|--------|--------|
| Crear rama | 5 segundos |
| Hacer cambios con Claude | 1-5 minutos |
| Commit y push | 10 segundos |
| Crear PR en GitHub | 30 segundos |
| Preview deployment | 2-3 minutos |
| Verificar preview | 1-2 minutos |
| Merge PR | 10 segundos |
| Production deploy | 2-3 minutos |
| **TOTAL por feature** | **7-15 minutos** |

---

## Costo

**$0 USD/mes**

- GitHub Actions: 60-100 min/mes
- Free tier: 2000 min/mes
- Margen: 95% sin usar

---

## ¿Necesitas Ayuda?

Pídele a Claude en el chat:

```
"Explícame cómo [hacer X] desde el teléfono"
"Muéstrame el último deployment"
"¿Por qué falló el workflow?"
"¿Cómo revierto el último commit?"
```

---

## Próximos Pasos

**Ya puedes programar y deployar desde tu teléfono! 🎉**

**Pruébalo ahora**:

1. Abre Claude Code app
2. Dile: "Crea una rama test/desde-mobile"
3. Dile: "Agrega un comentario en README.md que diga 'Editado desde mobile'"
4. Dile: "Commit y push"
5. Crea el PR desde el navegador
6. Espera el preview
7. Verifica y merge

**¡Listo!** Ya sabes todo lo necesario para desarrollar profesionalmente desde tu teléfono.
