// Authenticated learning content. These practices are not commercial certification.
export const EDITION = '2026-11-13.1';
export const ROLES = {
  SDR: { name: 'SDR', goal: 'Califica y entrega oportunidades con contexto.', missions: ['discovery', 'scope', 'handoff'], lessons: [1, 2, 3, 15] },
  AE: { name: 'Account Executive', goal: 'Del discovery a una propuesta defendible.', missions: ['discovery', 'demo', 'scope', 'objection', 'proposal', 'handoff'], lessons: [3, 22, 4, 5, 6, 7] },
  KAM: { name: 'Key Account Manager', goal: 'Entiende la cuenta, anticipa riesgos y encuentra valor.', missions: ['discovery', 'scope', 'renewal', 'proposal', 'handoff'], lessons: [24, 25, 8, 9] },
};
const q = (id, prompt, options, correct, explanation, skill, critical = false) => ({ id, prompt, options, correct, explanation, skill, critical });
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
];
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
};
export function dueReviews(records, now = Date.now()) {
  return Object.entries(records || {}).filter(([, value]) => value && value.due <= now).map(([key]) => key);
}
export function nextReview(previous, correct, now = Date.now()) {
  const interval = correct ? Math.min((previous?.interval || 0) + 1, 3) : 0;
  return { interval, due: now + [1, 3, 7, 21][interval] * 86400000, correct };
}
