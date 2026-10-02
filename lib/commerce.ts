export const DEFAULT_CURRENCY = "USD";

const GROUPS: Record<string, readonly string[]> = {
  EUR: ["AD","AT","BE","HR","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU","MT","MC","ME","NL","PT","SM","SK","SI","ES","VA","XK"],
  USD: ["US","EC","SV","PA","PR","GU","VI","AS","MP","FM","MH","PW","TC","VG","BQ","TL"],
  GBP: ["GB","GG","JE","IM","GS"],
  MAD: ["MA","EH"],
  CAD: ["CA"],
  JPY: ["JP"],
  AUD: ["AU","CX","CC","KI","NR","NF","TV"],
  NZD: ["NZ","CK","NU","PN","TK"],
  CHF: ["CH","LI"],
  SEK: ["SE"],
  NOK: ["NO","SJ","BV"],
  DKK: ["DK","FO","GL"],
  PLN: ["PL"],
  CZK: ["CZ"],
  HUF: ["HU"],
  RON: ["RO"],
  BGN: ["BG"],
  TRY: ["TR"],
  AED: ["AE"],
  SAR: ["SA"],
  QAR: ["QA"],
  KWD: ["KW"],
  BHD: ["BH"],
  OMR: ["OM"],
  JOD: ["JO"],
  ILS: ["IL","PS"],
  EGP: ["EG"],
  TND: ["TN"],
  DZD: ["DZ"],
  LYD: ["LY"],
  NGN: ["NG"],
  GHS: ["GH"],
  KES: ["KE"],
  ZAR: ["ZA"],
  NAD: ["NA"],
  LSL: ["LS"],
  SZL: ["SZ"],
  INR: ["IN"],
  PKR: ["PK"],
  BDT: ["BD"],
  LKR: ["LK"],
  NPR: ["NP"],
  CNY: ["CN"],
  HKD: ["HK"],
  MOP: ["MO"],
  SGD: ["SG"],
  MYR: ["MY"],
  THB: ["TH"],
  IDR: ["ID"],
  PHP: ["PH"],
  KRW: ["KR"],
  TWD: ["TW"],
  VND: ["VN"],
  KHR: ["KH"],
  LAK: ["LA"],
  MMK: ["MM"],
  BND: ["BN"],
  BRL: ["BR"],
  MXN: ["MX"],
  ARS: ["AR"],
  CLP: ["CL"],
  COP: ["CO"],
  PEN: ["PE"],
  UYU: ["UY"],
  BOB: ["BO"],
  PYG: ["PY"],
  VES: ["VE"],
  CRC: ["CR"],
  GTQ: ["GT"],
  HNL: ["HN"],
  NIO: ["NI"],
  DOP: ["DO"],
  JMD: ["JM"],
  TTD: ["TT"],
  BBD: ["BB"],
  BSD: ["BS"],
  RUB: ["RU"],
  UAH: ["UA"],
  GEL: ["GE"],
  AMD: ["AM"],
  AZN: ["AZ"],
  KZT: ["KZ"],
  UZS: ["UZ"],
  KGS: ["KG"],
  AFN: ["AF"],
  IQD: ["IQ"],
  IRR: ["IR"],
  ETB: ["ET"],
  UGX: ["UG"],
  TZS: ["TZ"],
  RWF: ["RW"],
  XOF: ["BJ","BF","CI","GW","ML","NE","SN","TG"],
  XAF: ["CM","CF","TD","CG","GQ","GA"],
  MUR: ["MU"],
  MGA: ["MG"],
  MWK: ["MW"],
  ZMW: ["ZM"],
  BWP: ["BW"],
  MZN: ["MZ"],
  AOA: ["AO"],
  CVE: ["CV"],
  GMD: ["GM"],
  GNF: ["GN"],
  SLL: ["SL"],
  LRD: ["LR"],
  SDG: ["SD"],
  SSP: ["SS"],
  SOS: ["SO"],
  DJF: ["DJ"],
  ERN: ["ER"],
  SCR: ["SC"],
  KMF: ["KM"],
  STN: ["ST"],
  ISK: ["IS"],
  ALL: ["AL"],
  BAM: ["BA"],
  MKD: ["MK"],
  RSD: ["RS"],
  MDL: ["MD"],
  BYN: ["BY"],
  BZD: ["BZ"],
  GYD: ["GY"],
  SRD: ["SR"],
  HTG: ["HT"],
  CUP: ["CU"],
  XCD: ["AG","DM","GD","KN","LC","VC","AI","MS"],
  AWG: ["AW"],
  ANG: ["CW","SX"],
  FJD: ["FJ"],
  PGK: ["PG"],
  SBD: ["SB"],
  VUV: ["VU"],
  WST: ["WS"],
  TOP: ["TO"],
};

const COUNTRY_TO_CURRENCY = new Map<string, string>();
for (const [currency, countries] of Object.entries(GROUPS)) {
  for (const country of countries) COUNTRY_TO_CURRENCY.set(country, currency);
}

export const SUPPORTED_CURRENCIES = [...new Set([
  "MAD","EUR","USD","GBP","CAD","JPY","AUD","NZD","CHF",
  ...Object.keys(GROUPS),
])].sort();

export function normalizeCountryCode(value: unknown, fallback = "") {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : fallback;
}

export function normalizeCurrency(value: unknown, fallback = DEFAULT_CURRENCY) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

export function currencyForCountry(countryCode: unknown) {
  const code = normalizeCountryCode(countryCode);
  return COUNTRY_TO_CURRENCY.get(code) || DEFAULT_CURRENCY;
}

export function formatMoney(
  value: number,
  currency: string,
  locale = "en",
) {
  const safeCurrency = normalizeCurrency(currency);
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return Math.round(amount).toLocaleString(locale) + " " + safeCurrency;
  }
}

export function currencySymbol(currency: string, locale = "en") {
  const safeCurrency = normalizeCurrency(currency);
  try {
    return (
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: safeCurrency,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value || safeCurrency
    );
  } catch {
    return safeCurrency;
  }
}

export function countryName(countryCode: string, locale = "en") {
  const code = normalizeCountryCode(countryCode);
  if (!code) return "";
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export function currencyLabel(currency: string, locale = "en") {
  const code = normalizeCurrency(currency);
  try {
    const label = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    return label ? code + " · " + label : code;
  } catch {
    return code;
  }
}
