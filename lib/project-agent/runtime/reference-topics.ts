import { normalizeReferenceText } from "../reference-library";

/**
 * Jurisdictions named in a text, strongest signal first: a code family or a place. Vietnamese standards must never
 * answer a question about a project elsewhere, so language is only a fallback (see requestJurisdictions).
 */
const PLACES: Array<{ code: string; pattern: RegExp }> = [
	{ code: "SG", pattern: /singapore|\bscdf\b|\bura\b|\bhdb\b|\bbca singapore\b/ },
	{ code: "US", pattern: /united states|\busa\b|\bu\.s\.|\bibc\b|\birc\b|\bnfpa\b|\bada standards?\b|\bnec\b|california|new york|texas|florida|washington state|chicago|seattle/ },
	{ code: "GB", pattern: /united kingdom|\buk\b|england|scotland|wales|london|approved document|\bbs \d|british standard/ },
	{ code: "EU", pattern: /eurocode|\ben 199\d|european union|\beu\b|germany|france|netherlands|italy|spain|poland|sweden|\bdin\b/ },
	{ code: "AU", pattern: /australia|\bncc\b|sydney|melbourne|new zealand/ },
	{ code: "OTHER", pattern: /japan|tokyo|china|shanghai|beijing|korea|seoul|thailand|bangkok|malaysia|kuala lumpur|indonesia|jakarta|philippines|manila|india|dubai|\buae\b|saudi|qatar|cambodia|laos/ },
	{ code: "VN", pattern: /viet ?nam|\bqcvn\b|\btcvn\b|\bbxd\b|ha noi|hanoi|ho chi minh|tp\.? ?hcm|sai gon|saigon|da nang|hai phong|can tho|bac ninh|binh duong|dong nai|quang ninh|nha trang|vung tau|khanh hoa|thua thien|\bhue\b|long an|bac giang|hung yen|vinh phuc/ },
];
/** Entries per topic and jurisdiction; Eurocode entries are stored as INT and serve EU questions. */
const TOPICS: Array<{ pattern: RegExp; ids: Record<string, string[]> }> = [
	{ pattern: /mat do xay dung|he so su dung dat|khoang lui|chi gioi|tang cao|so tang|lo dat|nha pho|nha lien ke|nha o rieng le|quy hoach|building density|setback|plot ratio|floor area ratio|townhouse/, ids: { VN: ["qcvn-01-2021-bxd", "qcvn-01-2026-bxd", "tcvn-9411-2012"] } },
	{ pattern: /pccc|phong chay|chua chay|thoat nan|chong chay|an toan chay|fire (?:safety|escape|code|rating|exit)|means of egress|egress|sprinkler|travel distance/, ids: { VN: ["qcvn-06-2022-bxd", "luat-pccc-cnch-2024"], US: ["ibc-2024", "ifc-2024", "nfpa-101-2024"], GB: ["bs-9999-2017"] } },
	{ pattern: /truong mam non|nha tre|mau giao|truong hoc|kindergarten|preschool|school building/, ids: { VN: ["tcvn-3907-2011", "thong-tu-13-2020-tt-bgddt"] } },
	{ pattern: /nguoi khuyet tat|tiep can su dung|accessib|wheelchair/, ids: { VN: ["qcvn-10-2024-bxd"], US: ["ada-2010"] } },
	{ pattern: /nang luong|tiet kiem dien|energy efficien/, ids: { VN: ["qcvn-09-2017-bxd", "qcvn-04-3-2026-bxd"] } },
	{ pattern: /chung cu|can ho|apartment building/, ids: { VN: ["qcvn-04-2021-bxd"] } },
	{ pattern: /tai trong|tac dong gio|wind load|live load|snow load|structural load/, ids: { VN: ["tcvn-2737-2023"], EU: ["eurocode-en-1990", "eurocode-en-1991"] } },
	{ pattern: /be tong cot thep|ket cau be tong|reinforced concrete|concrete design/, ids: { VN: ["tcvn-5574-2018"], EU: ["eurocode-en-1992"] } },
	{ pattern: /giay phep xay dung|luat xay dung|building permit|construction law|building code/, ids: { VN: ["luat-xay-dung-2025"], US: ["ibc-2024"] } },
];

export function namedJurisdictions(text: string): string[] {
	const plain = normalizeReferenceText(text);
	return PLACES.filter((place) => place.pattern.test(plain)).map((place) => place.code);
}

/**
 * The jurisdictions a question is about: those it names, else those its project names, else Vietnam only when the
 * question is written in Vietnamese. An English question with no place gets none, so nothing Vietnamese is assumed.
 */
export function requestJurisdictions(request: string, projectContext = ""): string[] {
	const named = namedJurisdictions(request);
	if (named.length) return named;
	const fromProject = namedJurisdictions(projectContext);
	if (fromProject.length) return fromProject;
	return /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(request) ? ["VN"] : []; // vi-allow
}

/** "near the school" names a landmark, not a question about school buildings; drop the clause after a proximity word before matching topics. */
const LANDMARK_CLAUSE = /\b(?:gan|sat|canh|ben canh|doi dien|near|next to|opposite|beside|close to|across from)\s+[^.?!;\n]{0,60}/g;

export function topicReferenceIds(text: string, jurisdictions: string[]): string[] {
	const plain = normalizeReferenceText(text).replace(LANDMARK_CLAUSE, " ");
	return [...new Set(TOPICS.filter((topic) => topic.pattern.test(plain)).flatMap((topic) => jurisdictions.flatMap((code) => topic.ids[code] ?? [])))];
}
