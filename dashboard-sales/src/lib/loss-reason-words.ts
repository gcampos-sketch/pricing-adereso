export type LossNarrative = { id: string; name: string; url?: string; lostReasonNarrative?: string | null };
const STOP = new Set(`a al algo algun alguna algunas alguno algunos ante antes asi aun aunque bajo bien cada casi como con contra cual cuando de del desde despues donde e el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estaban estamos estan estar estas este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mientras mismo mucha mucho muy nada ni no nos nosotros nuestra nuestro o otra otro para pero por porque puede pueden que quien se sea segun ser si sido sin sobre solo son su sus tal tambien tanto te tener tiene tienen todo todos tras tu tus un una unas uno unos usted ustedes va vamos y ya the and for with this that cliente clientes empresa empresas deal deals perdido perdidos motivo motivos razon razones adereso cassper proyecto propuesta solucion necesita necesitan quiere quieren poder pudimos proceso producto insuficiente explicar otro`.split(/\s+/));
// Editorial exclusions only: retain literal cause/product terms and their exact comments.
// This runs for every cloud, not a cached or externally generated vocabulary.
for (const word of `
  ahora actualmente actual actuales momento momentos hoy ayer manana luego pronto antes despues
  mes meses ano anos dia dias semana semanas enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre
  cambio cambios cambiar cambiaron cambiando caso casos tema temas parte partes forma manera respecto relacion cuenta cuentas
  comenta comentan comento comentando comentario comentarios dice dicen dijo diciendo explica explican explico
  indica indican indico menciona mencionan menciono senala senalan senalo considera consideran considero
  contemplan contempla considerando conversamos conversado conversacion hablamos hablado reunion reuniones
  contacto contactos contactar contactado conversando presenta presentar presentada presentado propuesta propuestas
  avanzar avanza avanzan avanzando avance seguir sigue siguen seguimos dando dado dar deja dejan dejo dejando
  ver vemos veo vieron visto viendo hacer hace hacen hacemos hecho hacerlo poder podria podrian podemos podra podran pudo pudieron
  tener tenemos tenia tenian tendra tendrian siendo sido estar estaria estaban estuvo
  interesa interesado interesados interesada interesadas quiere queria querian quieren desea desean
  este estos esta estas estoy estas estaba estemos esto aquello aquellos aquella aquellas ese esos eso esa esas
  algun alguna algunos algunas ninguno ninguna ningun mismas mismos misma mismo mucha muchas muchos mucho
  otra otras otros otro uno unos una unas dos tres cuatro cinco seis siete ocho nueve diez
  bueno buena buenos buenas bien mal realmente general principalmente practicamente simplemente finalmente inicialmente
  ademas tampoco entonces todavia aun aqui ahi alla hacia durante mediante tanto tantos tanta tantas
  yo vos vosotros nosotras ella ellas el ellos suyo suya suyos suyas nosotros ustedes usted conmigo contigo
  he hemos has habeis hubo habian hubiera hubieran habria habrian habiendo tengo tengas deben debe deber deberia
  the and for with this that these those from into onto about above below through between during before after
  is are was were be been being am have has had do does did done doing will would could should can may might must
  its they them their we our you your he him his she her hers us my mine not also just now then still already
  by to of on in at as an or but so if than too very more most some any all each other another both such
  said says say saying told tell telling comment comments mentioned mention according currently company companies
`.trim().split(/\s+/)) STOP.add(word);
const SHORT_TERMS = new Set(['ia', 'ai', 'bi', 'ti', 'it', 'ux', 'cx', 'qa', 'wa']);
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function lossNarrativeText(text: string | null | undefined): string {
  return (text ?? '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/gi, ' ').replace(/\s+/g, ' ').trim();
}
export function lossNarrativeTerms(text: string): string[] {
  const cleaned = lossNarrativeText(text).replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ');
  return [...new Set((normalize(cleaned).match(/\p{L}+/gu) ?? []).filter(word => (word.length >= 3 || SHORT_TERMS.has(word)) && !STOP.has(word)))];
}
export function buildLossReasonWords(input: LossNarrative[], limit = 32) {
  const deals = [...new Map(input.map(deal => [deal.id, deal])).values()];
  const comments = deals.map(deal => ({ ...deal, text: lossNarrativeText(deal.lostReasonNarrative) })).filter(deal => deal.text);
  const terms = new Map<string, typeof comments>();
  for (const comment of comments) for (const term of lossNarrativeTerms(comment.text)) terms.set(term, [...(terms.get(term) ?? []), comment]);
  const words = [...terms].map(([term, comments]) => ({ term, count: comments.length, comments }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term, 'es')).slice(0, Math.max(0, limit));
  return { total: deals.length, commented: comments.length, words };
}
