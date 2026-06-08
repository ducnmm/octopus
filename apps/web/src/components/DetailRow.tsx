const shortMetricValue = (value: string, fallback: string): string => {
  const text = value.trim();
  if (!text) {
    return fallback;
  }

  if (/^0x[0-9a-fA-F]+$/.test(text) && text.length > 14) {
    return `${text.slice(0, 6)}...${text.slice(-4)}`;
  }

  return text;
};

function MetricValue({ fallback, value }: { fallback: string; value?: string | null }) {
  const fullValue = value?.trim() ?? "";

  return <strong title={fullValue || undefined}>{shortMetricValue(fullValue, fallback)}</strong>;
}

export function DetailRow({ label, value, fallback }: { label: string; value?: string | null; fallback: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <MetricValue fallback={fallback} value={value} />
    </div>
  );
}
