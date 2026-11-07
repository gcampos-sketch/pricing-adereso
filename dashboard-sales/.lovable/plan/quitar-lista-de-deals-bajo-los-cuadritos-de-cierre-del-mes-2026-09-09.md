# Quitar lista de deals bajo los cuadritos de "Cierre del mes"

## Cambio
En `src/components/pulse/PulseDashboard.tsx`, dentro de la sección "Cierre del mes e higiene de fechas", existe un bloque `<div className="track-focus">` (líneas 816–891) que muestra:
1. Una barra de estado "Higiene de fechas X%" (compacta, 1 línea)
2. Una tabla completa de deals con columnas Deal, Comercial, Etapa, Monto, Cierre, Días, % cierre, Adobo, Abrir deal

Esa tabla es redundante: al pinchar el cuadrito "Cierran {mes}" ya se abre el mismo listado en un modal (`closeData.monthModal`).

### Acción
- Eliminar la tabla y su estado vacío (líneas 836–890).
- Conservar la barra "Higiene de fechas X%" (líneas 817–835) porque es compacta y resume la salud de fechas en una línea.
- El bloque `track-focus` queda solo con la barra de estado.

## Verificación
- `bunx tsgo --noEmit`
- Revisar en preview que la sección "Cierre del mes" muestre solo los cuadritos + chips de comercial + barra "Higiene de fechas", sin la tabla larga.
