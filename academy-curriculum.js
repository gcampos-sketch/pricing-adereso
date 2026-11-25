// Authenticated learning content. These practices are not commercial certification.
export const LEGACY_MISSION_REVISION = '2026-11-13.1';
export const ROLES = {
  SDR: { name: 'SDR', goal: 'Califica y entrega oportunidades con contexto.', missions: ['discovery', 'scope', 'handoff'], lessons: [1, 2, 3, 15] },
  AE: { name: 'Account Executive', goal: 'Del discovery a una propuesta defendible.', missions: ['discovery', 'demo', 'scope', 'objection', 'proposal', 'handoff'], lessons: [3, 22, 4, 5, 6, 7] },
  KAM: { name: 'Key Account Manager', goal: 'Entiende la cuenta, anticipa riesgos y encuentra valor.', missions: ['discovery', 'scope', 'renewal', 'proposal', 'handoff'], lessons: [24, 25, 8, 9] },
};
export const TRAINING_LEVELS = {basic:'Básico',intermediate:'Medio',advanced:'Avanzado'};
export const trainingLevel = mission => mission.level ?? 'intermediate';
const q = (id, prompt, options, correct, explanation, skill, critical = false) => ({ id, prompt, options, correct, explanation, skill, critical });
const WIKI = 'https://app.notion.com/p/3219c2747df581a2baebde4de645d487';
const TEAM_PERFORMANCE = 'https://help.adereso.ai/anal%C3%ADtica/89RzusWYBEWNTBJg2WFu5G/rendimiento-de-equipo/71YFbZFH7Q4AErniCZrPMy';
const BUTTON_ANALYTICS = 'https://help.adereso.ai/adereso-engage-mis-campa%C3%B1as/6jf5LkrjFuc3QJXWBTqY5e/medir-y-analizar-botones-de-campa%C3%B1as-de-whatsapp/97JuCUbFZ3uJ5iFiL1NmPG';
export const DEMO_MISSIONS = [
  { id:'demo-orders', level:'basic', revision:'2026-11-22.1', title:'¿Dónde está mi pedido?', skill:'Demo de postventa', minutes:8, lesson:22,
    story:'Caso simulado · Una tienda quiere que sus clientes consulten el estado de su pedido por WhatsApp, incluso fuera de horario.',
    reference:{section:'Casos de uso — Studio', query:'Shopify — una tienda por agente', url:WIKI},
    demo:{
      steps:['Pregunta qué sistema tiene el estado del pedido y qué datos usa para identificarlo.', 'En Studio → Probar, usa un pedido ficticio encontrado y otro sin datos suficientes. En Desk, abre el ticket de la derivación y muestra el contexto que recibe el ejecutivo.', 'Acuerda con el cliente qué conexión, permisos y datos debe validar para repetir el recorrido con su operación.'],
      rubric:['Mostró el caso exitoso y la excepción.', 'El ejecutivo pudo retomar con contexto.', 'Separó los datos simulados de la integración pendiente.']
    },
    questions:[
      q('orders-discovery','¿Qué necesitas saber antes de preparar la demo?',['Qué sistema contiene el estado y cómo se identifica el pedido.','En qué color quieren el widget.','Cuántas pantallas de Studio quieren recorrer.'],0,'Elegir el sistema y el dato de identificación permite preparar la consulta y una salida segura cuando falta información.','Demo'),
      q('orders-show','¿Qué recorrido le mostrarías al cliente?',['Solo el reporte de tickets cerrados.','La configuración del agente y sus preguntas frecuentes.','La consulta en Studio y el ticket de una derivación en Desk.'],2,'La demo permite ver qué recibe el comprador y qué contexto queda para la persona que atiende la excepción.','Demo'),
      q('orders-limit','El tester respondió con un pedido ficticio. ¿Qué puedes afirmar?',['La API del cliente ya está lista.','El recorrido está demostrado; falta validar la conexión a los datos del cliente.','Cualquier tienda funcionará igual.'],1,'Los datos ficticios prueban el recorrido mostrado. La disponibilidad, los accesos y las respuestas reales del sistema se validan por separado.','Alcance',true)
    ] },
  { id:'demo-followup', level:'advanced', revision:'2026-11-22.1', title:'La venta quedó a medias', skill:'Demo de seguimiento', minutes:8, lesson:22,
    story:'Caso simulado · Un comprador preguntó por un producto y dejó de responder. El cliente quiere recuperar la conversación sin insistir cuando ya no corresponde.',
    reference:{section:'Seguimientos automáticos de venta — cómo se configuraron y probaron',query:'temporizadores nativos de 5 y 60 minutos',url:WIKI},
    demo:{
      steps:['Pregunta qué señales distinguen una venta activa de postventa, compra confirmada o una solicitud de no contacto.', 'En Studio → Configurar → Automatizaciones, muestra los temporizadores de 5 y 60 minutos desde el último mensaje del cliente. Simula silencio, respuesta y una exclusión en un agente de prueba.', 'Explica la evidencia: primer aviso verificado en WhatsApp real de ADERESO DEMO; segundo aviso probado internamente. Acuerda qué verificar en la cuenta y el canal del cliente.'],
      rubric:['Explicó desde cuándo corre cada plazo.', 'Mostró cuándo se reinicia o se suprime el seguimiento.', 'Diferenció la prueba interna de la entrega verificada en WhatsApp.']
    },
    questions:[
      q('followup-discovery','¿Qué preguntas para definir cuándo sale el seguimiento?',['Qué mensaje conviene repetir todos los días.','Qué señales indican una venta activa y cuándo se debe parar.','Cuántos avisos le gustaría enviar a toda la base.'],1,'El seguimiento se diseña con condiciones de entrada y exclusiones. Una venta confirmada o un pedido de no contacto cambia el recorrido.','Demo'),
      q('followup-show','¿Qué conviene probar delante del cliente?',['Silencio, nueva respuesta y una exclusión, contando ambos plazos desde el último mensaje.','Ir directamente a un envío desde una cuenta de producción.','Configurar el segundo aviso 60 minutos después del primero.'],0,'Los plazos parten del último mensaje del cliente y se reinician al responder. Contrastar los tres resultados hace visible la lógica.','Demo'),
      q('followup-limit','¿Cuál es el alcance de la evidencia del segundo aviso?',['Entrega verificada en WhatsApp real de todas las demos.','Resultados de venta demostrados en producción.','La lógica se probó internamente; la entrega real del aviso de 60 minutos quedó por verificar.'],2,'El primer aviso se recibió en WhatsApp real de ADERESO DEMO. El segundo, el reinicio y las exclusiones se comprobaron internamente.','Alcance',true)
    ] },
  { id:'demo-buttons', level:'intermediate', revision:'2026-11-22.1', title:'¿Quién hizo clic en el catálogo?', skill:'Demo de analítica', minutes:8, lesson:10,
    story:'Caso simulado · Marketing quiere enviar un catálogo por campaña de WhatsApp y saber cuántos destinatarios distintos de esa campaña usaron el enlace.',
    reference:{section:'Medir y analizar botones de campañas de WhatsApp',query:'enlaces medidos',url:BUTTON_ANALYTICS},
    demo:{
      steps:['Confirma si quiere medir una campaña de WhatsApp o diseñar una conversación interactiva con un agente.', 'En BSP, muestra un botón URL con Medir clics en una plantilla nueva. Abre Analítica → Engage (Mis campañas) → Campañas WhatsApp → Resultados de botones con un envío de prueba que ya tenga datos.', 'Compara Interacciones y Destinatarios por botón. Aclara que el porcentaje del informe usa como base las interacciones del resultado.'],
      rubric:['Ubicó la medición de campañas en Engage.', 'Mostró el requisito de la plantilla y una lectura realista del reporte.', 'Explicó por qué las sugerencias proactivas de Studio responden a otra necesidad.']
    },
    questions:[
      q('buttons-discovery','¿Qué distingues antes de elegir el producto?',['Si es una campaña de WhatsApp o una ayuda dentro de un chat con el agente.','Si el botón debería ser azul o verde.','Si los clics deberían sumarse por vendedor.'],0,'El origen del mensaje define qué pantalla mostrar. Las sugerencias proactivas de Studio ayudan a continuar el chat; este caso pregunta por una campaña.','Demo'),
      q('buttons-show','¿Dónde muestras la configuración y los resultados?',['En sugerencias proactivas de Studio.','En toda plantilla histórica, sin cambiar su configuración.','En un botón URL medido de una plantilla BSP nueva y luego en Resultados de botones de Engage.'],2,'Engage informa accesos a enlaces medidos de campañas Adereso BSP. Verifica la plantilla y el alcance compatible antes de prometer cobertura.','Alcance',true),
      q('buttons-count','Una persona abrió dos veces el mismo enlace. ¿Cómo lees el reporte?',['Siempre son dos destinatarios distintos.','Pueden ser dos interacciones del mismo destinatario.','El porcentaje se puede leer como conversión de toda la base.'],1,'Interacciones cuenta eventos válidos. Destinatarios cuenta originales distintos por botón; el porcentaje compara la participación en las interacciones del resultado.','Demo')
    ] },
  { id:'demo-desk-routing', level:'intermediate', revision:'2026-11-22.1', title:'¿Dónde se atrasan los tickets?', skill:'Demo de operación', minutes:8, lesson:8,
    story:'Caso simulado · Operaciones reparte tickets entre ventas y soporte, pero quiere entender dónde se acumulan y cuánto tarda la primera respuesta humana.',
    reference:{section:'Rendimiento de Equipo — Primera Atención',query:'Rendimiento del Equipo',url:TEAM_PERFORMANCE},
    demo:{
      steps:['Pregunta cómo se asignan hoy los tickets, qué departamentos participan y qué plazo usan como objetivo.', 'En Desk, sigue un ticket ficticio desde su entrada hasta su asignación y primera respuesta humana. Abre Analítica → Rendimiento de Equipo → Primera Atención y filtra por departamento.', 'Compara los tiempos y el SLA con el mismo período y filtros. Si la duda es carga actual, revisa Monitoreo o Asignaciones → Carga.'],
      rubric:['Mostró un ticket concreto y su primera respuesta humana.', 'Distinguió carga actual del rendimiento histórico filtrado.', 'Interpretó el indicador para el departamento y período elegidos.']
    },
    questions:[
      q('routing-discovery','¿Con qué pregunta empiezas?',['¿Qué color quieren para el reporte?','¿Qué departamentos reciben los tickets y cuándo esperan la primera respuesta humana?','¿Quieren reemplazar todos sus canales?'],1,'El proceso y su tiempo objetivo indican qué ticket y qué filtros conviene preparar para que la demo sea comparable.','Demo'),
      q('routing-show','¿Qué combinación muestra la operación y su resultado?',['Ticket, asignación y primera respuesta en Desk, seguido de Primera Atención por departamento.','Solo un gráfico general del mes.','Una campaña de Engage y su tasa de lectura.'],0,'Trazar el ticket y abrir el informe permite conectar la decisión de reparto con la evidencia que verá la persona supervisora.','Demo'),
      q('routing-limit','El bot contestó al instante. ¿Eso acredita el SLA de primera respuesta humana?',['Sí, cualquier mensaje del bot lo acredita.','Sí, si el ticket terminó cerrado.','Revisa la primera respuesta humana y los filtros del informe antes de concluir.'],2,'El SLA de primera atención del reporte se calcula sobre la primera respuesta humana en los tickets evaluados. La respuesta automática responde otra pregunta.','Alcance',true)
    ] },
];

