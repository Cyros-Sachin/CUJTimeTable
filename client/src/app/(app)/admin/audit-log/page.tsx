'use client';

import { useState } from 'react';
import { useAuditLogs } from '@/api/queries';
import type { AuditLogRow } from '@/api/types';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';

export default function AuditLogAdminPage() {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { data, isLoading } = useAuditLogs({ page, page_size: pageSize });

  const columns: Column<AuditLogRow>[] = [
    { key: 'time', header: 'Time', render: (r) => new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
    { key: 'user', header: 'User', render: (r) => r.user_name || 'System' },
    { key: 'action', header: 'Action', render: (r) => r.action },
    { key: 'entity', header: 'Entity', render: (r) => r.entity ? `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ''}` : '—' },
    { key: 'ip', header: 'IP', render: (r) => r.ip || '—' },
  ];

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-3">
      <DataTable columns={columns} rows={data?.data || []} rowKey={(r) => r.id} emptyMessage="No audit log entries yet." />
      <Pagination page={page} pageSize={pageSize} total={data?.meta.total || 0} onPageChange={setPage} />
    </div>
  );
}
