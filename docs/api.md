# API implementada

Prefijo: `/api/v1`. Respuestas correctas: `{ "data": ... }`. Errores: `{ "error": { "code": "...", "message": "..." } }`; validación añade details.

## Administración

Todas las rutas `/api/v1/crud-operations` requieren sesión `admin` y responden con `Cache-Control: no-store`. POST, PUT y DELETE exigen `Origin` igual al frontend configurado.

| Método | Ruta | Cuerpo / respuesta |
| --- | --- | --- |
| GET | /crud-operations/resources | Catálogo de entidades y campos editables, sin metadatos SQL |
| GET | /crud-operations/:resource?search=texto&offset=0 | `{ data: { records, hasMore } }`, páginas de 50 y orden por clave |
| POST | /crud-operations/:resource | Campos editables; devuelve 201 y registro creado |
| PUT | /crud-operations/:resource | `{ key, version, values }`; reemplaza los campos editables y devuelve 200 |
| DELETE | /crud-operations/:resource | `{ key, version }`; devuelve 204 sin cuerpo |

Entidades admitidas: `seasons`, `divisions`, `competitions`, `teams`, `users`, `players`, `memberships`, `rounds`, `matches`. `key` es un objeto con las claves indicadas por el catálogo (incluidas ambas columnas en claves compuestas). `version` conserva exactamente el `updatedAt` recibido. UUID, timestamps automáticos y privilegios no son campos de escritura. Los campos opcionales vacíos se envían como `null`. Los listados pueden añadir campos `nombreDelCampoLabel` para mostrar relaciones legibles.

Validación estricta de cuerpo y consulta: 422. Registro/entidad inexistente: 404. Sesión ausente/caducada: 401. Rol u origen incorrecto: 403. Dependencias, duplicados, cambios obsoletos o resultados protegidos: 409. Administración sin configurar: 503. Los fallos no exponen SQL ni credenciales. Véanse [los flujos y restricciones](administration.md).

## Consulta pública

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | /health/live | Proceso vivo, fuera del prefijo |
| GET | /health/ready | Consulta real a seasons; 503 si falla, fuera del prefijo |
| GET | /api/v1/seasons | Fecha de inicio descendente, fechas nulas al final y nombre ascendente para desempatar; sin `isActive` |
| GET | /api/v1/seasons/:seasonId/divisions | Divisiones ordenadas |
| GET | /api/v1/divisions/:divisionId/teams | Equipos de esa división |
| GET | /api/v1/divisions/:divisionId/rounds | Jornadas y fases |
| GET | /api/v1/divisions/:divisionId/calendar?roundId=1 | Series, equipos, marcador y jornada |
| GET | /api/v1/divisions/:divisionId/standings?stage=regular | Tabla calculada desde resultados |

seasonId es ahora el nombre de la temporada, codificado en la URL. divisionId es el UUID de seasons_divisions, no el nombre de la división. roundId es un número smallint representado como texto, acotado a esa relación temporada/división. Un formato inválido devuelve 422; un recurso inexistente 404. El calendario puede filtrarse por jornada. La clasificación por fase conserva el orden de la aplicación antigua.

### Validación estricta y control de errores 422

Los endpoints que aceptan query parameters (`/api/v1/divisions/:divisionId/calendar` y `/api/v1/divisions/:divisionId/standings`) aplican validación estricta de esquemas Zod con `.strict()`. La presencia de cualquier parámetro no reconocido (por ejemplo `?unexpected=1`) o un formato inválido en los valores esperados (como un `roundId` que no sea un entero representable en un `smallint` de PostgreSQL entre -32768 y 32767) provoca el rechazo inmediato de la petición con estado HTTP 422 (Unprocessable Entity) y la estructura de error estandarizada generada por `error.flatten()`:

Para parámetros no reconocidos (`.strict()`):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request.",
    "details": {
      "formErrors": [
        "Unrecognized key(s) in object: 'unexpected'"
      ],
      "fieldErrors": {}
    }
  }
}
```

Para fallos de validación en campos específicos (por ejemplo `roundId=999999`):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request.",
    "details": {
      "formErrors": [],
      "fieldErrors": {
        "roundId": [
          "Invalid input"
        ]
      }
    }
  }
}
```

Se mantienen los nombres de los DTO: Season.id contiene name; Division.code contiene name; Round.sequence contiene id y Round.lockAt es null (ya no existe lock_at). Los campos homeTeamId/awayTeamId y homeScore/awayScore se obtienen de team1_id/team2_id y team1_score/team2_score.

Las colecciones de competición se limitan por división y devuelven el conjunto completo, sin paginación en esta fase. El servicio depende de CompetitionRepository; únicamente la implementación PostgreSQL importa Drizzle. Los controladores usan Zod. Express 5 propaga los rechazos asíncronos al middleware central.

No hay autenticación en las rutas REST actuales. Ningún endpoint de administración admite tokens de desarrollo, usuarios falsos ni claves hardcodeadas. Todos los usuarios ficticios del seed tienen rol viewer.

La configuración de CORS acepta el origen definido en CORS_ORIGIN. El servidor local escucha en 127.0.0.1; una futura imagen de contenedor deberá configurar HOST=0.0.0.0. Los detalles SQL y credenciales no se devuelven en errores.

### WebSocket Ingestion Gateway: `/ws/rofl-upload`

- **URL:** `ws://<host>:<port>/ws/rofl-upload`
- **Wire protocol:**
  - Client start frame: `{ type: "start", filename: "<string>" }`
  - Direct binary streaming chunks (64–128 KB) enviadas como datos binarios (ArrayBuffer/Blob).
  - Client finish frame: `{ type: "finish" }`
- **Backpressure management:** El servidor llama a `ws.pause()` cuando el buffer del stream de escritura (write stream buffer) se llena, y reanuda el consumo con `ws.resume()` al recibir el evento `'drain'`.
- **Server events:**
  - `started`: Confirmación de inicio.
  - `queue`: Posición en la cola de procesamiento (`position`, `total`).
  - `stage`: Fase actual (`decompressing`, `parsing`, `validating`, `persisting`, `completed`).
  - `progress`: Progreso porcentual y mensajes (`percent`, `message`).
  - `warning`, `anomaly`: Avisos y anomalías detectadas.
  - `success`, `error`: Finalización exitosa o error crítico.
- **Cleanup:** Limpieza determinista de descriptores y flujos ante la desconexión del socket (`ws.on('close')`).

## Autenticación Discord

Las rutas `/api/v1/auth/discord`, `/api/v1/auth/discord/callback`, `/api/v1/auth/me` y `/api/v1/auth/logout` están implementadas. Consulta [autenticación](authentication.md) para configuración, cookies, permisos y contrato completo.