export const ADVISORY_MISSIONS = [
  { id: 'advice-orders', level:'intermediate', revision: '2026-11-24.1', title: 'Estado del pedido fuera de horario', skill: 'Studio + Desk', minutes: 7, lesson: 22,
    story: 'Una tienda Shopify quiere reducir las consultas de despacho que llegan por WhatsApp de noche. Tiene el estado del pedido en Shopify, pero todavía no ha validado la conexión de la tienda.',
    advice: {
      flow: ['La persona escribe «¿dónde está mi pedido?».', 'El bot busca el estado usando solo el número de pedido.', 'Aunque la búsqueda falle, el bot responde «va en camino» y cierra.'],
      model: 'Podemos empezar con Studio explicando los plazos generales y dejando los casos individuales en Desk. Si validamos la conexión a Shopify y cómo confirmar que el pedido corresponde a la persona, automatizamos la consulta con el estado real. Ante un pedido ambiguo o una falla, Soporte recibe el contexto y retoma. Probemos un pedido válido, uno ajeno y una caída de la consulta.'
    },
    reference: {section:'Casos de uso — Studio',query:'Shopify',url:WIKI},
    questions: [
      q('advice-orders-flow','¿Qué flujo recomiendas si la conexión está lista para un piloto?',[
        'Pedir el número de pedido y devolver el estado que aparezca para ese número.',
        'Validar la identificación antes de consultar Shopify y derivar a Desk si faltan datos, hay ambigüedad o falla la consulta.',
        'Responder con el plazo promedio y cerrar los casos que no aparezcan.'
      ],1,'El estado individual debe venir de la tienda y corresponder a quien consulta. El contexto de la búsqueda permite que Soporte retome las excepciones.','Diseño de flujo',true),
      q('advice-orders-fallback','La conexión se retrasa. ¿Qué alternativa puedes ofrecer en la primera fase?',[
        'Explicar los plazos publicados y derivar las consultas individuales a Desk para revisión humana.',
        'Copiar los estados de la última semana al conocimiento de Studio y usarlos como estado actual.',
        'Pedir un pantallazo del pedido y estimar la fecha de entrega en el chat.'
      ],0,'Las políticas de despacho sirven para orientar. El estado de un pedido requiere una fuente actualizada o revisión humana.','Alcance'),
      q('advice-orders-pilot','¿Qué pruebas le propones a Operaciones?',[
        'Un pedido entregado y otro en tránsito, ambos del mismo comprador.',
        'Una pregunta de horarios y una de cambios.',
        'Un pedido válido, uno que no corresponde a quien consulta y una falla de la conexión.'
      ],2,'El piloto debe cubrir el recorrido exitoso y dos excepciones que cambian la respuesta y la derivación.','Validación')
    ] },
  { id: 'advice-queues', level:'basic', revision: '2026-11-24.1', title: 'Una fila para ventas y soporte', skill: 'Studio + Desk + Analítica', minutes: 7, lesson: 8,
    story: 'Operaciones recibe cotizaciones, cobros y reclamos en el mismo WhatsApp. Ventas atiende hasta las 20:00 y Soporte hasta las 18:00. Quieren bajar el tiempo de espera sin aumentar la dotación.',
    advice: {
      flow: ['La persona elige una opción en un menú de ocho categorías.', 'Todas las opciones ingresan a la misma fila.', 'Se asigna al primer ejecutivo libre y se mide el saludo del bot como primera atención.'],
      model: 'Para partir, usaría un menú de ventas, soporte y «otro», con departamentos y horarios definidos en Desk. También podemos pilotear que Studio detecte la intención y derive cuando la reconozca, con una pregunta breve o una cola de triage para los casos ambiguos. Comparemos la primera respuesta humana por departamento y las reasignaciones antes de ampliar.'
    },
    reference: {section:'Rendimiento de Equipo — Primera Atención',query:'Rendimiento del Equipo',url:TEAM_PERFORMANCE},
    questions: [
      q('advice-queues-flow','¿Qué ajuste probarías para reducir los traspasos?',[
        'Mantener una fila única y exigir que cada persona elija una de las ocho opciones.',
        'Asignar todo a Ventas después de las 18:00 y devolver los reclamos a Soporte al día siguiente.',
        'Separar ventas y soporte según intención y horario, con una ruta para solicitudes ambiguas y continuidad fuera de horario.'
      ],2,'Definir equipo, disponibilidad y excepción desde la entrada evita derivaciones a un equipo cerrado o equivocado.','Diseño de flujo',true),
      q('advice-queues-pilot','Operaciones prefiere empezar sin clasificación por IA. ¿Qué le ofreces?',[
        'Un menú breve de ventas, soporte y «otro», con asignación a los departamentos definidos en Desk.',
        'Un equipo general con instrucciones para leer todo y reenviar cada solicitud.',
        'Una fila por cada opción actual, aunque las atiendan las mismas personas.'
      ],0,'Un menú breve permite probar la asignación con criterios explícitos. Las solicitudes ambiguas pueden entrar a triage y alimentar una mejora posterior.','Producto'),
      q('advice-queues-metric','¿Qué dato usarías para saber si mejoró la atención humana?',[
        'El tiempo hasta el mensaje automático de bienvenida.',
        'El tiempo hasta la primera respuesta humana por departamento, con períodos y filtros comparables.',
        'El total de conversaciones que recibió cada equipo.'
      ],1,'Primera Atención permite revisar el tiempo de respuesta humana. El volumen y la carga ayudan a explicar los cambios, pero miden fenómenos distintos.','Medición')
    ] },
  { id: 'advice-campaigns', level:'advanced', revision: '2026-11-24.1', title: 'Una promoción por WhatsApp', skill: 'Engage + WhatsApp BSP', minutes: 7, lesson: 10,
    story: 'Marketing quiere anunciar una oferta a su base. Tiene un segmento con permiso registrado y otro que viene de una planilla sin trazabilidad. El equipo comercial necesita atender las respuestas durante el lanzamiento.',
    advice: {
      flow: ['Se importa toda la base desde la planilla.', 'Se envía la promoción desde WhatsApp con el mismo texto.', 'Se cuentan los clics como ventas y se repite el envío a quien no respondió.'],
      model: 'Podemos pilotear en Engage con el segmento que tiene permiso documentado y una plantilla aprobada, con un equipo listo para recibir las respuestas. Si la prioridad es ampliar la base, preparemos primero un punto de opt-in para quienes todavía no tienen permiso trazable. Si la plantilla tiene un enlace medido, revisaremos destinatarios que abrieron el enlace y, por separado, compras confirmadas mediante evidencia de la tienda.'
    },
    reference: {section:'Medir y analizar botones de campañas de WhatsApp',query:'enlaces medidos',url:BUTTON_ANALYTICS},
    questions: [
      q('advice-campaigns-flow','¿Qué le recomiendas para lanzar la promoción?',[
        'Enviar a toda la planilla en una tanda pequeña y retirar a quienes se quejen.',
        'Pilotear en Engage con el segmento elegible, una plantilla aprobada y responsables para atender respuestas y bajas.',
        'Enviar el mismo texto desde Studio como sugerencia proactiva a toda la base.'
      ],1,'El contacto proactivo requiere una base elegible y una plantilla adecuada. También hace falta definir cómo atender las respuestas y respetar las bajas.','Diseño de flujo',true),
      q('advice-campaigns-option','¿Qué alternativa das para el segmento sin permiso trazable?',[
        'Hacer un primer envío de prueba para preguntar si quieren recibir ofertas.',
        'Enviar solo a quienes compraron recientemente, usando el historial como permiso.',
        'Habilitar un punto de opt-in y sumar contactos a campañas cuando su permiso quede registrado.'
      ],2,'Un registro de opt-in permite comprobar la elegibilidad del contacto antes de incorporarlo a un envío proactivo.','Alcance'),
      q('advice-campaigns-metric','Hay más clics que destinatarios. ¿Qué le dices a Marketing?',[
        'Una persona puede hacer varios clics. Las compras se validan por separado con datos de la tienda.',
        'Cada clic equivale a una compra atribuible a la campaña.',
        'Los clics repetidos indican que se envió la campaña dos veces.'
      ],0,'El reporte de Engage distingue interacciones y destinatarios por botón medido. Para medir ventas necesitas evidencia de compra y un criterio de atribución.','Medición')
    ] },
  { id: 'advice-checkout', level:'advanced', revision: '2026-11-24.1', title: 'Del catálogo al pago', skill: 'Studio + Shopify', minutes: 7, lesson: 22,
    story: 'Un e-commerce quiere recomendar productos y vender por WhatsApp. Su Shopify ya funciona y el equipo puede tomar conversaciones de venta complejas.',
    advice: {
      flow: ['El bot recomienda usando un PDF de catálogo.', 'La persona elige talla y paga dentro de WhatsApp.', 'El bot le escribe al día siguiente a cualquiera que haya preguntado por un producto.'],
      model: 'Validemos si la tienda conectada permite que Studio recomiende variantes y entregue un enlace de checkout en Shopify. Si todavía no tenemos los datos de stock, lancemos recomendaciones de catálogo con enlaces de producto y derivación a ventas para confirmar disponibilidad. Revisemos después la recuperación de checkouts con un evento verificable, contacto elegible y exclusión de compras completadas.'
    },
    reference: {section:'Casos de uso — Studio',query:'Shopify',url:WIKI},
    questions: [
      q('advice-checkout-flow','¿Qué recorrido ofrecerías como piloto?',[
        'Recomendar desde el catálogo conectado, validar variante y disponibilidad, y continuar en el checkout de Shopify con salida a ventas.',
        'Mostrar productos desde el PDF, confirmar stock con esos datos y recibir el pago dentro de WhatsApp.',
        'Enviar a todos directamente a la portada de Shopify y cerrar la conversación.'
      ],0,'La tienda conectada permite validar qué datos están disponibles y continuar en el checkout. Así el comprador puede confirmar la variante y el equipo resolver las excepciones.','Diseño de flujo',true),
      q('advice-checkout-option','La consulta de stock todavía no está lista. ¿Qué sí podrías lanzar?',[
        'Reservar la variante por chat usando el inventario de la última carga.',
        'Orientar con el catálogo y enlaces de producto, y ofrecer ayuda humana para confirmar stock o compatibilidad.',
        'Armar siempre el carrito con la variante más vendida y pedir confirmación después.'
      ],1,'Una recomendación orienta la compra aunque la disponibilidad todavía deba confirmarse. Los enlaces y la derivación permiten continuar en ese escenario.','Alcance'),
      q('advice-checkout-trigger','¿Qué validarías para sugerir un recordatorio de checkout?',[
        'Que la persona haya abierto al menos una ficha.',
        'Que hayan pasado 24 horas desde su pregunta, aunque ya compró.',
        'Que exista un checkout abandonado identificable, un contacto elegible y una forma de excluir compras ya completadas.'
      ],2,'Una consulta de catálogo, un carrito y un checkout son eventos distintos. La recuperación requiere comprobar el evento y las condiciones de contacto y exclusión.','Validación')
    ] },
  { id: 'advice-knowledge', level:'basic', revision: '2026-11-24.1', title: 'Dos políticas de devolución', skill: 'Studio + Desk', minutes: 7, lesson: 22,
    story: 'Una marca vende en Chile y México. Las compras online y las presenciales tienen condiciones distintas. Soporte comparte PDFs con políticas antiguas y nuevas.',
    advice: {
      flow: ['Se cargan todos los PDFs al agente.', 'El cliente pregunta si puede devolver su compra.', 'El bot aplica una política general y confirma la devolución.'],
      model: 'Empecemos con la política vigente de un país y canal, con un responsable de actualizar la fuente. Studio puede orientar y derivar las excepciones a Desk. Si quieren cubrir los cuatro recorridos, pidamos país y canal cuando falten y aprobemos las fuentes de cada combinación. Probemos una compra online, una presencial y un caso que requiera revisión humana.'
    },
    reference: {section:'Conocimiento de Studio',query:'fuentes de conocimiento',url:WIKI},
    questions: [
      q('advice-knowledge-flow','¿Qué le recomiendas antes de cargar conocimiento?',[
        'Conservar todos los PDFs y pedirle al bot que deduzca cuál es el vigente.',
        'Elegir una política común para ambos países y corregir a mano los reclamos.',
        'Validar fuentes vigentes por país y canal, pedir el dato que falte y derivar las excepciones a Desk.'
      ],2,'El alcance de la política depende del contexto de compra. Una fuente aprobada y un camino de excepción reducen respuestas contradictorias.','Diseño de flujo',true),
      q('advice-knowledge-option','Solo hay una política aprobada al comienzo. ¿Cómo propones salir a piloto?',[
        'Acotar el piloto al país y canal cubiertos y enviar los demás casos a revisión humana.',
        'Extrapolar esa política hasta que aprueben las otras.',
        'Publicar las políticas que faltan como borradores de uso interno y permitir que el bot las cite.'
      ],0,'Un alcance parcial puede resolver casos reales si el agente sabe a quién cubre y cómo continúa la atención para el resto.','Alcance'),
      q('advice-knowledge-action','El cliente pregunta si el bot puede aprobar y registrar la devolución. ¿Qué respondes?',[
        'Si puede explicar la política, también puede registrar la devolución.',
        'Puede orientar con la política. Para ejecutar la devolución, validemos el sistema, sus permisos y los casos que requieren aprobación humana.',
        'Sí, basta con que el agente etiquete la conversación como devolución.'
      ],1,'Una respuesta basada en conocimiento, una etiqueta y una operación en un sistema externo tienen efectos distintos. La última requiere una acción e integración verificadas.','Producto')
    ] },
  { id: 'advice-surveys', level:'intermediate', revision: '2026-11-24.1', title: 'Una encuesta al cerrar el caso', skill: 'Desk + Experience', minutes: 7, lesson: 8,
    story: 'Experiencia quiere medir la atención. Hoy hay tickets que se cierran por resolución, por inactividad o durante un cambio de equipo. A veces el cliente vuelve con la misma consulta.',
    advice: {
      flow: ['Cualquier cierre del ticket dispara una encuesta.', 'Si el caso se reabre y vuelve a cerrar, se repite la encuesta.', 'Se compara el promedio de todas las áreas como si atendieran los mismos casos.'],
      model: 'Pilotearía la encuesta post-atención de Experience con un equipo que pueda distinguir casos resueltos de cierres por inactividad. Probemos también qué ocurre si el ticket vuelve a abrirse. Otra opción es incorporar más equipos después de validar la configuración por canal y acordar qué cierres entran. Revisemos satisfacción y tasa de respuesta por separado antes de comparar áreas.'
    },
    reference: {section:'Adereso Experience',query:'Encuestas Post Atención',url:WIKI},
    questions: [
      q('advice-surveys-flow','¿Cuál es el cambio más importante antes del piloto?',[
        'Acordar qué significa resuelto, definir los cierres elegibles y probar en Desk y Experience qué ocurre con reaperturas y duplicados.',
        'Activar la encuesta después de cualquier cierre y filtrar las respuestas según el puntaje.',
        'Enviar una encuesta también al derivar el ticket para tener una línea base.'
      ],0,'El cierre puede representar varios eventos. Definir elegibilidad y probar reaperturas permite interpretar a qué atención corresponde cada respuesta.','Diseño de flujo',true),
      q('advice-surveys-option','Aún no pueden distinguir cierres en todos los equipos. ¿Qué alternativa propones?',[
        'Lanzar en todas las áreas y corregir la clasificación cuando lleguen las primeras encuestas.',
        'Medir solo a quienes reciben una atención automática.',
        'Partir con un equipo que ya registra resoluciones de forma consistente y validar sus reglas antes de ampliar.'
      ],2,'Con un equipo y reglas claras se puede aprender con un flujo acotado antes de comparar operaciones con criterios de cierre distintos.','Validación'),
      q('advice-surveys-metric','Un área tiene una nota alta y pocas respuestas. ¿Qué le dirías al cliente?',[
        'El área ya tiene el mejor servicio porque tiene la nota más alta.',
        'Revisemos el número y la tasa de respuestas, el período y el tipo de tickets junto con la nota.',
        'Sumemos las conversaciones sin respuesta como valoraciones positivas.'
      ],1,'La nota describe las respuestas recibidas. El volumen, la tasa y el tipo de casos ayudan a saber qué tan comparable es el resultado.','Medición')
    ] },
];

