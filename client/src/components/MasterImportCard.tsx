'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UploadCloud, Download } from 'lucide-react';
import { Button } from './ui/Button';
import { apiUpload } from '@/api/client';
import { ApiError } from '@/api/types';

interface RowError { row: number; field: string; message: string }
interface ImportResult { data: { valid: number; skipped: number; inserted: number } }

/** Excel/CSV bulk insert for a master-data table (departments or programs). */
export function MasterImportCard({ resource, label }: { resource: 'departments' | 'programs'; label: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [preview, setPreview] = useState<{ valid: number; skipped: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const upload = useMutation({
    mutationFn: ({ dryRun }: { dryRun: boolean }) => {
      const fd = new FormData();
      fd.append('file', file as File);
      fd.append('dry_run', dryRun ? 'true' : 'false');
      return apiUpload<ImportResult>(`/admin/${resource}/import`, fd);
    },
  });

  async function run(dryRun: boolean) {
    if (!file) return;
    setErrors([]);
    setPreview(null);
    try {
      const res = await upload.mutateAsync({ dryRun });
      if (dryRun) {
        setPreview({ valid: res.data.valid, skipped: res.data.skipped });
      } else {
        toast.success(`${res.data.inserted} ${label} added${res.data.skipped ? `, ${res.data.skipped} already existed` : ''}`);
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        qc.invalidateQueries({ queryKey: [`admin-${resource}`] });
        qc.invalidateQueries({ queryKey: ['meta'] });
      }
    } catch (err) {
      if (err instanceof ApiError && err.rows?.length) setErrors(err.rows);
      else toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    }
  }

  return (
    <div className="rounded border border-border bg-white p-4 shadow-subtle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Bulk add {label} from Excel</h3>
        <a href={`/api/admin/${resource}/template`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Download size={14} /> Download template
        </a>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
          <UploadCloud size={14} className="mr-1" /> Choose .xlsx / .csv
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setErrors([]); setPreview(null); }} />
        {file ? <span className="text-xs font-medium text-text">{file.name}</span> : null}
        <Button type="button" variant="secondary" disabled={!file} loading={upload.isPending} onClick={() => run(true)}>Validate only</Button>
        <Button type="button" disabled={!file} loading={upload.isPending} onClick={() => run(false)}>Upload</Button>
      </div>
      {preview && !errors.length ? (
        <p className="mt-2 text-sm text-success">
          {preview.valid} new {label} ready to add{preview.skipped ? `; ${preview.skipped} already exist and will be skipped` : ''}.
        </p>
      ) : null}
      {errors.length ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded border border-danger/30">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-danger/10 text-danger">
              <tr><th className="px-2 py-1 text-left">Row</th><th className="px-2 py-1 text-left">Field</th><th className="px-2 py-1 text-left">Message</th></tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} className="border-t border-danger/20"><td className="px-2 py-1">{e.row}</td><td className="px-2 py-1">{e.field}</td><td className="px-2 py-1">{e.message}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
