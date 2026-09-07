/** "Alex Wilczewski - Roth IRA Brokerage Account - ****4401" → "Roth IRA Brokerage Account". */
export function shortAccountName(name: string): string {
  return name
    .replace(/^[A-Z][a-z]+ [A-Z][a-z]+(?:, [^-]+Cust)? - /, "")
    .replace(/ - \*{2,}\d+$/, "")
    .replace(/\s*\((Checking|Savings)\)$/, "")
    .trim() || name;
}
