import type { ExamCycle } from '@/api/types';
import { Select } from './ui/Select';

export function CycleSelect({ cycles, value, onChange }: { cycles: ExamCycle[]; value: number | undefined; onChange: (id: number) => void }) {
  return (
    <Select
      aria-label="Exam cycle"
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      <option value="" disabled>Select exam cycle…</option>
      {cycles.map((cycle) => (
        <option key={cycle.id} value={cycle.id}>
          {cycle.title} – {cycle.month_year}{cycle.status === 'LOCKED' ? ' (Locked)' : ''}
        </option>
      ))}
    </Select>
  );
}