const PLAYBOOK = '/?hubView=playbook';

export const HYPOTHESIS_MISSION = {
  id:'playbook-hypothesis', level:'advanced',
  title:'Formula hipótesis a partir de una respuesta',
  skill:'Discovery · Respuesta libre',
  minutes:6,
  story:'Tras una primera reunión sobre automatizar consultas repetitivas de WhatsApp, enviaste un resumen del piloto que conversaron. La contraparte te responde al día siguiente.',
  reply:'«Sí, nos interesa. Déjame conversarlo internamente y retomamos más adelante.»',
  fields:[
    {name:'observation',label:'¿Qué puedes afirmar a partir de su respuesta?'},
    {name:'first',label:'Primera hipótesis'},
    {name:'second',label:'Segunda hipótesis'},
    {name:'question',label:'¿Qué le preguntarías para comprobar o descartar tus hipótesis?'}
  ],
  example:[
    'La persona expresa interés y dice que lo conversará internamente. Todavía falta saber con quién, para qué y en qué plazo.',
    'Una posibilidad es que Operaciones vea valor en el piloto y necesite que otra persona valide el alcance. Otra es que el problema haya bajado de prioridad y el equipo aún no decida si quiere moverlo.',
    'Podría preguntar: «Cuando lo conversen internamente, ¿qué necesitan resolver para saber si vale la pena retomar el piloto?»'
  ],
  criteria:[
    'La observación se apoya en lo que la persona dijo.',
    'Las dos hipótesis explican la respuesta de maneras distintas y se pueden comprobar.',
    'La pregunta le da espacio al cliente para explicar qué ocurre con sus propias palabras.'
  ],
  reference:{section:'Etapas 2 y 5 · Discovery y proceso de decisión',url:PLAYBOOK}
};

