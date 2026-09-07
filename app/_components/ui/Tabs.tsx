"use client";

/** Small segmented tabs inside a window, in the mode-pill material. */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<[T, string]> }) {
  return (
    <div role="tablist" className="tabs">
      {items.map(([v, l]) => (
        <button key={v} role="tab" type="button" aria-selected={value === v} className={`tab ${value === v ? "is-active" : ""}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
