const STARS = ["#FFD700", "#FF00A8", "#00FF88", "#3BA9FF", "#FF8A00"];

/** Logo em texto: FÁBRICA MÁGICA branco com estrelas coloridas, como no Instagram. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-4xl md:text-6xl" : "text-xl";
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span className="flex gap-1" aria-hidden>
        {STARS.map((c) => (
          <span key={c} style={{ color: c }} className={size === "lg" ? "text-lg" : "text-[10px]"}>
            ★
          </span>
        ))}
      </span>
      <span className={`font-serif font-bold tracking-wide text-white ${text}`}>FÁBRICA MÁGICA</span>
    </span>
  );
}
