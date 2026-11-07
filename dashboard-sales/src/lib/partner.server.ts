import { getOwners as fetchOwners, searchDealsCached } from "./hubspot.server";
import {
  LOST_STAGES,
  NICKNAMES,
  PORTAL_ID,
  WON_STAGES,
  gateway,
  periodOf,
  quarterBounds,
  shortPeriod,
  toDTO,
  type Props,
  type RawDeal,
} from "./pulse.server";
import type {
  AlertItem,
  DealDTO,
  Drilldown,
  PartnerReport,
  PartnerRow,
  PartnerStage,
  SourceRow,
} from "./pulse-types";

const PARTNER_PIPELINE = "48811927";

/** Fuentes de creación que identifican negocio de partner. */
const PARTNER_SOURCES = [
  "Partner Sixbell",
  "Partner Converza",
  "Partner ITNG",
  "Partner BiBB",
  "Partner Gaurum",
  "Partner Glow",
  "Partner Solem",
  "Partner Wise Data",
  "Partner Starmice",
  "Referido por partner",
  "Candidato partner",
];

/** Embudo unificado del negocio de partners. */
const STAGE_COLUMNS: PartnerStage[] = [
  { key: "P1", label: "Reunión agendada", id: "100513157" },
  { key: "P2", label: "Reunión concretada", id: "100513158" },
  { key: "P3", label: "Apoyo alcance técnico", id: "100513159" },
  { key: "P4", label: "Cotización presentada", id: "100513160" },
  { key: "P5", label: "En negociación", id: "100513161" },
  { key: "P6", label: "Desarrollo de proyecto", id: "100513163" },
];

/** Etapas del pipeline Comercial mapeadas al embudo de partners. */
const COMMERCIAL_TO_PARTNER: Record<string, string> = {
  "171385863": "P1",
  "171385864": "P2",
  "173996363": "P3",
  "1181334581": "P3",
  "171385866": "P4",
  "171385867": "P5",
  "1245768029": "P5",
};

const PARTNER_WON = new Set([...WON_STAGES, "100513162", "1327023800"]);
const PARTNER_LOST = new Set([...LOST_STAGES, "1327022475"]);

const DEAL_PROPS = [
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "closedate",
  "createdate",
  "hubspot_owner_id",
  "hs_deal_stage_probability",
  "hs_deal_score",
  "closed_lost_reason",
  "fuente_de_creacion",
  "partner",
  "notes_next_activity_date",
];

/** Dueño del contacto asociado = comercial asignado al partner. */
async function fetchContactOwners(dealIds: string[]) {
  const contactOfDeal = new Map<string, string>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    const data = await gateway<{
      results: { from: { id: string }; to: { toObjectId: number }[] }[];
    }>("/crm/v4/associations/deals/contacts/batch/read", {
      method: "POST",
      body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
    });
    for (const row of data.results) {
      const first = row.to?.[0];
      if (first) contactOfDeal.set(row.from.id, String(first.toObjectId));
    }
  }

  const contactIds = [...new Set(contactOfDeal.values())];
  const contactInfo = new Map<string, { ownerId: string | null; name: string }>();
  for (let i = 0; i < contactIds.length; i += 100) {
    const chunk = contactIds.slice(i, i + 100);
    const data = await gateway<{ results: { id: string; properties: Props }[] }>(
      "/crm/v3/objects/contacts/batch/read",
      {
        method: "POST",
        body: JSON.stringify({
          properties: ["hubspot_owner_id", "firstname", "lastname", "email"],
          inputs: chunk.map((id) => ({ id })),
        }),
      },
    );
    for (const row of data.results) {
      const p = row.properties;
      contactInfo.set(row.id, {
        ownerId: p["hubspot_owner_id"] ?? null,
        name:
          [p["firstname"], p["lastname"]].filter(Boolean).join(" ").trim() ||
          p["email"] ||
          `Contacto ${row.id}`,
      });
    }
  }

  return { contactOfDeal, contactInfo };
}

function partnerOf(p: Props): string {
  const source = p["fuente_de_creacion"];
  if (source?.startsWith("Partner ")) return source.slice("Partner ".length);
  if (source === "Referido por partner") return "Referido por partner";
  if (source === "Candidato partner") return "Candidato partner";
  const explicit = p["partner"];
  if (explicit) return explicit;
  return "Sin fuente declarada";
}

function lastQuarters(current: string, count: number): string[] {
  const [yearRaw, qRaw] = current.split("-Q");
  let year = Number(yearRaw);
  let q = Number(qRaw);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${year}-Q${q}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      year -= 1;
    }
  }
  return out;
}

