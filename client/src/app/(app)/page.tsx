'use client';

import Link from 'next/link';
import { FilePlus, UploadCloud, CalendarDays } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useDashboardStats } from '@/api/queries';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';
import { ddmmyyyy } from '@/lib/format';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border bg-white p-4 shadow-subtle">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useDashboardStats();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Link href="/entries/new" className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
          <FilePlus size={16} /> Add entry
        </Link>
        <Link href="/datesheets" className="inline-flex items-center gap-2 rounded border border-border bg-white px-4 py-2 text-sm font-medium text-text hover:bg-page">
          <UploadCloud size={16} /> Upload table
        </Link>
        <Link href="/datesheets" className="inline-flex items-center gap-2 rounded border border-border bg-white px-4 py-2 text-sm font-medium text-text hover:bg-page">
          <CalendarDays size={16} /> Open date sheets
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Entries" value={stats?.entries ?? 0} />
          <StatCard label="Programs covered" value={stats?.programs_covered ?? 0} />
          <StatCard label="Next exam date" value={stats?.next_exam_date ? ddmmyyyy(stats.next_exam_date) : '—'} />
          <StatCard label="Clashes blocked this week" value={stats?.clashes_blocked_week ?? 0} />
        </div>
      )}

      {user?.role === 'EXAM_CELL' && stats?.department_status ? (
        <div className="rounded border border-border bg-white p-4 shadow-subtle">
          <h2 className="mb-3 text-sm font-semibold text-text">Department submission status</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Groups with entries</th>
                  <th className="px-3 py-2">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {stats.department_status.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-text">{d.name}</td>
                    <td className="px-3 py-2">
                      {d.groups_with_entries > 0 ? <Chip kind="open">{d.groups_with_entries} groups</Chip> : <Chip kind="neutral">No entries</Chip>}
                    </td>
                    <td className="px-3 py-2 text-muted">{d.last_updated ? ddmmyyyy(d.last_updated.slice(0, 10)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
