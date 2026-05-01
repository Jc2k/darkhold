interface LoadingMascotProps {
  label?: string;
}

export function LoadingMascot({ label = "Loading…" }: LoadingMascotProps) {
  return (
    <div className="text-center py-5">
      <img
        src="/mascot.png"
        alt="Loading"
        width={96}
        height={96}
        className="loading-mascot-img mb-3"
      />
      <div className="text-muted small">{label}</div>
    </div>
  );
}
