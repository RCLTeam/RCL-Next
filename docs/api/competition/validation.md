# Validación de Entradas y Manejo de Errores

[⬅️ Volver a Persistencia](persistence.md) | [Siguiente: Contratos ➡️](contracts.md)

---

## 1. Visión General

La capa de transporte HTTP del módulo de competición (`apps/api/src/modules/competition/competition.controller.ts:1-91`) aplica validación de esquemas en tiempo de ejecución utilizando la librería **Zod**. 

La estrategia de validación sigue el principio de **detección temprana (*Fail-Fast*)**: cualquier parámetro de ruta o de consulta que no cumpla estrictamente con la estructura esperada es rechazado antes de invocar la lógica de negocio o ejecutar consultas en la base de datos, transformándose automáticamente en una respuesta HTTP 422 `VALIDATION_ERROR`.

---

## 2. Esquemas de Validación Zod

### 2.1 Identificadores de Ruta Alfanuméricos y Slugs
**Endpoints**: `/matches/:matchId`, `/players/:playerId`, `/teams/:teamId`  
**Ubicación**: `competition.controller.ts:10-15, 28-33, 40-45`

```typescript
z.string()
  .min(1)
  .max(400)
  .regex(/^[\p{L}\p{N}-]+$/u)
```

- **Propiedades del esquema**:
  - `min(1)` / `max(400)`: Impide cadenas vacías o sobrecargas de memoria por buffers excesivos.
  - `\p{L}`: Admite cualquier letra en cualquier alfabeto Unicode (permitiendo tildes, caracteres especiales o nombres internacionales).
  - `\p{N}`: Admite dígitos numéricos.
  - `-`: Admite guiones separadores de slugs.
  - Flag `/u`: Habilita el soporte completo de Unicode en la expresión regular.
- **Rechazos garantizados**: Caracteres de puntuación no admitidos (ej. `!`, `?`, `$`, `@`), espacios en blanco o caracteres de inyección provocan un error de validación inmediato (HTTP 422).

### 2.2 Identificadores Universales Únicos (UUIDs)
**Endpoints**: `/divisions/:divisionId/*`  
**Ubicación**: `competition.controller.ts:21, 58, 61, 64, 79, 83`

```typescript
z.string().uuid()
```
- Valida que el parámetro de ruta corresponda a un UUID RFC 4122 canónico. Identificadores malformados o no UUID devuelven un código HTTP 422.

### 2.3 Rango Numérico de Jornadas (`smallint`)
**Endpoint**: `GET /api/v1/divisions/:divisionId/calendar`  
**Ubicación**: `competition.controller.ts:65-74`

```typescript
const query = z
  .object({
    roundId: z
      .string()
      .regex(/^-?\d+$/)
      .refine((value) => Number(value) >= -32768 && Number(value) <= 32767)
      .optional()
  })
  .strict()
  .parse(req.query);
```
- **Alineación con el motor de base de datos**: En la tabla relacional `rounds`, la columna `id` es de tipo `smallint` (2 bytes, rango de `-32768` a `32767`). El esquema verifica sintácticamente que la cadena esté compuesta por dígitos con signo opcional y valida que su valor numérico no desborde los límites de almacenamiento de PostgreSQL, evitando excepciones no controladas de la base de datos.
- **Modificador `.strict()`**: Exige que no se transmitan parámetros adicionales en la query string. Cualquier clave no declarada (ej. `?roundId=1&foo=bar`) causa el rechazo de la solicitud con HTTP 422.

### 2.4 Fase de Competición en Clasificaciones
**Endpoint**: `GET /api/v1/divisions/:divisionId/standings`  
**Ubicación**: `competition.controller.ts:84-87`

```typescript
const query = z
  .object({
    stage: z.string().trim().min(1).max(64).default('regular')
  })
  .strict()
  .parse(req.query);
```
- Limpia espacios en blanco periféricos, limita la longitud de la cadena entre 1 y 64 caracteres, y asigna `'regular'` como valor por defecto si el parámetro se omite.
- Aplica `.strict()` para rechazar parámetros espurios.

---

## 3. Matriz de Errores de Negocio (HTTP 404)

Más allá de la validación sintáctica de Zod, la capa de servicio (`competition.service.ts`) implementa verificaciones de integridad referencial y reglas deportivas que generan respuestas HTTP 404 `NOT_FOUND`:

| Condición de Falla | Ubicación en Código | Excepción Emitida | Código HTTP |
|---|---|---|:---:|
| Partido no encontrado en base de datos | `competition.service.ts:75, 87` | `notFound('Match')` | **404** |
| Partido en estado distinto a `'completed'` o `'forfeit'` | `competition.service.ts:77-78` | `notFound('Match')` | **404** |
| Jugador o slug de jugador no encontrado | `competition.service.ts:132, 134` | `notFound('Player')` | **404** |
| Equipo o slug de equipo no encontrado | `competition.service.ts:150, 152` | `notFound('Team')` | **404** |
| Temporada no encontrada | `competition.service.ts:188` | `notFound('Season')` | **404** |
| División no encontrada en la base de datos | `competition.service.ts:124, 192` | `notFound('Division')` | **404** |
| `roundId` numérico no pertenece a la división indicada | `competition.service.ts:210` | `notFound('Round')` | **404** |

---

## 4. Estructura de Respuestas de Error

El middleware global de control de excepciones captura los errores de Zod y los errores de aplicación (`AppError`), formateando la respuesta JSON:

### Error de Validación (HTTP 422)
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input parameters",
  "details": [
    {
      "path": ["roundId"],
      "message": "Invalid",
      "code": "custom"
    }
  ]
}
```

### Recurso No Encontrado (HTTP 404)
```json
{
  "error": "NOT_FOUND",
  "message": "Match not found"
}
```
