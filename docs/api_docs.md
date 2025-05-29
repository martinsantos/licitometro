# Documentación de la API del LICITOMETRO

Esta documentación describe los endpoints disponibles en la API del LICITOMETRO.

## Base URL

```
http://localhost:8000/api
```

## Autenticación

Actualmente, la API no requiere autenticación para operaciones de lectura. Para operaciones de escritura, se implementará autenticación en futuras versiones.

## Endpoints

### Licitaciones

#### Listar licitaciones

```
GET /licitaciones
```

Obtiene un listado de licitaciones con filtros opcionales.

**Parámetros de consulta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| skip | integer | Número de registros a omitir (para paginación) |
| limit | integer | Número máximo de registros a devolver |
| organismo | string | Filtrar por organismo |
| estado | string | Filtrar por estado (activa, cerrada, adjudicada, cancelada) |
| fecha_desde | date | Filtrar por fecha de publicación desde (YYYY-MM-DD) |
| fecha_hasta | date | Filtrar por fecha de publicación hasta (YYYY-MM-DD) |
| texto | string | Buscar en título y descripción |

**Respuesta:**

```json
[
  {
    "id": 1,
    "titulo": "Construcción de puente peatonal en Avenida Principal",
    "organismo": "Ministerio de Obras Públicas",
    "fecha_publicacion": "2025-05-15T00:00:00.000Z",
    "fecha_cierre": "2025-06-15T00:00:00.000Z",
    "presupuesto": 500000.0,
    "estado": "activa",
    "url_fuente": "https://www.mopc.gov.py/licitaciones/12345",
    "fuente_id": 2
  },
  // ...más licitaciones
]
```

#### Obtener detalle de licitación

```
GET /licitaciones/{licitacion_id}
```

Obtiene el detalle completo de una licitación específica.

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| licitacion_id | integer | ID de la licitación |

**Respuesta:**

```json
{
  "id": 1,
  "titulo": "Construcción de puente peatonal en Avenida Principal",
  "descripcion": "Proyecto para la construcción de un puente peatonal de 50 metros de longitud en la Avenida Principal, incluyendo rampas de acceso y iluminación LED.",
  "organismo": "Ministerio de Obras Públicas",
  "fecha_publicacion": "2025-05-15T00:00:00.000Z",
  "fecha_cierre": "2025-06-15T00:00:00.000Z",
  "presupuesto": 500000.0,
  "estado": "activa",
  "url_fuente": "https://www.mopc.gov.py/licitaciones/12345",
  "fuente_id": 2,
  "fecha_creacion": "2025-05-10T14:30:00.000Z",
  "fecha_actualizacion": "2025-05-10T14:30:00.000Z",
  "documentos": [
    {
      "id": 1,
      "nombre": "pliego_de_bases.pdf",
      "tipo": "application/pdf",
      "tamano": 1024.5,
      "url": "/api/files/licitaciones/1/documentos/pliego_de_bases.pdf",
      "licitacion_id": 1,
      "fecha_creacion": "2025-05-10T14:35:00.000Z"
    }
  ],
  "categorias": [
    {
      "id": 1,
      "nombre": "Infraestructura",
      "descripcion": "Proyectos de construcción y mantenimiento de infraestructura pública"
    }
  ]
}
```

#### Crear licitación

```
POST /licitaciones
```

Crea una nueva licitación.

**Cuerpo de la solicitud:**

```json
{
  "titulo": "Nueva licitación",
  "descripcion": "Descripción detallada de la licitación",
  "organismo": "Nombre del organismo",
  "fecha_publicacion": "2025-05-25T00:00:00.000Z",
  "fecha_cierre": "2025-06-25T00:00:00.000Z",
  "presupuesto": 100000.0,
  "estado": "activa",
  "url_fuente": "https://ejemplo.com/licitacion",
  "fuente_id": 1
}
```

**Respuesta:**

Devuelve el objeto licitación creado, incluyendo su ID.

#### Actualizar licitación

```
PUT /licitaciones/{licitacion_id}
```

Actualiza una licitación existente.

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| licitacion_id | integer | ID de la licitación |

**Cuerpo de la solicitud:**

```json
{
  "titulo": "Título actualizado",
  "estado": "cerrada",
  "fecha_cierre": "2025-06-20T00:00:00.000Z"
}
```

**Respuesta:**

Devuelve el objeto licitación actualizado.

#### Eliminar licitación

```
DELETE /licitaciones/{licitacion_id}
```

Elimina una licitación.

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| licitacion_id | integer | ID de la licitación |

**Respuesta:**

Devuelve el objeto licitación eliminado.

### Documentos

#### Adjuntar documento a licitación

```
POST /licitaciones/{licitacion_id}/documentos
```

Adjunta un documento a una licitación.

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| licitacion_id | integer | ID de la licitación |

**Parámetros de formulario:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| nombre | string | Nombre del documento |
| tipo | string | Tipo MIME del documento (opcional) |
| archivo | file | Archivo a adjuntar |

**Respuesta:**

```json
{
  "id": 1,
  "nombre": "pliego_de_bases.pdf",
  "tipo": "application/pdf",
  "tamano": 1024.5,
  "url": "/api/files/licitaciones/1/documentos/pliego_de_bases.pdf",
  "ruta_almacenamiento": "/app/storage/licitaciones/1/documentos/uuid_pliego_de_bases.pdf",
  "licitacion_id": 1,
  "fecha_creacion": "2025-05-25T15:30:00.000Z"
}
```

#### Listar documentos de licitación

```
GET /licitaciones/{licitacion_id}/documentos
```

Obtiene los documentos asociados a una licitación.

**Parámetros de ruta:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| licitacion_id | integer | ID de la licitación |

**Respuesta:**

```json
[
  {
    "id": 1,
    "nombre": "pliego_de_bases.pdf",
    "tipo": "application/pdf",
    "tamano": 1024.5,
    "url": "/api/files/licitaciones/1/documentos/pliego_de_bases.pdf",
    "licitacion_id": 1,
    "fecha_creacion": "2025-05-25T15:30:00.000Z"
  },
  // ...más documentos
]
```

### Fuentes

#### Listar fuentes

```
GET /fuentes
```

Obtiene un listado de fuentes de datos.

**Respuesta:**

```json
[
  {
    "id": 1,
    "nombre": "Portal Nacional de Contrataciones",
    "url": "https://www.contrataciones.gov.py",
    "tipo": "web",
    "activa": true,
    "configuracion": "{\"selector\": \".licitaciones-table\", \"pagination\": true}",
    "fecha_creacion": "2025-05-01T00:00:00.000Z",
    "fecha_actualizacion": "2025-05-01T00:00:00.000Z"
  },
  // ...más fuentes
]
```

#### Crear fuente

```
POST /fuentes
```

Crea una nueva fuente de datos.

**Cuerpo de la solicitud:**

```json
{
  "nombre": "Nueva fuente",
  "url": "https://ejemplo.com/licitaciones",
  "tipo": "web",
  "activa": true,
  "configuracion": "{\"selector\": \".licitaciones\", \"pagination\": false}"
}
```

**Respuesta:**

Devuelve el objeto fuente creado, incluyendo su ID.

## Códigos de Estado

La API utiliza los siguientes códigos de estado HTTP:

- `200 OK`: La solicitud se completó correctamente
- `400 Bad Request`: La solicitud contiene datos inválidos
- `404 Not Found`: El recurso solicitado no existe
- `500 Internal Server Error`: Error interno del servidor

## Formatos de Fecha

Todas las fechas se manejan en formato ISO 8601: `YYYY-MM-DDTHH:MM:SS.sssZ`