export const PLAYBOOK_MISSIONS = [
  {id:'playbook-icebreaker', level:'basic', revision:'2026-11-24.1', title:'La sala todavía se está armando', skill:'Apertura y lectura del prospecto', minutes:5,
    story:'Es tu primera reunión con una cadena regional. Una persona se conecta apurada desde una sucursal y no sabes si llegó quien lidera el proyecto. Tienes un minuto para abrir.',
    reference:{section:'Etapa 0 · Romper el hielo',url:PLAYBOOK},
    playbook:{
      prompt:'Ensaya cómo saludarías, qué preguntarías y cómo pasarías a confirmar quiénes están y qué quieren revisar.',
      model:'Gracias por conectarte desde la sucursal. ¿Cómo viene la mañana por allá? Tenemos 45 minutos reservados. ¿Esperamos a alguien más antes de ver qué les gustaría llevarse de esta reunión?'
    },
    questions:[
      q('pb-ice-context','¿Con qué abres?',[
        'Con un saludo breve y una pregunta sencilla que tenga sentido para quien acaba de llegar.',
        'Con un listado de módulos para aprovechar el primer minuto.',
        'Con una pregunta sobre presupuesto antes de que llegue el resto.'
      ],0,'Una apertura breve y pertinente ayuda a leer el ánimo y deja espacio para que el prospecto conteste.','Rompehielo'),
      q('pb-ice-pace','La persona avisa que solo puede quedarse 20 minutos. ¿Qué ajustas?',[
        'Mantener la agenda original para cubrir todos los puntos.',
        'Acordar qué conviene revisar en esos 20 minutos y cómo retomar lo pendiente.',
        'Asumir que no le interesa y cerrar la reunión.'
      ],1,'Ajustar el tiempo junto con la contraparte permite respetar su disponibilidad y orientar la conversación.','Escucha',true),
      q('pb-ice-transition','Se suma alguien que no venía en la invitación. ¿Cómo pasas al trabajo?',[
        'Dar por hecho que esa persona toma la decisión.',
        'Repetir el rompehielo desde el principio.',
        'Confirmar su rol y acordar el foco antes de retomar el contexto del SDR.'
      ],2,'Identificar quién entró y acordar el foco prepara una introducción que aprovecha el contexto del SDR.','Transición')
    ]},

  {id:'playbook-outbound', level:'intermediate', revision:'2026-11-24.1', title:'«Ustedes me contactaron»', skill:'Preparación e introducción', minutes:6,
    story:'Tienes 20 minutos antes de una primera reunión outbound. La invitación incluye dos dominios y el brief de Adobo todavía no llega. El contacto aceptó hablar de automatización, sin mencionar un proyecto.',
    reference:{section:'Preparación · Etapas 0 y 1',url:PLAYBOOK},
    playbook:{
      prompt:'Escribe cómo abrirías la reunión. Confirma para qué empresa es la conversación y averigua qué motivó al contacto a aceptar.',
      model:'Gracias por el tiempo. Vi dos dominios en la invitación. ¿La conversación es para una de las empresas o para ambas? Mi equipo te contactó para explorar automatización conversacional. ¿Qué te interesó de esa conversación? Si recién están mirando opciones, podemos partir por cómo atienden hoy y ver si hay algo que valga la pena explorar.'
    },
    questions:[
      q('pb-outbound-prep','¿Qué haces con los minutos que quedan?',[
        'Revisar el handoff disponible en Slack y HubSpot, mirar los canales de la empresa y preparar un ejemplo para confirmar durante la reunión.',
        'Preparar una demo para la empresa con el dominio más conocido y completar el deal con esa hipótesis.',
        'Revisar solo la web de ambas empresas y dejar que el contacto reconstituya todo lo conversado con SDR.'
      ],0,'Cuando falta el brief, el handoff y la web permiten llegar con contexto y preguntas acotadas. La relación entre los dominios sigue por confirmar.','Preparación'),
      q('pb-outbound-scope','Al entrar, las personas se presentan desde empresas distintas. ¿Cómo decides el alcance de la reunión?',[
        'Pedir al primer contacto que describa su operación y usarla como referente para ambas.',
        'Mostrar un ejemplo genérico para cubrir a las dos empresas y confirmar el alcance después.',
        'Aclarar para cuál empresa quieren enfocar la conversación o si comparten la operación antes de hablar del caso de uso.'
      ],2,'Aclarar el vínculo desde el inicio evita atribuir necesidades o datos a la empresa equivocada y permite personalizar la conversación.','Introducción',true),
      q('pb-outbound-handoff','El contacto dice «ustedes me llamaron, yo solo quería escuchar». ¿Qué preguntas?',[
        '¿Qué porcentaje de automatización tiene como meta su proyecto?',
        '¿Qué te llamó la atención de la invitación? ¿Hay algo que estén evaluando o por ahora quieren explorar?',
        '¿Quién es la persona que aprueba la compra para que se sume a la demo?'
      ],1,'El handoff outbound conecta con el motivo real de la cita y deja espacio para que el contacto diga que está explorando.','Handoff SDR')
    ]},
  {id:'playbook-discovery-event', level:'intermediate', revision:'2026-11-24.1', title:'«Lo necesitamos antes de diciembre»', skill:'Discovery y Critical Event', minutes:7,
    story:'Un inbound ya contó al SDR que el WhatsApp posventa se satura cada tarde. Quiere ver la demo pronto y dice que le gustaría tener algo funcionando en diciembre. Aún no sabes el impacto de la saturación.',
    reference:{section:'Etapa 2 · Levantamiento de dolores y operativa · Critical Event',url:PLAYBOOK},
    playbook:{
      prompt:'Formula dos preguntas naturales para aclarar el impacto y el hito. Explica cómo pasarías a la demo sin repetir el discovery.',
      model:'Entendí que las consultas se acumulan por la tarde. ¿Qué le pasa hoy al equipo o a los clientes cuando quedan pendientes? Mencionaste diciembre. ¿Qué ocurre en ese mes y qué pasaría si llegan con el mismo problema? Con eso te muestro el recorrido de una de esas consultas y vemos juntos qué resultado tendría sentido medir.'
    },
    questions:[
      q('pb-discovery-impact','Te piden ver la demo de inmediato. ¿Cómo respondes?',[
        'Pasar a toda la demo y dejar el contexto para otra reunión.',
        'Resumir lo que ya sabes, hacer una pregunta breve sobre el impacto y seguir con el flujo relevante mientras aclaras lo que falte.',
        'Recorrer la calificación completa antes de compartir pantalla para dejar todos los datos cerrados.'
      ],1,'El Playbook pide confirmar lo conocido y ajustar el ritmo. Una pregunta enfocada puede orientar la demo y el resto se profundiza cuando aporta al recorrido.','Discovery'),
      q('pb-discovery-ce','¿Qué convierte «en diciembre» en un posible Critical Event?',[
        'Confirmar qué pasa en diciembre, qué consecuencia tendría llegar igual y qué deben resolver o decidir antes.',
        'Pasar diciembre al cierre estimado porque es el único plazo mencionado.',
        'Pedir una fecha exacta de salida para calcular desde cuándo conviene enviar la propuesta.'
      ],0,'El Critical Event une un hito con una consecuencia para el cliente. El calendario operativo y el proceso de compra se verifican por separado.','Critical Event',true),
      q('pb-discovery-recap','Te dicen que el equipo podría quedar corto para el peak, pero aún no tienen cifras. ¿Con qué pasas a la demo?',[
        'Con una estimación de ahorro basada en tu última cuenta del mismo rubro.',
        'Con una promesa de automatización completa durante el peak.',
        'Con el dolor y el impacto posible en sus palabras, la cifra pendiente y una consulta de posventa que represente el problema.'
      ],2,'Recapitular con evidencia valida el entendimiento. Mostrar una consulta relevante permite avanzar mientras la medición sigue pendiente.','Recapitulación')
    ]},
  {id:'playbook-demo-dialogue', level:'advanced', revision:'2026-11-24.1', title:'La demo se desvía hacia una integración', skill:'Demo consultiva', minutes:7,
    story:'La jefa de operaciones quiere reducir la espera para cambios de reserva. En la demo pregunta si Studio puede actualizar directamente su sistema. La conexión todavía no se ha revisado y allí se guardan los datos reales.',
    reference:{section:'Etapa 3 · Presentación Demo y técnicas de conexión',url:PLAYBOOK},
    playbook:{
      prompt:'Explica en voz de ejecutivo qué puedes mostrar hoy, qué sigue por validar y cómo comprobarías si la demo se ajusta a su operación.',
      model:'Te muestro en nuestra instancia demo cómo se recibe una solicitud de cambio, qué acción haría el agente y qué contexto recibe Soporte si necesita intervenir. Lo hacemos con datos simulados. Para confirmar una actualización real necesitamos revisar qué permite su sistema y con qué permisos. ¿Qué cambio hace hoy el equipo con más frecuencia y cuál requiere aprobación?'
    },
    questions:[
      q('pb-demo-path','¿Qué recorrido muestras con el tiempo disponible?',[
        'Primero todos los canales de Desk y después un recorrido rápido por las pantallas de Studio.',
        'Un ejemplo cercano en la cuenta productiva de otro cliente, ocultando el nombre del ticket.',
        'En ADERESO DEMO, una solicitud representativa, la acción simulada y la derivación a Desk cuando corresponda.'
      ],2,'Un recorrido completo y acotado conecta el dolor con lo que podría cambiar en la operación. La instancia de demo permite trabajar con datos ficticios.','Demo',true),
      q('pb-demo-connection','La acción simulada termina con éxito. La clienta dice «entonces ya sabemos que se conecta». ¿Cómo respondes?',[
        'Aclarar qué mostró la simulación y acordar qué accesos, operación y permisos se validarán con su equipo.',
        'Dejar la duda anotada y pasar al precio porque todavía no es una reunión técnica.',
        'Decir que el ejemplo es suficiente para incluir la actualización en el alcance inicial.'
      ],0,'Mostrar un recorrido acredita su funcionamiento en la demo. La capacidad de actualizar ese sistema se confirma con evidencia de la cuenta y de la operación real.','Alcance',true),
      q('pb-demo-dialogue','Hay una pausa después de la derivación. ¿Cómo retomas la conversación?',[
        'Resumir las otras funciones para llenar el silencio.',
        'Preguntar cómo reciben hoy una excepción y dar espacio para que describan qué falta en el ticket.',
        'Inferir que la derivación ya resolvió el dolor y pasar al cierre.'
      ],1,'La demo sigue siendo discovery. Una pregunta sobre la excepción devuelve el foco a la operación y permite comprobar si falta contexto.','Conversación')
    ]},
  {id:'playbook-pricing-roi', level:'intermediate', revision:'2026-11-24.1', title:'«Dame un precio para 20 ejecutivos»', skill:'Pricing y ROI', minutes:7,
    story:'El contacto quiere llevar un número a Finanzas. Conoce el tamaño del equipo, pero no el volumen de conversaciones ni cuánto tiempo dedica a responder consultas repetitivas.',
    reference:{section:'Etapa 4 · Presentación de Pricing · Pricing y ROI en esta reunión',url:PLAYBOOK},
    playbook:{
      prompt:'Escribe cómo explicarías el pricing y cómo cerrarías la validación de los datos antes de presentar una propuesta.',
      model:'Para dimensionar la propuesta usamos el volumen de conversaciones y el alcance que acordemos. Los 20 ejecutivos nos ayudan a entender la operación. ¿Puede Operaciones compartir el reporte del último mes y un ejemplo del tiempo que toman las consultas repetitivas? Con eso armamos un escenario y revisamos juntos qué supuestos explican su retorno.'
    },
    questions:[
      q('pb-pricing-scope','¿Qué explicas primero?',[
        'Que la propuesta se dimensiona por conversaciones y alcance, y que el número de ejecutivos ayuda a entender cómo operan.',
        'Que vale la pena calcular el precio dividiendo el presupuesto entre los 20 ejecutivos.',
        'Que primero deberían elegir entre tres niveles y luego veremos el volumen.'
      ],0,'El Playbook empieza por conversaciones y conecta una recomendación de alcance con la necesidad del cliente. El número de ejecutivos contextualiza la operación.','Pricing'),
      q('pb-pricing-baseline','¿Qué compromiso puedes hacer con los datos disponibles?',[
        'Enviar hoy una propuesta firme usando un promedio de conversaciones de cuentas parecidas.',
        'Acordar con Operaciones la fuente del volumen y el tiempo de atención, quién los trae y cuándo revisarán el escenario.',
        'Enviar un ROI garantizado con el supuesto de que todas las consultas repetitivas quedarán automatizadas.'
      ],1,'Una propuesta necesita un alcance y un volumen sustentados. El ROI explicita sus supuestos y los datos que respaldan el escenario.','ROI',true),
      q('pb-pricing-present','Llega el reporte. ¿Cómo lo presentas en la siguiente reunión?',[
        'Recorrer todas las combinaciones del cotizador y pedir al cliente que elija.',
        'Mostrar el monto final y dejar la conversación sobre retorno para después de Finanzas.',
        'Simular un alcance recomendado, mostrar el ROI y sus supuestos, y revisar cómo calza con presupuesto y aprobación.'
      ],2,'Una recomendación concreta, su retorno esperado y los supuestos permiten a Finanzas evaluar el caso con el mismo entendimiento del alcance.','Propuesta')
    ]},
  {id:'playbook-enterprise-decision', level:'advanced', revision:'2026-11-24.1', title:'Una expansión con tres aprobaciones', skill:'Cierre y proceso de decisión', minutes:7,
    story:'Eres KAM. Una cuenta con Desk quiere agregar automatización a una segunda unidad. Operaciones está interesada. TI todavía debe revisar accesos y Finanzas aprueba el presupuesto. El cliente menciona que quiere salir en enero.',
    reference:{section:'Preparación KAM · Etapa 5 · SMB vs. Enterprise',url:PLAYBOOK},
    playbook:{
      prompt:'Plantea el cierre de la reunión. Distingue la fecha de decisión del objetivo de implementación y propone quién participa en el próximo hito.',
      model:'Antes de dimensionar la segunda unidad, revisemos qué tienen contratado y qué resultados les da hoy Desk. Enero es el objetivo operativo. ¿Qué necesitan validar TI y Finanzas antes de decidir? Propongo reunirnos la próxima semana con Operaciones y TI para revisar el flujo y los accesos. Acordemos quién coordina con Finanzas y en qué fecha podemos confirmar esa revisión.'
    },
    questions:[
      q('pb-decision-kam','¿Qué llevas a la conversación con la unidad nueva?',[
        'La propuesta de otra cuenta con el mismo número de ejecutivos.',
        'El alcance actual, la adopción y resultados de Desk, los pendientes y quiénes operan y deciden en ambas unidades.',
        'Una cotización de ampliación hecha sobre la expectativa de que las dos unidades operan igual.'
      ],1,'La preparación KAM parte de evidencia de la cuenta y permite decidir qué conservar, qué ampliar y qué depende de una nueva validación.','Preparación KAM'),
      q('pb-decision-stakeholders','Operaciones te dice «cuenta con nosotros». ¿Qué necesitas aclarar?',[
        'Si pueden firmar mientras TI y Finanzas se incorporan al proyecto.',
        'Si el objetivo de enero permite usar esa misma fecha como cierre de venta.',
        'Qué aprueba cada persona, con qué criterios, y qué validaciones deben ocurrir antes del compromiso de compra.'
      ],2,'El interés de quien impulsa el proyecto es una señal. Confirmar validadores, aprobadores y secuencia convierte esa señal en un proceso de compra verificable.','SPICED · Decision',true),
      q('pb-decision-next','Todavía no pueden comprometer el comité de compra. ¿Con qué sales de la reunión?',[
        'Con un próximo paso acordado, objetivo, responsable y fecha o ventana para revisar los requisitos con TI.',
        'Con un envío de propuesta y un recordatorio interno para escribir a Operaciones más adelante.',
        'Con una fecha de implementación tentativa para que tengan un incentivo.'
      ],0,'La validación con quien corresponda es un avance concreto aun sin fecha de comité. Su resultado ayuda a definir lo que el cliente puede decidir.','Próximo paso')
    ]},
  {id:'playbook-followup-pain', level:'basic', revision:'2026-11-24.1', title:'«Volvamos a hablar después del inventario»', skill:'Seguimiento al dolor', minutes:6,
    story:'Una pyme confirmó que su equipo dedica la tarde a resolver consultas repetitivas. La dueña pide retomar por correo después del inventario del jueves y deja pendiente definir qué tipo de consulta entraría primero al piloto.',
    reference:{section:'Etapa 6 · Acordar el seguimiento al dolor',url:PLAYBOOK},
    playbook:{
      prompt:'Redacta el correo que prepararías para la ventana acordada. Retoma el problema, haz una pregunta útil y propone un siguiente paso.',
      model:'Hola, Paula. Te escribo por seguimiento a las consultas repetitivas que están ocupando la tarde del equipo. ¿Pudieron ver cuáles se acumulan más? Si sigue siendo prioridad, podemos revisar un ejemplo juntos y acordar qué tipo de consulta incluir primero en el piloto. ¿Te sirve verlo esta semana?'
    },
    questions:[
      q('pb-followup-record','¿Qué registras antes de cerrar la reunión?',[
        'El dolor confirmado, su efecto en la tarde del equipo y el acuerdo de retomar por correo después del jueves para priorizar la primera consulta.',
        'La propuesta pendiente y la fecha de envío, dejando que el equipo recuerde el resto.',
        'Que el piloto debe arrancar el viernes por la urgencia del inventario.'
      ],0,'El registro debe permitir que otra persona retome la conversación con el motivo, el canal y el compromiso correctos.','Registro'),
      q('pb-followup-window','Es miércoles y la propuesta está lista. ¿Qué haces con el seguimiento?',[
        'Le escribes ese día porque la propuesta ya está preparada.',
        'Preparas el seguimiento y respetas el canal y la ventana acordados con la clienta.',
        'La llamas el jueves para que lo tenga presente cuando termine el inventario.'
      ],1,'El seguimiento respeta lo conversado. La fecha solicitada por el cliente manda sobre una cadencia genérica o sobre cuándo queda lista la propuesta.','Cadencia',true),
      q('pb-followup-changed','Al retomar te dice que bajó el volumen y el equipo ya puede responder. ¿Qué haces?',[
        'Insistir con el piloto porque el dolor existía durante la reunión.',
        'Cambiar de inmediato la conversación a una campaña de WhatsApp.',
        'Preguntar qué cambió y si queda una necesidad concreta, y actualizar el acuerdo y el registro según su respuesta.'
      ],2,'Si cambia el dolor, cambia el motivo para avanzar. Escuchar y registrar la nueva situación mantiene el seguimiento conectado con la operación.','Seguimiento')
    ]},
];

