import type { ExamEntry } from '@/api/types';
import { ddmmyyyy, isoToWeekday } from '@/lib/format';

export function CalendarGrid({ entries }: { entries: ExamEntry[] }) {
  if (!entries.length) {
    return <div className="rounded border border-dashed border-border bg-white p-6 text-center text-sm text-muted">No entries to show for this view.</div>;
  }

  const slots = [...new Map(entries.map((e) => [e.time_slot_id, e.time_slot_label])).entries()];
  const dates = [...new Set(entries.map((e) => e.exam_date))].sort();

  const cellFor = (date: string, slotId: number) => entries.filter((e) => e.exam_date === date && e.time_slot_id === slotId);

  return (
    <div className="overflow-x-auto rounded border border-border bg-white shadow-subtle">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-page text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-3 py-2">Date</th>
            {slots.map(([id, label]) => <th key={id} className="px-3 py-2">{label}</th>)}
            <th className="px-3 py-2">Day total</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const dayEntries = entries.filter((e) => e.exam_date === date);
            const totalStudents = dayEntries.reduce((sum, e) => sum + e.student_count, 0);
            return (
              <tr key={date} className="border-b border-border last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-text">
                  {ddmmyyyy(date)}<br /><span className="text-xs text-muted">({isoToWeekday(date)})</span>
                </td>
                {slots.map(([id]) => (
                  <td key={id} className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {cellFor(date, Number(id)).map((e) => (
                        <span key={e.id} className="rounded bg-primary-soft px-2 py-1 text-xs text-primary">
                          {e.department_code} · {e.program_code} · {e.course_code}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{dayEntries.length} papers / {totalStudents} students</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