export async function buildPartnerReport(): Promise<PartnerReport> {
  const [pipelineDeals, sourceDeals, ownersRes] = await Promise.all([
    searchDealsCached(
      "partner-pipeline",
      [{ propertyName: "pipeline", operator: "EQ", value: PARTNER_PIPELINE }],
      DEAL_PROPS,
    ),
    searchDealsCached(
      "partner-sources",
      [{ propertyName: "fuente_de_creacion", operator: "IN", values: PARTNER_SOURCES }],
      DEAL_PROPS,
    ),
    fetchOwners(),
  ]);

  const byId = new Map<string, RawDeal>();
  for (const deal of [...pipelineDeals, ...sourceDeals]) byId.set(deal.id, deal);
  const deals = [...byId.values()];

  const ownerNames = new Map<string, string>();
  for (const owner of ownersRes) {
    ownerNames.set(
      owner.id,
      NICKNAMES[owner.id] ??
        ([owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || `Owner ${owner.id}`),
    );
  }

  const { contactOfDeal, contactInfo } = await fetchContactOwners(deals.map((d) => d.id));

  const now = Date.now();
  const currentPeriod = periodOf(new Date(now).toISOString());
  const { end: quarterEnd } = quarterBounds(currentPeriod);
  const periods = lastQuarters(currentPeriod, 8);

  const comercialOf = (deal: RawDeal) => {
    const contactId = contactOfDeal.get(deal.id);
    const info = contactId ? contactInfo.get(contactId) : undefined;
    const fromContact = info?.ownerId ? ownerNames.get(info.ownerId) : undefined;
    return fromContact ?? ownerNames.get(deal.properties["hubspot_owner_id"] ?? "") ?? "Sin asignar";
  };

  const dto = (deal: RawDeal): DealDTO => {
    const base = toDTO(deal, ownerNames, now, quarterEnd);
    const contactId = contactOfDeal.get(deal.id);
    const info = contactId ? contactInfo.get(contactId) : undefined;
    return {
      ...base,
      owner: comercialOf(deal),
      stage: stageLabel(deal),
      source: deal.properties["fuente_de_creacion"] ?? "Sin fuente",
      name: info ? `${base.name} · ${info.name}` : base.name,
    };
  };

  const stageKeyOf = (deal: RawDeal): string | null => {
    const stage = deal.properties["dealstage"] ?? "";
    const partnerStage = STAGE_COLUMNS.find((column) => column.id === stage);
    if (partnerStage) return partnerStage.key;
    return COMMERCIAL_TO_PARTNER[stage] ?? null;
  };

  function stageLabel(deal: RawDeal): string {
    const key = stageKeyOf(deal);
    if (key) return `${key} · ${STAGE_COLUMNS.find((column) => column.key === key)?.label ?? ""}`;
    const stage = deal.properties["dealstage"] ?? "";
    if (PARTNER_WON.has(stage)) return "Ganado";
    if (PARTNER_LOST.has(stage)) return "Perdido";
    return "Otra etapa";
  }

  const openDeals = deals.filter((deal) => stageKeyOf(deal) !== null);
  const wonDeals = deals.filter((deal) => PARTNER_WON.has(deal.properties["dealstage"] ?? ""));
  const lostDeals = deals.filter((deal) => PARTNER_LOST.has(deal.properties["dealstage"] ?? ""));

  const inPeriod = (deal: RawDeal, period: string) => {
    const close = deal.properties["closedate"];
    if (!close) return false;
    const ts = Date.parse(close);
    const { start, end } = quarterBounds(period);
    return ts >= start && ts < end;
  };
  const amountOf = (list: RawDeal[]) =>
    list.reduce((sum, deal) => sum + Number(deal.properties["amount"] ?? 0), 0);
  const weightedOf = (list: RawDeal[]) =>
    list.reduce(
      (sum, deal) =>
        sum +
        Number(deal.properties["amount"] ?? 0) *
          Number(deal.properties["hs_deal_stage_probability"] ?? 0),
      0,
    );

  const drilldowns: Record<string, Drilldown> = {};
  const addDrilldown = (key: string, title: string, subtitle: string, list: RawDeal[]) => {
    drilldowns[key] = {
      title,
      subtitle,
      deals: list.map(dto).sort((a, b) => b.amountValue - a.amountValue),
    };
  };

  // ---------- totales ----------
  const openQ = openDeals.filter((deal) => inPeriod(deal, currentPeriod));
  const wonQ = wonDeals.filter((deal) => inPeriod(deal, currentPeriod));
  const lostQ = lostDeals.filter((deal) => inPeriod(deal, currentPeriod));
  const wonHist = wonDeals.filter((deal) => periods.some((p) => inPeriod(deal, p)));

  addDrilldown("all-open", "Pipeline de partners", "Deals abiertos del negocio de partners", openDeals);
  addDrilldown("all-q-open", "Pipeline Q ponderado", `Deals abiertos que cierran en ${shortPeriod(currentPeriod)}`, openQ);
  addDrilldown("all-won-q", `Ganado ${shortPeriod(currentPeriod)}`, "Deals de partner ganados en el trimestre", wonQ);
  addDrilldown("all-won-hist", "Ganado histórico", "Deals de partner ganados (últimos 8 trimestres)", wonHist);
  addDrilldown("all-lost", "Perdidos", "Deals de partner perdidos", lostDeals);

  // ---------- por partner ----------
  const groups = new Map<string, RawDeal[]>();
  for (const deal of deals) {
    const name = partnerOf(deal.properties);
    groups.set(name, [...(groups.get(name) ?? []), deal]);
  }

  const partners: PartnerRow[] = [...groups.entries()]
    .map(([name, list], index) => {
      const id = `p${index}`;
      const open = list.filter((deal) => stageKeyOf(deal) !== null);
      const won = list.filter((deal) => PARTNER_WON.has(deal.properties["dealstage"] ?? ""));
      const lost = list.filter((deal) => PARTNER_LOST.has(deal.properties["dealstage"] ?? ""));
      const wonQList = won.filter((deal) => inPeriod(deal, currentPeriod));
      const lostQList = lost.filter((deal) => inPeriod(deal, currentPeriod));
      const wonHistList = won.filter((deal) => periods.some((p) => inPeriod(deal, p)));

      addDrilldown(`partner-${id}-open`, `${name} · pipeline abierto`, "Deals abiertos del partner", open);
      addDrilldown(`partner-${id}-q-open`, `${name} · forecast Q`, "Deals abiertos que cierran este trimestre", open.filter((deal) => inPeriod(deal, currentPeriod)));
      addDrilldown(`partner-${id}-won-q`, `${name} · ganado ${shortPeriod(currentPeriod)}`, "Deals ganados en el trimestre", wonQList);
      addDrilldown(`partner-${id}-won-hist`, `${name} · ganado histórico`, "Deals ganados (últimos 8 trimestres)", wonHistList);
      addDrilldown(`partner-${id}-lost`, `${name} · perdidos`, "Deals perdidos del partner", lost);
      for (const column of STAGE_COLUMNS) {
        const inStage = open.filter((deal) => stageKeyOf(deal) === column.key);
        if (inStage.length) {
          addDrilldown(`partner-${id}-stage-${column.key}`, `${name} · ${column.label}`, `Etapa ${column.key}`, inStage);
        }
      }

      let running = 0;
      const trend = periods.map((period) => {
        const bucket = won.filter((deal) => inPeriod(deal, period));
        addDrilldown(`partner-${id}-won-${period}`, `${name} · ganado ${shortPeriod(period)}`, "Deals ganados del trimestre", bucket);
        return {
          period: shortPeriod(period),
          amount: amountOf(bucket),
          deals: bucket.length,
        };
      });
      const cumulative = periods.map((period) => {
        running += amountOf(won.filter((deal) => inPeriod(deal, period)));
        return { period: shortPeriod(period), amount: running };
      });

      const comerciales = [...new Set(open.concat(wonQList).map(comercialOf))].slice(0, 3);

      return {
        id,
        name,
        comerciales: comerciales.length ? comerciales : [...new Set(list.map(comercialOf))].slice(0, 3),
        openAmount: amountOf(open),
        openCount: open.length,
        weightedQ: weightedOf(open.filter((deal) => inPeriod(deal, currentPeriod))),
        avgProbability: open.length
          ? open.reduce(
              (sum, deal) => sum + Number(deal.properties["hs_deal_stage_probability"] ?? 0),
              0,
            ) / open.length
          : 0,
        stages: STAGE_COLUMNS.map((column) => ({
          key: column.key,
          count: open.filter((deal) => stageKeyOf(deal) === column.key).length,
        })),
        wonQAmount: amountOf(wonQList),
        wonQCount: wonQList.length,
        wonHistAmount: amountOf(wonHistList),
        wonHistCount: wonHistList.length,
        lostAmount: amountOf(lost),
        lostCount: lost.length,
        wr: { won: wonQList.length + wonHistList.length - wonQList.length, lost: lostQList.length },
        trend,
        cumulative,
      } satisfies PartnerRow;
    })
    .sort((a, b) => b.openAmount + b.wonHistAmount - (a.openAmount + a.wonHistAmount));

  // WR histórico real por partner (ganados vs perdidos en los últimos 8 Q)
  for (const row of partners) {
    const list = groups.get(row.name) ?? [];
    const won = list.filter(
      (deal) =>
        PARTNER_WON.has(deal.properties["dealstage"] ?? "") &&
        periods.some((p) => inPeriod(deal, p)),
    ).length;
    const lost = list.filter(
      (deal) =>
        PARTNER_LOST.has(deal.properties["dealstage"] ?? "") &&
        periods.some((p) => inPeriod(deal, p)),
    ).length;
    row.wr = { won, lost };
  }

  // ---------- fuentes de creación ----------
  const sourceGroups = new Map<string, RawDeal[]>();
  for (const deal of deals) {
    const source = deal.properties["fuente_de_creacion"] ?? "Sin fuente declarada";
    sourceGroups.set(source, [...(sourceGroups.get(source) ?? []), deal]);
  }
  const sources: SourceRow[] = [...sourceGroups.entries()]
    .map(([source, list], index) => {
      const id = `s${index}`;
      const open = list.filter((deal) => stageKeyOf(deal) !== null);
      const won = list.filter((deal) => PARTNER_WON.has(deal.properties["dealstage"] ?? ""));
      const lost = list.filter((deal) => PARTNER_LOST.has(deal.properties["dealstage"] ?? ""));
      addDrilldown(`source-${id}`, `Fuente: ${source}`, `${list.length} deals con esta fuente de creación`, list);
      return {
        id,
        source,
        isPartner: PARTNER_SOURCES.includes(source),
        openAmount: amountOf(open),
        openCount: open.length,
        wonQAmount: amountOf(won.filter((deal) => inPeriod(deal, currentPeriod))),
        wonHistAmount: amountOf(won.filter((deal) => periods.some((p) => inPeriod(deal, p)))),
        wr: {
          won: won.filter((deal) => periods.some((p) => inPeriod(deal, p))).length,
          lost: lost.filter((deal) => periods.some((p) => inPeriod(deal, p))).length,
        },
      } satisfies SourceRow;
    })
    .sort((a, b) => b.openAmount + b.wonHistAmount - (a.openAmount + a.wonHistAmount));

  // ---------- alertas ----------
  const alerts: AlertItem[] = openDeals
    .map((deal) => {
      const close = deal.properties["closedate"];
      const ts = close ? Date.parse(close) : NaN;
      let reason: string | null = null;
      if (!close) reason = "sin fecha de cierre";
      else if (ts < now) reason = "close vencido";
      else if (!deal.properties["fuente_de_creacion"]) reason = "sin fuente de creación";
      else if (ts - now <= 7 * 86_400_000) reason = "cierra en ≤ 7 días";
      if (!reason) return null;
      return {
        id: deal.id,
        owner: comercialOf(deal),
        name: `${partnerOf(deal.properties)} · ${deal.properties["dealname"] ?? "(sin nombre)"}`,
        reason,
        amount: Number(deal.properties["amount"] ?? 0),
        url: `https://app.hubspot.com/contacts/${PORTAL_ID}/deal/${deal.id}`,
      } satisfies AlertItem;
    })
    .filter((item): item is AlertItem => item !== null)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 12);

  return {
    generatedAt: new Date(now).toISOString(),
    currentPeriod,
    currentLabel: `${shortPeriod(currentPeriod)} QTD`,
    totals: {
      openAmount: amountOf(openDeals),
      openCount: openDeals.length,
      weightedQ: weightedOf(openQ),
      wonQAmount: amountOf(wonQ),
      wonQCount: wonQ.length,
      wonHistAmount: amountOf(wonHist),
      wonHistCount: wonHist.length,
      wr: {
        won: wonQ.length,
        lost: lostQ.length,
      },
      partnerCount: partners.filter((row) => row.name !== "Sin fuente declarada").length,
    },
    stageColumns: STAGE_COLUMNS,
    periods: periods.map(shortPeriod),
    partners,
    sources,
    alerts,
    drilldowns,
  };
}