export const OBJECTION_MISSIONS = [
  {id:'objection-price-before-trial', level:'intermediate', revision:'2026-11-25.1', title:'Vio el precio antes de probar', skill:'Precio y alternativas', minutes:6, lesson:5,
    story:'Caso simulado · Después de recibir la propuesta, el cliente dice que todavía no ha probado la plataforma. El precio le pareció alto y cree que hay alternativas mejores. Por eso frenó la evaluación.',
    objection:{
      prompt:'Escribe lo que dirías en un audio de 20–30 segundos. Agradece la franqueza, haz una pregunta para entender qué está comparando y ofrece un próximo paso fácil de aceptar.',
      model:'Gracias por decírmelo así. Para ver si la propuesta tiene sentido para ustedes, ¿qué te convence más de las otras alternativas? Si te sirve, revisamos en diez minutos una consulta real de tu operación y usamos ese mismo caso para comparar qué cubre cada opción. Así puedes decidir si vale la pena seguir mirando.'
    },
    questions:[
      q('price-trial-open','¿Qué respondes primero al audio?',[
        'Le digo que podría revisar un descuento y le pregunto qué tendría que bajar para que decida.',
        'Le agradezco la franqueza y le pregunto qué le parece mejor de las otras opciones y qué necesita resolver.',
        'Le mando una comparación de funcionalidades para demostrarle por qué Adereso cuesta más.'
      ],1,'La objeción trae tres señales: vio la propuesta, aún no usó la plataforma y percibe mejores opciones. Una pregunta abierta ayuda a descubrir si la diferencia es de alcance, facilidad de uso, presupuesto u otro criterio.','Diagnóstico',true),
      q('price-trial-compare','En el ejercicio, el cliente aclara que la otra alternativa cuesta menos y dice que es más fácil de configurar. ¿Qué propones?',[
        'Comparar ambas con una consulta real de su negocio y revisar qué cubre cada propuesta y qué trabajo requiere ponerla en marcha.',
        'Enviar una lista con todas las capacidades de Adereso y pedirle que la revise antes de hablar de su caso.',
        'Mostrar una demo completa para que vea todas las diferencias antes de volver al precio.'
      ],0,'Una consulta del negocio permite comparar el resultado y la facilidad de operar el flujo. Revisa el alcance y el esfuerzo de puesta en marcha con lo que el cliente pueda verificar de ambas alternativas.','Demostrar valor'),
      q('price-trial-next','El cliente dice que todavía no tiene tiempo para una sesión. ¿Cómo cierras?',[
        'Le envío una invitación por si se desocupa y le pido confirmar.',
        'Le digo que al probarlo entenderá el precio y le dejo el enlace de la demo.',
        'Le ofrezco revisar un solo caso cuando tenga espacio y le pregunto si hay una fecha o un hito razonable para retomar.'
      ],2,'Un paso acotado respeta que la evaluación está frenada. Acordar cuándo retomar permite seguir conversando sobre su caso sin convertir el próximo contacto en una presión por decidir.','Próximo paso')
    ]},
  {id:'objection-switching-risk', level:'advanced', revision:'2026-11-25.1', title:'«Cambiar de proveedor pone en riesgo la atención»', skill:'Continuidad y decisión de compra', minutes:8, lesson:5,
    story:'Caso simulado · Una empresa ya atiende por WhatsApp con otro proveedor. Operaciones quiere mejorar el reparto a soporte y ventas. TI aún desconoce qué pasaría con el número y el historial, Finanzas quiere comparar el costo total, y la renovación está cerca.',
    objection:{
      prompt:'Redacta tu respuesta al cliente. Explica cómo probarías valor con bajo riesgo, qué confirmarías con TI y con qué evidencia el cliente decidiría si conviene avanzar antes de renovar.',
      model:'Tiene sentido cuidar la continuidad. Probemos con datos ficticios cómo quedaría el reparto de un caso de ventas y uno de soporte. En paralelo, revisemos con TI qué pasa con el número, los accesos y el historial, y qué haríamos si el cambio se interrumpe. Con eso podemos poner sobre la mesa el costo total y tomar una decisión antes de la renovación, con fechas que su equipo pueda sostener.'
    },
    questions:[
      q('switch-risk-discovery','Operaciones dice «con que funcione igual el lunes, estamos». ¿Qué aclaras antes de comprometer el cambio?',[
        'Acordar qué debe seguir operando, qué datos quieren conservar, quién controla el número y los accesos, y qué condiciones permitirían continuar o detener el cambio.',
        'Pedir el contrato y el costo mensual actual para armar una comparación. Revisar número, historial y accesos cuando aprueben el presupuesto.',
        'Confirmar los horarios de mayor tráfico para proponer un fin de semana, y revisar el historial después de la prueba.'
      ],0,'La continuidad depende de requisitos operativos y técnicos que deben confirmarse antes de comprometer un cambio. El momento de menor tráfico ayuda a planificar una vez que se conocen esos requisitos.','Continuidad',true),
      q('switch-risk-pilot','El cliente acepta una prueba, pero quiere mantener su canal actual operativo. ¿Qué evidencia puedes preparar ya?',[
        'Un recorrido de todas las pantallas en demo y una lista comparativa de funciones para que TI evalúe el cambio.',
        'Una simulación del reparto con datos de prueba y criterios de éxito acordados, mientras TI valida por separado la continuidad y el alcance del cambio.',
        'Un ejercicio en demo con datos ficticios. Si funciona, presentar la continuidad del número y el historial como comprobada.'
      ],1,'El piloto puede mostrar el flujo y el resultado esperado sin tocar el canal. Las dependencias de la cuenta requieren validación adicional antes de comprometer la transición.','Piloto',true),
      q('switch-risk-decision','Finanzas recibe el precio mensual y pregunta si conviene renovar con el proveedor actual. ¿Cómo estructuras esa decisión?',[
        'Comparar las mensualidades, agregar una estimación de ahorro con el piloto y pedir una decisión esa semana.',
        'Entregar una propuesta de cambio por etapas y esperar a que Finanzas autorice el presupuesto para volver a conversar con Operaciones.',
        'Acordar con Operaciones, TI y Finanzas una revisión previa a la renovación que compare resultado del piloto, costo total, dependencias y riesgo de continuidad.'
      ],2,'La decisión necesita evidencia que sirva a las tres áreas. El siguiente paso queda ligado a la renovación y a las condiciones que cada equipo debe validar.','Decisión de compra')
    ]},
];

