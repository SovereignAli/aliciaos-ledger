/** Shown the instant a section is requested, before its data lands: the same windows, empty. */
function Sk({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

function WindowSk({ className = "", lines = 3, style }: { className?: string; lines?: number; style?: React.CSSProperties }) {
  return (
    <div className={`window ${className}`} style={style} aria-hidden="true">
      <div className="titlebar"><Sk className="h-3 w-28" /></div>
      <div className="grid gap-3 px-[22px] pb-[22px] pt-2">
        {Array.from({ length: lines }, (_, i) => (
          <Sk key={i} className={`h-4 ${i === 0 ? "w-2/3" : i === lines - 1 ? "w-1/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="grid grid-cols-12 gap-[18px]" role="status" aria-label="Loading">
      <div className="mb-1 col-span-12"><Sk className="h-7 w-40" /><Sk className="mt-2.5 h-3.5 w-80" /></div>
      <WindowSk className="col-span-12 lg:col-span-5" lines={4} style={{ "--i": 0 } as React.CSSProperties} />
      <WindowSk className="col-span-12 sm:col-span-6 lg:col-span-4" lines={3} style={{ "--i": 1 } as React.CSSProperties} />
      <WindowSk className="col-span-12 sm:col-span-6 lg:col-span-3" lines={4} style={{ "--i": 2 } as React.CSSProperties} />
      <div className="col-span-12 grid grid-cols-2 gap-[18px] sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="window window-sm px-[18px] py-4" style={{ "--i": 3 + i } as React.CSSProperties}>
            <Sk className="h-3 w-16" /><Sk className="mt-3 h-6 w-28" /><Sk className="mt-2.5 h-3 w-20" />
          </div>
        ))}
      </div>
      <WindowSk className="col-span-12 lg:col-span-7" lines={5} style={{ "--i": 7 } as React.CSSProperties} />
      <WindowSk className="col-span-12 lg:col-span-5" lines={5} style={{ "--i": 8 } as React.CSSProperties} />
    </div>
  );
}
