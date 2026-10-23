import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type ChoiceOption = { value: string; label: string }

// shadcn Select instead of the native <select>. With a name, it goes in FormData like any field.
export function Choice({
  id,
  name,
  value,
  defaultValue,
  onChange,
  options,
  placeholder,
  required,
}: {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  options: ChoiceOption[]
  placeholder?: string
  required?: boolean
}) {
  return (
    <Select
      items={options}
      name={name}
      value={value}
      defaultValue={defaultValue}
      required={required}
      onValueChange={(v) => v !== null && onChange?.(String(v))}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