export const MISSIONS = [
  { id: 'discovery', title: '¿Agendas o falta discovery?', skill: 'Discovery', minutes: 5, story: 'Caso ficticio · Casa Norte recibe muchas consultas, quiere “un bot” y pide una reunión de propuesta. Todavía no sabes qué resultado necesita.', lesson: 2,
    questions: [
      q('need', '¿Con qué pregunta abres la conversación?', ['¿Cuántos bots quieres contratar?', '¿Dónde se atasca hoy la atención y qué les gustaría mejorar?', '¿Te envío nuestro catálogo completo?'], 1, 'Primero entiende el problema y el resultado esperado. Una solicitud de tecnología todavía no define la necesidad.', 'Discovery'),
      q('authority', 'La persona dice: “Yo lo reviso, pero operaciones decide”. ¿Qué haces?', ['La tratas como decisora final.', 'Descartas el lead.', 'Exploras cómo participa operaciones y acuerdas involucrarla.'], 2, 'Identificar el proceso de decisión ayuda a preparar una conversación útil sin desautorizar al contacto.', 'Discovery'),
      q('brief', '¿Qué contexto entregas al siguiente comercial?', ['Dolor, impacto, participantes, plazo y datos aún por confirmar.', 'Solo el teléfono y la fecha.', 'Una propuesta con supuestos como hechos.'], 0, 'Un buen traspaso distingue evidencia de pendientes. No completa lo desconocido inventando respuestas.', 'Discovery', true),
    ] },
  { id: 'demo', title: 'Rescata la demo', skill: 'Demo', minutes: 6, story: 'Casa Norte necesita atender preguntas de pedidos fuera de horario. Tienes diez minutos para mostrar cómo podrías ayudar.', lesson: 22,
    questions: [
      q('focus', '¿Cómo preparas esos diez minutos?', ['Recorres todos los menús.', 'Eliges una consulta de pedido y muestras su recorrido completo.', 'Empiezas por los descuentos.'], 1, 'Un caso concreto conecta el problema, la solución y el resultado. Los menús son apoyo, no el argumento principal.', 'Demo'),
      q('integration', 'El cliente pregunta por su sistema de pedidos. Aún no verificaste la integración.', ['Dices que se conecta con cualquier sistema.', 'La das por incluida en la demo.', 'Aclara qué es demostración y qué integración debe validarse.'], 2, 'Una demo no prueba una integración. Separa lo mostrado de los requisitos, permisos y alcance que faltan por comprobar.', 'Demo', true),
      q('next', '¿Cómo cierras la demo?', ['Acuerdas qué validar, quién participa y el próximo paso.', 'Con “cualquier cosa me avisas”.', 'Prometes fecha de puesta en marcha sin revisar alcance.'], 0, 'El próximo paso debe resolver una incertidumbre del cliente y tener responsables claros.', 'Demo'),
    ] },
  { id: 'scope', title: 'Detecta la sobrepromesa', skill: 'Alcance', minutes: 5, story: 'Una colega prepara una propuesta y mezcla funcionalidades disponibles, pilotos y anuncios históricos. Ayúdala a separar los estados.', lesson: 8, source: 'wiki',
    questions: [
      q('release', 'La única evidencia es una demo antigua que decía “la próxima semana”. ¿Cómo la presentas?', ['Como disponible para todos.', 'Con disponibilidad por confirmar y una validación pendiente.', 'Como incluida sin costo.'], 1, 'Una estimación histórica no demuestra un lanzamiento. La wiki distingue demo, piloto y disponibilidad confirmada.', 'Alcance', true),
      q('internal', '¿Qué debe entender el cliente sobre comentarios internos de Desk?', ['Los comentarios no se envían al cliente; mencionar no cambia permisos.', 'Cualquier mención da acceso al ticket.', 'Se envían como respuesta pública.'], 0, 'La actualización del 13 de noviembre documenta comentarios internos, hilos y menciones. No son mensajes al cliente ni conceden permisos.', 'Alcance', true),
      q('flag', 'Una capacidad funciona en una cuenta piloto. ¿Qué prometes a otra cuenta?', ['Activación inmediata para todas.', 'La misma habilitación sin comprobarla.', 'El beneficio potencial, sujeto a comprobar habilitación y requisitos.'], 2, 'Una habilitación particular no implica disponibilidad general. Registra la comprobación necesaria antes de comprometerla.', 'Alcance'),
    ] },
  { id: 'objection', level:'basic', title: '“Está muy caro”', skill: 'Negociación', minutes: 5, story: 'Después de la demo, Casa Norte responde: “Está muy caro; otro proveedor cuesta menos”. Debes entender qué está comparando.', lesson: 5,
    questions: [
      q('compare', '¿Cuál es tu primera respuesta?', ['Ofrecer el máximo descuento.', 'Decir que el competidor es malo.', 'Preguntar qué alcance y resultado están comparando.'], 2, 'La objeción puede esconder una diferencia de alcance, presupuesto o valor percibido. Entenderla permite responder con precisión.', 'Negociación'),
      q('value', '¿Cómo explicas el valor?', ['Garantizando un ahorro que no calculaste.', 'Relacionando la solución con un impacto acordado y supuestos explícitos.', 'Repitiendo la lista de funciones.'], 1, 'Construye el argumento con información del caso. Los supuestos de retorno no deben presentarse como resultados garantizados.', 'Negociación', true),
      q('trade', 'Si corresponde revisar condiciones, ¿qué haces?', ['Validas las condiciones autorizadas y acuerdas qué cambia en el alcance.', 'Prometes una excepción antes de validarla.', 'Ocultas lo que queda fuera.'], 0, 'Una negociación sostenible hace visibles condiciones, alcance y dependencias. No compromete excepciones aún no aprobadas.', 'Negociación'),
    ] },
  { id: 'proposal', title: 'Arma una propuesta defendible', skill: 'Propuesta', minutes: 6, story: 'Casa Norte quiere centralizar atención y automatizar consultas. Debes preparar una propuesta que el cliente y el equipo puedan entender.', lesson: 21,
    questions: [
      q('modules', '¿Qué combinación exploras para atención centralizada con automatización?', ['Todos los módulos sin discovery.', 'Desk + Studio, validando el caso y las integraciones.', 'Solo campañas outbound para toda necesidad.'], 1, 'Desk centraliza la atención y Studio aporta automatización. La recomendación final depende del caso y de sus requisitos.', 'Propuesta'),
      q('unknown', 'Falta confirmar un desarrollo especial. ¿Cómo lo reflejas?', ['Lo incluyes como listo.', 'Lo omites hasta después de firmar.', 'Separas lo confirmado del alcance pendiente de validación.'], 2, 'El cliente necesita saber qué está incluido y qué depende de una revisión. Así también proteges al equipo de implementación.', 'Propuesta', true),
      q('close', '¿Qué debe quedar claro junto con la inversión?', ['Alcance, exclusiones, responsabilidades y siguiente paso.', 'Solo el total mensual.', 'Una fecha de implementación no validada.'], 0, 'Una propuesta defendible permite tomar una decisión informada y preparar un traspaso sin sorpresas.', 'Propuesta'),
    ] },
  { id: 'renewal', title: 'Salva la renovación', skill: 'Gestión de cuenta', minutes: 6, story: 'Caso ficticio · Casa Sur se acerca a su renovación. El uso cayó y tu contacto dice que “todo está bien”, pero no tienes evidencia reciente de valor.', lesson: 25,
    questions: [
      q('signal', '¿Qué haces con la caída de uso?', ['La ignoras porque el contacto no reclama.', 'La conviertes en un riesgo a investigar con CS y el cliente.', 'Das el churn por confirmado.'], 1, 'Una señal abre una investigación; no demuestra por sí sola satisfacción ni intención de abandonar.', 'Gestión de cuenta'),
      q('plan', '¿Cuál es un buen próximo paso?', ['Proponer una revisión de objetivos, barreras de uso y plan con responsables.', 'Vender otro módulo sin entender el problema.', 'Esperar hasta el último día.'], 0, 'Alinear valor y adopción con responsables ayuda a decidir acciones concretas antes de hablar de expansión.', 'Gestión de cuenta'),
      q('expand', 'Aparece una necesidad nueva. ¿Cómo la trabajas?', ['La das por vendida.', 'Prometes una mejora sin alcance.', 'Calificas la necesidad y separas expansión comercial de soporte o mejora continua.'], 2, 'No toda solicitud es una oportunidad comercial. Confirma necesidad, alcance y tratamiento con los equipos responsables.', 'Gestión de cuenta', true),
    ] },
  { id: 'handoff', title: 'Que el contexto no se pierda', skill: 'Traspaso', minutes: 5, story: 'Tu trabajo pasa a otra persona del equipo. Quieres que el cliente no tenga que contar todo de nuevo.', lesson: 7,
    questions: [
      q('evidence', '¿Qué registras?', ['Solo “cliente interesado”.', 'Objetivo, alcance acordado, evidencia y pendientes con responsable.', 'Suposiciones para rellenar los campos.'], 1, 'El contexto debe permitir continuar el trabajo. Las incertidumbres siguen visibles y tienen una persona responsable.', 'Traspaso'),
      q('promise', 'El cliente entendió una capacidad diferente a la propuesta. ¿Qué haces?', ['Lo aclaras y concilias el alcance antes de continuar.', 'Esperas a que implementación lo descubra.', 'Eliminas la duda del registro.'], 0, 'Resolver la diferencia temprano evita trasladar una promesa ambigua al siguiente equipo.', 'Traspaso', true),
      q('owner', '¿Cómo compruebas que el traspaso quedó listo?', ['Por haber enviado un mensaje.', 'Por haber adjuntado un archivo.', 'Confirmando recepción, responsables y siguiente acción acordada.'], 2, 'Enviar información es parte del traspaso. Completarlo requiere que el siguiente responsable pueda actuar.', 'Traspaso'),
    ] },
  ...DEMO_MISSIONS,
  ...ADVISORY_MISSIONS,
  ...OBJECTION_MISSIONS,
  ...PLAYBOOK_MISSIONS,
];
export const missionRevision = mission => mission.revision ?? LEGACY_MISSION_REVISION;
export const currentMissionEntry = (mission, entry) =>
  mission && entry?.edition === missionRevision(mission) ? entry : null;
