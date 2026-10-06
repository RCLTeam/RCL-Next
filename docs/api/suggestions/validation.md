# Validación de Entrada y Reglas de Dominio de Sugerencias

[⬅️ Volver a API Suggestions](README.md) | [Siguiente: Contratos ➡️](contracts.md)

---

## 1. Visión General

El módulo de sugerencias implementa una estrategia de **validación imperativa en dos capas** (enrutador HTTP y servicio de dominio), descartando el uso de librerías externas de validación basada en esquemas declarativos (como Zod, TypeBox o Joi) en favor de comprobaciones nativas de alto rendimiento.

Esta arquitectura asegura un comportamiento *fail-fast*, defensas activas contra cargas útiles maliciosas o vacías, y protección perimetral contra solicitudes cruzadas no autorizadas.

---

## 2. Validación de Origen contra CSRF (`Origin`)

Antes de inspeccionar los datos enviados en el cuerpo de la petición, el enrutador HTTP verifica la legitimidad del origen de la solicitud (`suggestions.router.ts:30-35`):

```typescript
if (frontendOrigin) {
  const origin = req.headers.origin;
  if (!origin || origin !== frontendOrigin) {
    throw new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.');
  }
}
```

- **Comportamiento:** Si la variable `frontendOrigin` está definida en el entorno, la cabecera HTTP `Origin` es obligatoria y debe ser estrictamente idéntica.
- **Respuesta de Error:** HTTP 403 Forbidden con código `INVALID_ORIGIN`.
- **Mitigación:** Previene que sitios web de terceros puedan emitir sugerencias espurias utilizando las cookies o sesiones de usuarios legítimos del portal.

---

## 3. Validación de Longitud del Texto de Sugerencia

El contenido de la propuesta se somete a validación tanto en el enrutador (`suggestions.router.ts:37-49`) como en el servicio de dominio (`suggestions.service.ts:133-145`).

### 3.1 Reglas de Validación
1. **Comprobación de Tipo Primitivo:**
   El campo `suggestion` debe existir en el cuerpo de la petición y su tipo debe ser estrictamente `string`. Si se envía otro tipo (número, arreglo, objeto o nulo), se rechaza de inmediato:
   ```typescript
   if (typeof rawSuggestion !== 'string') {
     throw new AppError(400, 'VALIDATION_ERROR', 'Suggestion must be a string');
   }
   ```
2. **Normalización y Saneamiento de Espacios:**
   Se aplica `trim()` para eliminar espacios en blanco al inicio y al final antes de evaluar la longitud efectiva:
   ```typescript
   const trimmed = rawSuggestion.trim();
   ```
   Esto previene que cadenas compuestas únicamente por espacios, tabulaciones o saltos de línea puedan eludir la validación.
3. **Rango de Longitud (10 a 1000 caracteres):**
   ```typescript
   if (trimmed.length < 10 || trimmed.length > 1000) {
     throw new AppError(
       400,
       'VALIDATION_ERROR',
       'Suggestion must be between 10 and 1000 characters'
     );
   }
   ```
   - **Límite Inferior (10 caracteres):** Garantiza que la propuesta contenga suficiente información descriptiva y evita spam de mensajes monosilábicos.
   - **Límite Superior (1000 caracteres):** Asegura que el contenido quepa cómodamente en los embeds y límites de mensajes de la API de Discord sin riesgo de truncamiento inadvertido.

### 3.2 Formato de Respuesta de Error de Validación
Ante cualquier incumplimiento de las reglas anteriores, el servidor emite una respuesta HTTP 400 Bad Request estructurada:
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Suggestion must be between 10 and 1000 characters"
}
```

---

## 4. Validación del Parámetro de Anonimato (`isAnonymous`)

El campo `isAnonymous` en el cuerpo de la petición se evalúa de forma defensiva:
- Solo se interpreta como anónimo explícito si su valor es el booleano estricto `true`.
- Si se omite, o si se envía `false` o cualquier otro valor falso, se procede a resolver la identidad del usuario a través de la sesión en cookies (`suggestions.router.ts:55-64`).
- Si el usuario no cuenta con una sesión válida activa, el servicio fuerza el anonimato automáticamente sin arrojar error, garantizando que los usuarios no registrados puedan aportar sugerencias constructivas sin fricción.
