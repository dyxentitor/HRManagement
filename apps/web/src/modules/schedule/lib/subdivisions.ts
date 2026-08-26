/**
 * ISO 3166-2 subdivision options for the org holiday calendar.
 *
 * A holiday import is national-plus-subdivision: `Organization.default_subdivision_code`
 * narrows the gazetted national list down to one state's observances. The backend
 * validates that the code belongs to the org's own country, so this map only has to
 * supply the picker options.
 *
 * Adding another country is a data change, not a component change — register the
 * list under its ISO 3166-1 alpha-2 key below. A country with no entry falls back
 * to "National only".
 */

export interface SubdivisionOption {
  /** Full ISO 3166-2 code, e.g. "MY-10". */
  code: string
  name: string
}

/** Empty subdivision code = national holidays only, no state narrowing. */
export const NATIONAL_ONLY = ""

export const NATIONAL_ONLY_LABEL = "National only"

const MY_SUBDIVISIONS: readonly SubdivisionOption[] = [
  { code: "MY-01", name: "Johor" },
  { code: "MY-02", name: "Kedah" },
  { code: "MY-03", name: "Kelantan" },
  { code: "MY-04", name: "Melaka" },
  { code: "MY-05", name: "Negeri Sembilan" },
  { code: "MY-06", name: "Pahang" },
  { code: "MY-07", name: "Pulau Pinang" },
  { code: "MY-08", name: "Perak" },
  { code: "MY-09", name: "Perlis" },
  { code: "MY-10", name: "Selangor" },
  { code: "MY-11", name: "Terengganu" },
  { code: "MY-12", name: "Sabah" },
  { code: "MY-13", name: "Sarawak" },
  { code: "MY-14", name: "W.P. Kuala Lumpur" },
  { code: "MY-15", name: "W.P. Labuan" },
  { code: "MY-16", name: "W.P. Putrajaya" },
]

/** Keyed by ISO 3166-1 alpha-2. Extend here when a second country goes live. */
export const SUBDIVISIONS_BY_COUNTRY: Readonly<Record<string, readonly SubdivisionOption[]>> = {
  MY: MY_SUBDIVISIONS,
}

const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  MY: "Malaysia",
}

/** Subdivision options for a country, or an empty list when none is registered. */
export function subdivisionsFor(countryCode: string): readonly SubdivisionOption[] {
  return SUBDIVISIONS_BY_COUNTRY[(countryCode || "").toUpperCase()] ?? []
}

/** Human label for a stored subdivision code — falls back to the raw code. */
export function subdivisionLabel(code: string): string {
  if (!code) return NATIONAL_ONLY_LABEL
  const country = code.split("-")[0] ?? ""
  const match = subdivisionsFor(country).find((option) => option.code === code)
  return match ? `${match.name} (${match.code})` : code
}

/** Human label for an ISO 3166-1 country code — falls back to the raw code. */
export function countryLabel(countryCode: string): string {
  const upper = (countryCode || "").toUpperCase()
  if (!upper) return "Not set"
  const name = COUNTRY_NAMES[upper]
  return name ? `${name} (${upper})` : upper
}