export function currentMissionReview(mission, review) {
  return mission && review && (review.edition ?? LEGACY_MISSION_REVISION) === missionRevision(mission)
    ? review : null;
}
export const skillResult = (mission, answers) => {
  const correct = mission.questions.filter((q, i) => answers[i] === q.correct).length;
  const criticalMiss = mission.questions.some((q, i) => q.critical && answers[i] !== q.correct);
  return { correct, total: mission.questions.length, passed: correct >= 2 && !criticalMiss, criticalMiss };
};
// Fictional consequences make the practice about a conversation, not just recall.
export const CONSEQUENCES = {
  'switch-risk-discovery': ['Cada equipo puede distinguir lo que debe seguir funcionando de lo que se podría mejorar.', 'El cambio empieza a planificarse sin una condición acordada para proteger la atención.'],
  'switch-risk-pilot': ['Operaciones obtiene evidencia del reparto y TI puede revisar el cambio sin tocar el canal activo.', 'La prueba entrega un recorrido general o se interpreta como evidencia de condiciones que aún faltan.'],
  'switch-risk-decision': ['El cliente puede decidir con un resultado operativo, costo total y riesgos conocidos.', 'Finanzas recibe un número sin una decisión coordinada entre quienes dirigen la atención y quienes la operan.'],
  'price-trial-open': ['El cliente puede explicar qué entiende por una alternativa mejor.', 'La conversación se va a una defensa del precio antes de saber qué está comparando.'],
  'price-trial-compare': ['Ambas opciones se pueden mirar con el mismo caso y las mismas condiciones.', 'El cliente recibe un recorrido largo o una lista de funciones sin resolver su duda sobre costo y esfuerzo.'],
  'price-trial-next': ['Queda una forma de retomar que el cliente puede aceptar según su disponibilidad.', 'La conversación queda en una invitación no acordada o en un enlace genérico.'],
  'pb-ice-context': ['La persona entra en confianza y tienes una primera señal de cómo viene a la reunión.', 'Arrancas con un discurso o una pregunta que la persona aún no tiene contexto para responder.'],
  'pb-ice-pace': ['Ambas partes saben qué pueden resolver con el tiempo disponible.', 'La reunión se queda sin tiempo para el acuerdo que el cliente necesitaba.'],
  'pb-ice-transition': ['Sabes quién se sumó y puedes usar el handoff con el foco correcto.', 'Empiezas a hablarle a un supuesto decisor sin confirmar su papel.'],
  'pb-outbound-prep': ["Llegas con hipótesis útiles y puedes confirmar lo que falta en pocos minutos.", "Llegas con el caso centrado en un supuesto o haces repetir información al contacto."],
  'pb-outbound-scope': ["El grupo confirma a qué operación corresponde la conversación.", "La demo puede terminar respondiendo a una empresa distinta de la que evalúa el proyecto."],
  'pb-outbound-handoff': ["El contacto puede decir qué le dio curiosidad sin comprometerse a un proyecto.", "El contacto tiene que corregir premisas antes de hablar de lo que le interesa."],
  'pb-discovery-impact': ["La clienta ve pronto un caso pertinente y aporta el impacto que faltaba.", "La reunión avanza con poca conexión al problema o se vuelve un cuestionario."],
  'pb-discovery-ce': ["Puedes comprobar si hay una consecuencia y qué necesita decidir el cliente antes del hito.", "La fecha aparece como certeza comercial sin información sobre urgencia o compra."],
  'pb-discovery-recap': ["El cliente reconoce su operación y queda claro qué cifra falta levantar.", "La demo o la propuesta parte de un impacto que todavía no se puede respaldar."],
  'pb-demo-path': ["Operaciones reconoce el caso y ve la continuidad entre Studio y Desk.", "El cliente ve funciones sueltas o un ejemplo que no corresponde a un entorno de demo."],
  'pb-demo-connection': ["Queda una validación técnica concreta antes de definir el alcance.", "La clienta puede salir esperando una actualización que aún no se comprobó."],
  'pb-demo-dialogue': ["La clienta explica qué necesita ver Soporte en la derivación.", "El silencio se llena con funciones o se interpreta como aprobación."],
  'pb-pricing-scope': ["Finanzas entiende qué dato dimensiona el alcance y cuál describe al equipo.", "El cliente aterriza en un precio por persona o en una elección sin contexto."],
  'pb-pricing-baseline': ["El equipo sabe qué datos traer y cómo se preparará una estimación útil.", "El número llega a Finanzas con un supuesto que podría confundirse con un compromiso."],
  'pb-pricing-present': ["El cliente puede discutir inversión y retorno con los mismos supuestos.", "Finanzas recibe demasiadas opciones o un monto sin contexto del valor."],
  'pb-decision-kam': ["Puedes conectar la expansión con resultados y restricciones conocidos de la cuenta.", "La solución para la segunda unidad parte de condiciones que aún no comprobaste."],
  'pb-decision-stakeholders': ["Descubres qué señal falta de TI y de Finanzas antes de proyectar la compra.", "El plan toma el apoyo de Operaciones o el go-live como confirmación de la decisión."],
  'pb-decision-next': ["El cliente tiene una reunión concreta para resolver una dependencia de la compra.", "La oportunidad queda con una acción unilateral o una fecha sin respaldo."],
  'pb-followup-record': ["El siguiente ejecutivo puede retomar por el canal y en la ventana acordados.", "El acuerdo se transforma en un recordatorio sin motivo o en una urgencia no confirmada."],
  'pb-followup-window': ["La clienta recibe el correo cuando ya puede revisar qué priorizar.", "El contacto llega durante el intervalo que la clienta pidió reservar para el inventario."],
  'pb-followup-changed': ["El deal refleja si queda un problema y qué siguiente paso tiene sentido.", "La conversación se desvía de la realidad actual del equipo."],
  'advice-orders-flow': ["El comprador obtiene un estado verificable y Soporte recibe solo la excepción.", "El comprador recibe información que puede ser incorrecta o corresponder a otra persona."],
  'advice-orders-fallback': ["La tienda reduce preguntas generales mientras valida la conexión.", "El flujo presenta una estimación o información antigua como si fuera el estado del pedido."],
  'advice-orders-pilot': ["Operaciones ve qué recibe el comprador cuando la consulta funciona y cuando necesita ayuda.", "Las pruebas dejan sin cubrir un caso que puede terminar con información incorrecta o sin ayuda."],
  'advice-queues-flow': ["Cada equipo recibe consultas durante su horario y puede retomar las excepciones.", "La consulta puede pasar por un equipo que no puede resolverla."],
  'advice-queues-pilot': ["El cliente puede probar el reparto con su estructura actual y contar los casos ambiguos.", "El equipo agrega trabajo de clasificación o más filas sin cambiar quién resuelve."],
  'advice-queues-metric': ["Operaciones puede comparar la espera hasta que responde una persona.", "El indicador cambia aunque el tiempo de espera humana siga igual."],
  'advice-campaigns-flow': ["Marketing puede observar las respuestas del segmento elegible y gestionar sus bajas.", "El equipo contacta personas sin evidencia suficiente de elegibilidad."],
  'advice-campaigns-option': ["Marketing puede ampliar la base a medida que queda registrado el permiso.", "Parte del segmento recibe promociones con el permiso aún sin verificar."],
  'advice-campaigns-metric': ["Marketing distingue el interés en la oferta de las ventas registradas.", "El equipo atribuye ventas sin una compra que respalde el dato."],
  'advice-checkout-flow': ["El comprador puede continuar con la variante correcta y pedir ayuda si se atasca.", "La persona puede llegar al pago sin una variante disponible o tener que buscar el producto otra vez."],
  'advice-checkout-option': ["Ventas puede confirmar disponibilidad mientras el bot sigue orientando.", "El usuario avanza con una variante o una reserva que el equipo no verificó."],
  'advice-checkout-trigger': ["El recordatorio parte de un checkout comprobable y excluye a quien compró.", "El comprador puede recibir un aviso por una simple consulta o después de pagar."],
  'advice-knowledge-flow': ["Soporte puede comprobar qué fuente explica la respuesta dada.", "El cliente puede recibir condiciones de otro país, otro canal o una versión antigua."],
  'advice-knowledge-option': ["El equipo aprende del primer alcance mientras prepara las demás fuentes.", "El caso sin política aprobada termina con una condición que el equipo podría no poder aplicar."],
  'advice-knowledge-action': ["El cliente identifica qué debe validar antes de automatizar una decisión irreversible.", "La propuesta confunde orientación o categorización con un cambio real en el sistema."],
  'advice-surveys-flow': ["El equipo puede interpretar qué atención evalúa cada respuesta.", "La encuesta puede llegar por un cierre técnico o repetirse antes de resolver el caso."],
  'advice-surveys-option': ["El primer equipo permite comprobar el disparo y ajustar el piloto antes de ampliarlo.", "Los resultados mezclan cierres incompatibles o dejan fuera parte de la atención."],
  'advice-surveys-metric': ["El cliente ve el puntaje junto con la participación y el contexto de cada área.", "El ranking puede reflejar diferencias de muestra más que de atención."],
  need: ['El contacto describe consultas de pedidos que se acumulan fuera de horario. Ya tienes un problema que explorar.', 'El contacto insiste en “un bot”, pero sigues sin saber qué necesita resolver.'],
  authority: ['Operaciones se suma a la siguiente conversación con preguntas concretas sobre el proceso.', 'Llegas a la propuesta sin entender quién puede decidir ni qué necesita operaciones.'],
  brief: ['El siguiente comercial puede preparar preguntas útiles sin pedirle al cliente que empiece de cero.', 'El siguiente comercial recibe una cita, pero tendrá que reconstruir el contexto.'],
  focus: ['El cliente reconoce su problema en la demo y pregunta cómo validar el recorrido.', 'Se terminan los diez minutos y el cliente todavía no sabe cómo le ayuda la solución.'],
  integration: ['El cliente entiende la diferencia entre el ejemplo mostrado y la integración que falta validar.', 'El cliente sale creyendo que su sistema ya está conectado. La propuesta queda apoyada en un supuesto.'],
  next: ['Ambas partes saben qué comprobar antes de tomar la siguiente decisión.', 'La conversación termina sin una acción concreta que permita avanzar.'],
  release: ['La propuesta conserva la posibilidad sin convertir una estimación en una promesa.', 'El cliente empieza a planificar sobre una disponibilidad que aún no has demostrado.'],
  internal: ['La colega explica correctamente qué se comparte con el cliente y qué queda dentro del equipo.', 'La explicación puede confundir una nota interna con una respuesta al cliente o un permiso de acceso.'],
  flag: ['La validación queda como un paso explícito antes del compromiso comercial.', 'La otra cuenta espera una función que podría no tener habilitada.'],
  compare: ['Descubres qué alcance y condiciones están detrás de la diferencia de precio.', 'La conversación gira hacia descuentos sin saber si las propuestas son comparables.'],
  value: ['El cliente puede revisar contigo el impacto esperado y sus supuestos.', 'El argumento depende de un resultado que todavía no puedes sostener.'],
  trade: ['El cliente entiende las condiciones y el equipo puede revisar una propuesta concreta.', 'La negociación acumula excepciones o exclusiones que nadie ha validado.'],
  modules: ['Tienes una hipótesis de solución que conecta atención y automatización con el caso.', 'La combinación elegida no se puede defender con la necesidad que conoces.'],
  unknown: ['La revisión técnica tiene un alcance pendiente claramente identificado.', 'Implementación recibe un compromiso que no participó en validar.'],
  close: ['El cliente puede evaluar qué recibe, qué debe aportar y cómo continuar.', 'Quedan preguntas de alcance o responsabilidades para después de la decisión.'],
  signal: ['CS y el cliente pueden contrastar la señal con objetivos y barreras de uso.', 'Una suposición reemplaza la revisión de salud de la cuenta.'],
  plan: ['La cuenta termina la revisión con acciones y responsables, no solo una conversación.', 'El riesgo sigue sin un plan que permita evaluar si mejora.'],
  expand: ['La nueva necesidad recibe el tratamiento adecuado sin mezclarse con compromisos existentes.', 'Una solicitud todavía ambigua se convierte en un compromiso comercial.'],
  evidence: ['La siguiente persona distingue qué se acordó de lo que sigue por validar.', 'La siguiente persona recibe una etiqueta, pero no suficiente contexto para actuar.'],
  promise: ['El cliente y el equipo pueden corregir la diferencia antes de continuar.', 'La diferencia de expectativas aparece más adelante, cuando cuesta más resolverla.'],
  owner: ['El siguiente responsable confirma qué recibió y cuál es su primera acción.', 'Sabes que enviaste información, pero no que alguien puede continuar el trabajo.'],
  'orders-discovery': ['Puedes preparar un pedido que el cliente reconozca y una excepción realista.', 'Sigues sin saber de dónde vendrá el estado que verá el comprador.'],
  'orders-show': ['La persona supervisora ve el contexto que recibe su equipo al tomar el ticket.', 'El cliente ve pantallas, pero no cómo se resuelve la consulta de punta a punta.'],
  'orders-limit': ['Queda un paso claro para comprobar la conexión antes de comprometerla.', 'El cliente sale esperando una integración que todavía no se comprobó.'],
  'followup-discovery': ['Puedes seleccionar una venta elegible y un caso que deba salir sin aviso.', 'El equipo podría insistir después de una compra o de una solicitud de no contacto.'],
  'followup-show': ['El cliente ve por qué el flujo espera, reinicia o deja de enviar.', 'El cliente puede entender un plazo distinto del que configura el agente.'],
  'followup-limit': ['El equipo distingue la lógica probada de la entrega que queda por comprobar.', 'La demo se convierte en una promesa de entrega que no puedes acreditar.'],
  'buttons-discovery': ['Ya sabes si preparar una campaña o una interacción con el agente.', 'Puedes terminar mostrando una solución que no responde a la pregunta de Marketing.'],
  'buttons-show': ['Marketing puede leer un envío de prueba y repetir el recorrido con la plantilla adecuada.', 'El cliente espera métricas de una pantalla o una plantilla que no las registra.'],
  'buttons-count': ['Puedes explicar por qué hay más clics que destinatarios distintos.', 'El equipo puede inflar su estimación de personas alcanzadas o de conversiones.'],
  'routing-discovery': ['Tienes un departamento y un plazo objetivo que sirven para preparar la demo.', 'Puedes elegir un ejemplo que no represente la operación que quieren mejorar.'],
  'routing-show': ['Operaciones ve la asignación y después busca su efecto en los datos.', 'El cliente sigue sin poder relacionar el reporte con el recorrido de un ticket.'],
  'routing-limit': ['El cliente distingue la automatización del tiempo hasta la primera respuesta humana.', 'El equipo puede declarar un SLA cumplido con una señal que mide otra cosa.'],
};
export function dueReviews(records, now = Date.now()) {
  return Object.entries(records || {}).filter(([, value]) => value && value.due <= now).map(([key]) => key);
}
export function nextReview(previous, correct, now = Date.now()) {
  const interval = correct ? Math.min((previous?.interval || 0) + 1, 3) : 0;
  return { interval, due: now + [1, 3, 7, 21][interval] * 86400000, correct };
}

export const AE_ONBOARDING_SOURCE = 'https://app.notion.com/p/2b49c2747df58072998cd0810516a166';

