# Bola de cristal

[Web](../README.md) · [API](../../api/crystal-ball/README.md)

La página `/bola-cristal` contiene reglas compactas con horarios integrados, selector de liga en la toolbar, boleto y ranking de videntes basado en `CommunityRankingPanel`, compartido con predictores. La configuración y resolución están en `/admin/crystal-ball`, restringidas a admin/owner.

## Organización

- `components/`: reglas, formulario, selectores modales y administración, junto a sus estilos.
- `hooks/`: `useCrystalBall` y estados de selección de temporada/división.
- `types/`: contratos internos de la vista administrativa.

Los selectores presentan logos con peso visual normalizado, nombres cortos de equipo, avatares Discord de jugadores y retratos de campeones. Los nombres largos se truncan en una línea. El modal desplaza su lista interior y mantiene visibles búsqueda y acciones. Las selecciones se confirman antes de aplicarse al boleto.

**Limpiar** se puede confirmar también en el boleto público. Permite vaciar una rama e intercambiar equipos con la otra, incluso en ligas de seis equipos. Un boleto incompleto no se puede guardar; una selección parcial de una rama tampoco se confirma. El guard de navegación avisa de cambios sin guardar.

## Sincronización y estados

`useCrystalBall` asocia datos y respuestas a temporada, división y usuario. Cancela lecturas anteriores y descarta respuestas tardías; no muestra el boleto de otra liga o sesión. Sondea cada 15 segundos, refresca tras escribir y suspende el sondeo durante una escritura. El estado de cierre también se actualiza localmente al llegar la hora.

Administración refleja los nuevos datos del sondeo mientras no haya cambios locales. Los borradores de fechas y resultados se mantienen durante una edición. El cálculo no elimina resultados manuales previamente guardados. Tras calcular, las preguntas automáticas pendientes ofrecen selector manual; la campaña no aparece resuelta hasta completar todas.

La carga del catálogo se distingue del error de descarga. Las temporadas y divisiones contemplan carga, error y lista vacía. Las preguntas con campeones esperan al catálogo antes de permitir editar el boleto.

## Pruebas

`CrystalAnswerPicker.test.tsx`, `CrystalSeason.test.tsx`, `CrystalAdmin.test.tsx` y `useCrystalBall.test.tsx` cubren intercambio de equipos, selecciones incompletas, carga del catálogo, navegación con cambios, actualización de datos, conservación de borradores y respuestas tardías de otra liga o usuario.
