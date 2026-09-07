/** "$26,300.86" reads as "$26,300" on a phone tile; anything that isn't dollars-and-cents is left alone. */
const short = (v: string) => (v.length > 8 && /^[-+]?\$[\d,]+\.\d{2}$/.test(v) ? v.replace(/\.\d{2}$/, "") : v);

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  const phone = short(value);
  return (
    <div className="window window-sm px-[14px] py-3.5 sm:px-[18px] sm:py-4">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1.5 truncate font-display text-[19px] font-bold leading-none sm:text-[24px]">{phone !== value ? <><span className="sm:hidden">{phone}</span><span className="hidden sm:inline">{value}</span></> : value}</div>
      {hint ? <div className="mt-1.5 text-[12px] text-ink3">{hint}</div> : null}
    </div>
  );
}
