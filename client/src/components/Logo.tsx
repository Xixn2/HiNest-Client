export default function Logo({ size = 26, mark = true }: { size?: number; mark?: boolean }) {
  return (
    <div className="flex items-center gap-2 select-none">
      {mark && (
        <div
          className="grid place-items-center text-white font-extrabold"
          style={{
            width: size * 1.15,
            height: size * 1.15,
            borderRadius: size * 0.32,
            background: "#3182F6",
            fontSize: size * 0.65,
            letterSpacing: "-0.05em",
          }}
        >
          H
        </div>
      )}
      <div
        className="font-extrabold text-ink-900 leading-none"
        style={{ fontSize: size, letterSpacing: "-0.035em" }}
      >
        HiNest
      </div>
    </div>
  );
}
