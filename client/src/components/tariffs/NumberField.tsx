import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  min?: number;
  inputMode?: "decimal" | "numeric";
  testId?: string;
  hint?: string;
}

/**
 * Numeric input that keeps the user's raw text while typing and never emits
 * NaN/Infinity: an invalid value is reported as `null` (empty field).
 */
export function NumberField({
  id,
  label,
  value,
  onChange,
  unit,
  placeholder,
  allowEmpty = false,
  min = 0,
  inputMode = "decimal",
  testId,
  hint,
}: NumberFieldProps) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRaw((previous) => {
      const previousNumber = previous.trim() === "" ? null : Number(previous.replace(",", "."));
      return previousNumber === value ? previous : value === null ? "" : String(value);
    });
  }, [value]);

  function handleChange(text: string) {
    setRaw(text);
    const normalized = text.trim().replace(",", ".");
    if (normalized === "") {
      setError(allowEmpty ? null : "Укажите значение");
      onChange(null);
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setError("Введите число");
      onChange(null);
      return;
    }
    if (parsed < min) {
      setError(`Значение не может быть меньше ${min}`);
      onChange(null);
      return;
    }
    setError(null);
    onChange(parsed);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={raw}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`min-h-11 text-base ${unit ? "pr-16" : ""}`}
          data-testid={testId}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
