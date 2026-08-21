type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="tablist" className="flex border border-hairline rounded-sm overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1.5 text-xs transition-colors ${
            value === opt.value ? 'bg-raised text-text-primary' : 'text-text-dim hover:text-text-secondary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
