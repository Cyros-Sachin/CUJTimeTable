'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useBranding, useUpdateBranding, useUploadBrandingFile } from '@/api/queries';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

interface FormValues { controller_name: string; controller_title: string }

export default function BrandingAdminPage() {
  const { data: branding, isLoading } = useBranding();
  const updateBranding = useUpdateBranding();
  const uploadLogo = useUploadBrandingFile('logo');
  const uploadSignature = useUploadBrandingFile('signature');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset } = useForm<FormValues>();

  useEffect(() => {
    if (branding) reset({ controller_name: branding.controller_name || '', controller_title: branding.controller_title || 'Controller of Examinations' });
  }, [branding, reset]);

  async function onSubmit(values: FormValues) {
    try {
      await updateBranding.mutateAsync(values);
      toast.success('Branding updated');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update branding');
    }
  }

  async function handleFile(kind: 'logo' | 'signature', file: File | undefined) {
    if (!file) return;
    try {
      if (kind === 'logo') await uploadLogo.mutateAsync(file);
      else await uploadSignature.mutateAsync(file);
      toast.success(`${kind === 'logo' ? 'Logo' : 'Signature'} uploaded`);
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4 rounded border border-border bg-white p-4 shadow-subtle">
        <h2 className="text-sm font-semibold text-text">Controller details</h2>
        <Field label="Controller name" htmlFor="b-name">
          <Input id="b-name" {...register('controller_name')} />
        </Field>
        <Field label="Controller title" htmlFor="b-title">
          <Input id="b-title" {...register('controller_title')} />
        </Field>
        <div>
          <Button type="submit" loading={updateBranding.isPending}>Save</Button>
        </div>
      </form>

      <div className="flex max-w-md flex-col gap-4 rounded border border-border bg-white p-4 shadow-subtle">
        <h2 className="text-sm font-semibold text-text">Logo</h2>
        <p className="text-xs text-muted">PNG or JPG, up to 1MB. Appears at the top of each date sheet PDF.</p>
        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => handleFile('logo', e.target.files?.[0])} />
        <div>
          <Button type="button" variant="secondary" loading={uploadLogo.isPending} onClick={() => logoInputRef.current?.click()}>Upload logo</Button>
        </div>
      </div>

      <div className="flex max-w-md flex-col gap-4 rounded border border-border bg-white p-4 shadow-subtle">
        <h2 className="text-sm font-semibold text-text">Signature</h2>
        <p className="text-xs text-muted">PNG or JPG, up to 1MB. Appears above the Controller's name on each date sheet PDF.</p>
        <input ref={signatureInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => handleFile('signature', e.target.files?.[0])} />
        <div>
          <Button type="button" variant="secondary" loading={uploadSignature.isPending} onClick={() => signatureInputRef.current?.click()}>Upload signature</Button>
        </div>
      </div>
    </div>
  );
}
