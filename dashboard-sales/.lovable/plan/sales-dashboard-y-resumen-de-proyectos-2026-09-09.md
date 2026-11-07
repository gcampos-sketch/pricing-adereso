# Sales Dashboard y resumen de Proyectos

## Cambios visibles
- Renombrar “Pulso Pipeline Ejecutivo” a “Sales Dashboard” en la aplicación, acceso y metadatos.
- Compactar Proyectos con la misma jerarquía escaneable del resumen ejecutivo, eliminando métricas repetidas.
- Rehacer la carrera con los deals según su etapa actual exacta: etapa 6, warning, 6.2/desarrollo, piloto, onboarding e inicio de servicio. Eliminar el agregado artificial “etapa 6+”.
- Añadir “Perdido en desarrollo” al final de la carrera, con cantidad, monto y acceso al detalle.
- Priorizar cuatro estados de comisión: setup pendiente, primer MRR pendiente, setup pagado y primer MRR pagado. Los pendientes tendrán tarjeta propia y acceso al listado; los pagados mostrarán solo cantidad.
- Mantener contratos y estados de proyecto en tablas compactas, quitando paneles redundantes que repiten la misma población.

## Detalles técnicos
- Calcular los grupos por `dealstage` actual en servidor y exponer sus contadores, montos y drilldowns en los tipos existentes.
- Usar el estado perdido en desarrollo de HubSpot y conservar los filtros maestros de año, trimestre y comercial.
- Separar drilldowns pendientes de los pagados para que cada tarjeta abra exactamente los deals correspondientes.
- Verificar tipado y la vista en preview sin publicar.
