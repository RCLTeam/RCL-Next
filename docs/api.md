# API implementada — fase 1

Prefijo: `/api/v1`. Respuestas correctas: `{ "data": ... }`. Errores: `{ "error": { "code": "...", "message": "..." } }`; validación añade details.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | /health/live | Proceso vivo, fuera del prefijo |
| GET | /health/ready | Consulta real a seasons; 503 si falla, fuera del prefijo |
| GET | /api/v1/seasons | Todas las temporadas; activas primero |
| GET | /api/v1/seasons/:seasonId/divisions | Divisiones ordenadas |
| GET | /api/v1/divisions/:divisionId/teams | Equipos de esa división |
| GET | /api/v1/divisions/:divisionId/rounds | Jornadas y fases |
| GET | /api/v1/divisions/:divisionId/calendar?roundId=UUID | Series, equipos, marcador y jornada |
| GET | /api/v1/divisions/:divisionId/standings?stage=regular | Tabla calculada desde resultados |

Los identificadores son UUID. Un formato inválido devuelve 422; un recurso inexistente 404. Las consultas no cruzan temporadas porque cada división pertenece a una temporada. El calendario puede filtrarse por jornada. La clasificación por fase conserva el orden de la aplicación antigua.

Las colecciones de competición se limitan por división y devuelven el conjunto completo, sin paginación en esta fase. El servicio depende de CompetitionRepository; únicamente la implementación PostgreSQL importa Drizzle. Los controladores usan Zod. Express 5 propaga los rechazos asíncronos al middleware central.

No hay autenticación ni rutas POST/PUT/PATCH de negocio en esta primera entrega. La API es pública y de solo lectura. Ningún endpoint de administración admite tokens de desarrollo, usuarios falsos ni claves hardcodeadas. El seed crea únicamente un usuario viewer ficticio.

La configuración de CORS acepta el origen definido en CORS_ORIGIN. El servidor local escucha en 127.0.0.1; una futura imagen de contenedor deberá configurar HOST=0.0.0.0. Los detalles SQL y credenciales no se devuelven en errores.
