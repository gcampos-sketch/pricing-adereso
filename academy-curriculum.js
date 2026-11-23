// Authenticated learning content. These practices are not commercial certification.
export const LEGACY_MISSION_REVISION = '2026-11-13.1';
export const ROLES = {
  SDR: { name: 'SDR', goal: 'Califica y entrega oportunidades con contexto.', missions: ['discovery', 'scope', 'handoff'], lessons: [1, 2, 3, 15] },
  AE: { name: 'Account Executive', goal: 'Del discovery a una propuesta defendible.', missions: ['discovery', 'demo', 'scope', 'objection', 'proposal', 'handoff'], lessons: [3, 22, 4, 5, 6, 7] },
  KAM: { name: 'Key Account Manager', goal: 'Entiende la cuenta, anticipa riesgos y encuentra valor.', missions: ['discovery', 'scope', 'renewal', 'proposal', 'handoff'], lessons: [24, 25, 8, 9] },
};
const q = (id, prompt, options, correct, explanation, skill, critical = false) => ({ id, prompt, options, correct, explanation, skill, critical });
const WIKI = 'https://app.notion.com/p/3219c2747df581a2baebde4de645d487';
const TEAM_PERFORMANCE = 'https://help.adereso.ai/anal%C3%ADtica/89RzusWYBEWNTBJg2WFu5G/rendimiento-de-equipo/71YFbZFH7Q4AErniCZrPMy';
const BUTTON_ANALYTICS = 'https://help.adereso.ai/adereso-engage-mis-campa%C3%B1as/6jf5LkrjFuc3QJXWBTqY5e/medir-y-analizar-botones-de-campa%C3%B1as-de-whatsapp/97JuCUbFZ3uJ5iFiL1NmPG';
export const DEMO_MISSIONS = [
  { id:'demo-orders', revision:'2026-11-22.1', title:'¿Dónde está mi pedido?', skill:'Demo de postventa', minutes:8, lesson:22,
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
  { id:'demo-followup', revision:'2026-11-22.1', title:'La venta quedó a medias', skill:'Demo de seguimiento', minutes:8, lesson:22,
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
  { id:'demo-buttons', revision:'2026-11-22.1', title:'¿Quién hizo clic en el catálogo?', skill:'Demo de analítica', minutes:8, lesson:10,
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
  { id:'demo-desk-routing', revision:'2026-11-22.1', title:'¿Dónde se atrasan los tickets?', skill:'Demo de operación', minutes:8, lesson:8,
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
  { id: 'objection', title: '“Está muy caro”', skill: 'Negociación', minutes: 5, story: 'Después de la demo, Casa Norte responde: “Está muy caro; otro proveedor cuesta menos”. Debes entender qué está comparando.', lesson: 5,
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
