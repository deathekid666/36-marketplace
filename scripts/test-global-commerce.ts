import {
  currencyForCountry,
  formatMoney,
  normalizeCurrency,
} from "../lib/commerce";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const fixtures: Array<[string, string]> = [
  ["MA", "MAD"],
  ["FR", "EUR"],
  ["DE", "EUR"],
  ["US", "USD"],
  ["GB", "GBP"],
  ["CA", "CAD"],
  ["JP", "JPY"],
  ["AE", "AED"],
  ["NG", "NGN"],
  ["ZA", "ZAR"],
  ["IN", "INR"],
  ["BR", "BRL"],
];

for (const [country, currency] of fixtures) {
  assert(
    currencyForCountry(country) === currency,
    country + " should use " + currency,
  );
}

assert(currencyForCountry("ZZ") === "USD", "Unknown country should fall back to USD");
assert(normalizeCurrency("eur") === "EUR", "Currency normalization failed");
assert(formatMoney(40, "EUR").includes("40"), "Money formatting failed");
assert(formatMoney(120, "MAD").includes("120"), "MAD formatting failed");

console.log("Global commerce fixtures passed");
