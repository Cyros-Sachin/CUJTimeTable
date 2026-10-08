'use client';

import { useParams } from 'next/navigation';
import { useEntry } from '@/api/queries';
import { EntryFormFields } from '@/components/EntryFormFields';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export default function EditEntryPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: entry, isLoading, isError } = useEntry(id);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !entry) return <EmptyState title="Entry not found" description="It may have been deleted or you don't have access to it." />;

  return <EntryFormFields entry={entry} />;
}
