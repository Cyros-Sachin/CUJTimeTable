'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { UploadCloud, Download } from 'lucide-react';
import { Button } from './ui/Button';
import { useBulkUpload } from '@/api/queries';
import { ApiError } from '@/api/types';
import type { ExamType } from '@/api/types';

interface RowError { row: number; field: string; message: string }

export function UploadCard({ cycleId, examType, departmentId }: { cycleId: number | undefined; examType: ExamType; departmentId?: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [validCount, setValidCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bulkUpload = useBulkUpload();

  function buildFormData(dryRun: boolean) {
    if (!file || !cycleId) return null;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('exam_cycle_id', String(cycleId));
    fd.append('exam_type', examType);
    fd.append('dry_run', dryRun ? 'true' : 'false');
    if (departmentId) fd.append('department_id', String(departmentId));
    return fd;
  }

  async function runUpload(dryRun: boolean) {
    const fd = buildFormData(dryRun);
    if (!fd) {
      toast.error('Choose a file and an exam cycle first');
      return;
    }
    setErrors([]);
    setValidCount(null);
    try {
      const res = await bulkUpload.mutateAsync(fd);
      if (dryRun) {
        setValidCount(res.data.valid);
        toast.success(`${res.data.valid} row(s) validated successfully`);
      } else {
        toast.success(`${res.data.inserted} row(s) uploaded`);
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch (err) {
      if (err instanceof ApiError && err.rows?.length) {
        setErrors(err.rows);
      } else if (err instanceof ApiError) {
        toast.error(err.message);
      }
    }
  }

  return (
    <div className="rounded border border-border bg-white p-4 shadow-subtle">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Table upload</h3>
        <a href={`/api/entries/template?exam_type=${examType}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Download size={14} /> Download template
        </a>
      </div>

      <div
        className={`mt-3 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-6 text-center transition-colors ${dragOver ? 'border-primary bg-primary-soft' : 'border-border'}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) setFile(dropped);
        }}
      >
        <UploadCloud className="text-muted" size={28} />
        <p className="text-sm text-muted">Drag & drop an .xlsx or .csv file, or</p>
        <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>Browse file</Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {file ? <p className="text-xs font-medium text-text">{file.name}</p> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={!file} loading={bulkUpload.isPending} onClick={() => runUpload(true)}>Validate only</Button>
        <Button type="button" disabled={!file} loading={bulkUpload.isPending} onClick={() => runUpload(false)}>Upload</Button>
      </div>

      {validCount !== null && !errors.length ? (
        <p className="mt-2 text-sm text-success">{validCount} row(s) are valid and ready to upload.</p>
      ) : null}

      {errors.length ? (
        <div className="mt-3 max-h-56 overflow-y-auto rounded border border-danger/30">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-danger/10 text-danger">
              <tr>
                <th className="px-2 py-1 text-left">Row</th>
                <th className="px-2 py-1 text-left">Field</th>
                <th className="px-2 py-1 text-left">Message</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((err, i) => (
                <tr key={i} className="border-t border-danger/20">
                  <td className="px-2 py-1">{err.row}</td>
                  <td className="px-2 py-1">{err.field}</td>
                  <td className="px-2 py-1">{err.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