// Academy activities link to their corresponding Gantt records for the source materials.
const aeSourceIds = [
  "3d09c2747df581fc80d2cac1493cc659",
  "3d09c2747df581758225c8468b14d1a9",
  "3d09c2747df581198639d1442f1e4f31",
  "3d09c2747df5817b9357e1855ce7659f",
  "3d09c2747df58136b1aaf97118161c20",
  "3d09c2747df581c082aee183ff496d52",
  "3d09c2747df581efbb86f6be359f7067",
  "3d09c2747df581849d71e22905c8037b",
  "3d09c2747df581ca8345ecdcb6da2254",
  "3d09c2747df581d2ae02fe50bc71a004",
  "3d09c2747df58198ba95cc0cab4461b0",
  "3d09c2747df581d48776d600811c872b",
  "3d09c2747df581ea926af238cdf2f24d",
  "3d09c2747df581b59426edb4ec55049a",
  "3d09c2747df581468933cb3f4dfe20bd",
  "3d09c2747df581168c9fc24ed303ad2c",
  "3d09c2747df5816ab960db3cd9008c28",
  "3d09c2747df5810c814cf5ad06638243",
  "3d09c2747df581bea24ee516eb93edd5",
  "3d09c2747df58155a900f8e3d0664d30",
  "3d09c2747df5813d938bef290d8928d0",
  "3d09c2747df581c6ad08ff062863ac6c",
  "3d09c2747df5810fb52be34c4e90e24c",
  "3d09c2747df58147b320fba46d8f5d24",
  "3d09c2747df58100a38cc56c91fc15cf",
  "3d09c2747df581c09130fae93d3c684f",
  "3d09c2747df581ccbd6ec4652a2e55fd",
  "3d09c2747df581a280b7d950a6c6ed3e",
  "3d09c2747df581e98b0fe1a61d56bc0f",
  "3d09c2747df58139a9a9eadb1010f11e",
  "3d09c2747df5815ea456c40354680545",
  "3d09c2747df581e6a544e05c188fcea3",
  "3d09c2747df581b58eb8dad87bdb7c7f",
  "3d09c2747df581a38d9de5d7665b137e",
  "3d09c2747df58104a01ec9e15e088c63",
  "3d09c2747df581368f6fcd39845ec0cb",
  "3d09c2747df581a28f30f4b954ba450f",
  "3d09c2747df58182b457e60862e747c3",
  "3d09c2747df5816cb912d523be9e9487",
  "3d09c2747df581e785b6d8adef841244",
  "3d09c2747df58166a75fe2fb13522462",
  "3d09c2747df5813994d1d33ea3b89059",
  "3d09c2747df58168b559d9191c196f79",
  "3d09c2747df581c58cfacd83b5613c76",
  "3d09c2747df58152b7c3df1d2fe22235",
  "3d09c2747df581bc9d51ffe1dae9fb0e",
  "3d09c2747df581fdb823e2f88c566021",
  "3d09c2747df581668f3cc8d4edd33927",
  "3d09c2747df581e79540cb028b530835",
  "3d09c2747df5813dbfa1f13557892882",
  "3d09c2747df5816293e4da6c8eceb1dc",
  "3d09c2747df5812ea683fac0cab79f41",
  "3d09c2747df581af921bd3558fafde80",
  "3d09c2747df581129ccddc233d6d55ef"
];

const aeDay = (title, first, activities) => ({
  title,
  activities: activities.map(([title, actions = []], index) => {
    const id = first + index;
    return { id, title, actions, source: 'https://app.notion.com/p/' + aeSourceIds[id - 1] };
  }),
});

export const AE_ONBOARDING_WEEKS = [
  {
    title: 'Semana 1 · Fundamentos y operación comercial',
    days: [
      aeDay('Conoce el rol y prepara el pitch', 1, [
        ['Identifica el cliente ideal y sus dolores'],
        ['Ensaya el pitch de Adereso en un minuto', [16]],
        ['Ubica el Playbook y los materiales de Sales'],
        ['Lee el Marco Mental antes de tu primera reunión'],
        ['Ubica a quién acudir en SDR, Growth, KAM, CS, Producto y SSPP', [1]],
        ['Acuerda con tu líder las expectativas, rituales y calendario'],
      ]),
      aeDay('Desk y WhatsApp oficial', 7, [
        ['Mira el video de Desk para administradores'],
        ['Mira el video de Desk para analistas'],
        ['Mira el video de Desk para ejecutivos'],
        ['Explica BSP, templates, opt-in y límites de Meta', [14, 10]],
        ['Prueba roles, horarios, permisos y SLA en Desk', [8]],
        ['Gestiona y deriva un ticket como ejecutivo', [8, 'demo-desk-routing']],
        ['Sigue un ticket desde la entrada hasta su resolución', [8]],
        ['Elige los módulos adecuados para un cliente de la suite', [16]],
      ]),
      aeDay('Explora el resto de la suite', 15, [
        ['Explica cómo Cassper recupera ventas', [23]],
        ['Distingue los usos de VoC y sus señales de calidad', [12]],
        ['Elige una métrica de satisfacción y justifica su uso', [11, 'advice-surveys']],
        ['Diseña un ejemplo de campaña en Engage', [10, 'advice-campaigns']],
        ['Arma y prueba un agente en Studio', [9, 'demo-orders']],
      ]),
      aeDay('Prepara una reunión y su registro', 20, [
        ['Elige un caso de éxito con evidencia para el segmento', [16]],
        ['Prepara un brief y extrae acuerdos de una reunión en Diio', [3, 18]],
        ['Practica BANT y valida el impacto y la urgencia', [2, 'discovery', 'playbook-discovery-event']],
        ['Revisa en HubSpot las asociaciones, el owner y las tareas', [1, 'crm']],
        ['Decide la etapa del deal según la evidencia', [1, 20, 'crm']],
      ]),
      aeDay('Cotiza, presenta y prepara el traspaso', 25, [
        ['Consulta la guía de HubSpot y practica con un deal de prueba', ['crm']],
        ['Encuentra la presentación y los videos vigentes'],
        ['Prepara datos fiscales, firma y traspaso a SSPP', [7, 'handoff']],
        ['Arma una cotización con line items y supuestos claros', [21, 'proposal']],
        ['Explica MRR, OTF, tramos y condiciones comerciales', [4]],
        ['Presenta el valor antes de defender el precio', [4, 'playbook-pricing-roi']],
        ['Ensaya el pitch por producto y la historia de la demo', [22, 'demo']],
      ]),
    ],
  },
  {
    title: 'Semana 2 · Práctica con el equipo y go-live',
    days: [
      aeDay('Ensaya discovery, demo y objeciones', 32, [
        ['Responde objeciones de competencia, seguridad e implementación', [5, 'objection', 'scope']],
        ['Ensaya una presentación comercial de Adereso'],
        ['Haz un roleplay de Desk + Studio con derivación a una persona', ['demo-orders', 'playbook-demo-dialogue']],
        ['Haz un roleplay inbound y acuerda el siguiente paso', ['discovery', 'playbook-discovery-event']],
      ]),
      aeDay('Evalúa Desk y actualiza el pipeline', 36, [
        ['Rinde la evaluación externa de Desk Ejecutivo y corrige las brechas'],
        ['Adapta una demo a la industria, volumen, canal e integración', [22, 'demo']],
        ['Actualiza forecast, importe, fecha de cierre y próxima actividad', [1, 'crm']],
        ['Registra el seguimiento en HubSpot y revisa la etapa', [6, 'playbook-followup-pain', 'crm']],
      ]),
      aeDay('Valida condiciones antes de prometer', 40, [
        ['Identifica la filial, moneda, impuestos y datos fiscales', [7]],
        ['Distingue una integración validada de una que necesita revisión', [9, 'scope', 'advice-checkout']],
        ['Practica una respuesta de seguridad y cuándo escalar a TI', [17, 'scope']],
        ['Adapta la gestión al segmento de la cuenta', [19]],
      ]),
      aeDay('Practica un caso de punta a punta', 44, [
        ['Pide y revisa un brief comercial en Adobo', [18]],
        ['Resuelve los desafíos interactivos en Sales Academy', ['discovery', 'demo', 'proposal']],
        ['Haz el roleplay final con tu referente y recoge su feedback', ['crm']],
        ['Revisa cuándo usar briefs, alertas y coaching de Adobo', [18]],
        ['Defiende la propuesta de valor con supuestos de ROI', ['playbook-pricing-roi', 'proposal']],
        ['Consulta las battlecards y compara alternativas con evidencia', [5, 'objection']],
        ['Elige y explica un caso de uso relevante para tu cliente', [16, 'advice-orders']],
        ['Observa una reunión real, revisa Diio y propone el follow-up', ['crm']],
        ['Simula discovery, demo, pricing y el siguiente paso en HubSpot', ['crm']],
      ]),
      aeDay('Revisión con el líder y plan inicial', 53, [
        ['Revisa agenda, cuentas asignadas y preparación con tu líder', ['crm']],
        ['Acuerda el plan de 30/60 días para cartera, actividad, pipeline y coaching', ['crm']],
      ]),
    ],
  },
];

export const AE_ONBOARDING_EVIDENCE = [
  { id: 'brief', label: 'Discovery y resultado esperado', hint: 'Dolor, impacto, BANT, decisor y qué falta confirmar.' },
  { id: 'demo', label: 'Demo, pricing y objeción', hint: 'Recorrido elegido, módulos, MRR y setup de práctica, supuestos, exclusiones y respuesta a la objeción.' },
  { id: 'deal', label: 'Registro de práctica en HubSpot', hint: 'Referencia del deal de prueba, etapa y motivo, monto, fecha de cierre y qué falta para el forecast.' },
  { id: 'next', label: 'Próxima actividad', hint: 'Resume el acuerdo y deja la actividad con fecha, responsable y objetivo en el deal de prueba.' },
  { id: 'shadowing', label: 'Shadowing y Diio', hint: 'Resume el acuerdo observado, tu follow-up propuesto y lo que revisarás con tu referente. Usa datos anonimizados.' },
  { id: 'review', label: 'Revisión de go-live con tu líder', hint: 'Fecha, resultado, feedback del roleplay y simulación, agenda y confirmación de cartera asignada. Anota los pendientes.' },
  { id: 'plan', label: 'Plan de 30/60 días', hint: 'Para cada hito, registra el objetivo de cartera, actividad, pipeline y la fecha de revisión de coaching.' },
];

// Milestones sit after the day's activities and follow the Playbook conversation.
export const AE_ROLEPLAY_STAGES = [
  {stage:0, day:'0-0', title:'Romper el hielo', mission:'playbook-icebreaker', check:'Adapta el tono y el tiempo al prospecto y abre espacio antes de pasar al contexto.'},
  {stage:1, day:'0-0', title:'Introducción y handoff del SDR', mission:'playbook-outbound', check:'Practica una entrada inbound y una outbound. Confirma lo recibido del SDR sin exigir que el cliente lo repita.'},
  {stage:2, day:'0-3', title:'Discovery y operativa', mission:'playbook-discovery-event', check:'Aclara dolor, impacto y resultado esperado. Confirma la consecuencia del hito o déjala pendiente.'},
  {stage:3, day:'1-0', title:'Presentación y demo', mission:'playbook-demo-dialogue', check:'Muestra un recorrido útil, una excepción y qué depende de una validación técnica.'},
  {stage:4, day:'1-1', title:'Presentación de pricing', mission:'playbook-pricing-roi', check:'Conecta el alcance y el volumen con el valor. Pide los datos faltantes y explica los supuestos del ROI.'},
  {stage:5, day:'1-2', title:'Cierre y siguientes pasos', mission:'playbook-enterprise-decision', check:'Distingue decisor, validadores y fecha de decisión. Cierra con un hito que tenga responsable y plazo.'},
  {stage:6, day:'1-2', title:'Seguimiento al dolor', mission:'playbook-followup-pain', check:'Retoma el dolor acordado, respeta canal y plazo, y deja una próxima actividad verificable.'},
];
