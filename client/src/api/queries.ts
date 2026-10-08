import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiSend, apiUpload, buildQuery } from './client';
import type {
  AcademicSession, AdminUser, AuditLogRow, DashboardStats, DatesheetGroup, DayWiseSummaryRow,
  Department, EntryInput, ExamCycle, ExamEntry, ExamType, MetaResponse, Paged, Program, SubjectType, TimeSlot, User,
} from './types';

// ---- Auth -----------------------------------------------------------------
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet<{ data: User }>('/auth/me').then((r) => r.data),
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => apiSend<{ data: User }>('POST', '/auth/login', body),
    onSuccess: (res) => qc.setQueryData(['me'], res.data),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('POST', '/auth/logout'),
    onSuccess: () => qc.clear(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      apiSend('POST', '/auth/change-password', body),
  });
}

// ---- Meta -------------------------------------------------------------
export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => apiGet<{ data: MetaResponse }>('/meta').then((r) => r.data),
  });
}

// ---- Dashboard --------------------------------------------------------
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiGet<{ data: DashboardStats }>('/dashboard/stats').then((r) => r.data),
  });
}

// ---- Entries ------------------------------------------------------------
export interface EntryFilters {
  cycle_id?: number;
  exam_type?: ExamType;
  department_id?: number;
  program_id?: number;
  semester?: number;
  date_from?: string;
  date_to?: string;
  q?: string;
  page?: number;
  page_size?: number;
  sort?: string;
}

export function useEntries(filters: EntryFilters) {
  return useQuery({
    queryKey: ['entries', filters],
    queryFn: () => apiGet<Paged<ExamEntry>>(`/entries${buildQuery(filters as Record<string, any>)}`),
    enabled: !!filters.cycle_id && !!filters.exam_type,
  });
}

export function useEntry(id: number | undefined) {
  return useQuery({
    queryKey: ['entry', id],
    queryFn: () => apiGet<{ data: ExamEntry }>(`/entries/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EntryInput) => apiSend<{ data: ExamEntry }>('POST', '/entries', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['datesheet-groups'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

export function useUpdateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<EntryInput> }) =>
      apiSend<{ data: ExamEntry }>('PUT', `/entries/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['datesheet-groups'] });
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiSend('DELETE', `/entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['datesheet-groups'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

export function useCheckClash() {
  return useMutation({
    mutationFn: (body: EntryInput & { exclude_id?: number }) => apiSend<{ data: { ok: true } }>('POST', '/entries/check-clash', body),
  });
}

export function useBulkUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => apiUpload<any>('/entries/bulk-upload', formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['datesheet-groups'] });
    },
  });
}

// ---- Datesheets ---------------------------------------------------------
export function useDatesheetGroups(params: { cycle_id?: number; exam_type?: ExamType; department_id?: number }) {
  return useQuery({
    queryKey: ['datesheet-groups', params],
    queryFn: () => apiGet<{ data: DatesheetGroup[] }>(`/datesheets${buildQuery(params as Record<string, any>)}`).then((r) => r.data),
    enabled: !!params.cycle_id && !!params.exam_type,
  });
}

export function datesheetPdfUrl(params: { cycle_id: number; program_id: number; semester: number; exam_type: ExamType; download?: boolean }) {
  return `/api/datesheets/pdf${buildQuery({ ...params, download: params.download ? 1 : undefined })}`;
}

// ---- Consolidated ---------------------------------------------------
export function useConsolidated(filters: EntryFilters) {
  return useQuery({
    queryKey: ['consolidated', filters],
    queryFn: () => apiGet<Paged<ExamEntry> & { day_wise_summary: DayWiseSummaryRow[] }>(`/consolidated${buildQuery(filters as Record<string, any>)}`),
    enabled: !!filters.cycle_id,
  });
}

export function consolidatedExportUrl(kind: 'excel' | 'pdf' | 'zip', filters: EntryFilters) {
  return `/api/consolidated/${kind}${buildQuery(filters as Record<string, any>)}`;
}

// ---- Admin: generic CRUD factory --------------------------------------
function adminCrud<T extends { id: number }>(resource: string) {
  const key = [`admin-${resource}`];
  return {
    useList: () => useQuery({ queryKey: key, queryFn: () => apiGet<{ data: T[] }>(`/admin/${resource}`).then((r) => r.data) }),
    useCreate: () => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (body: Partial<T>) => apiSend<{ data: T }>('POST', `/admin/${resource}`, body),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
      });
    },
    useUpdate: () => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: ({ id, body }: { id: number; body: Partial<T> }) => apiSend('PUT', `/admin/${resource}/${id}`, body),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
      });
    },
    useDelete: () => {
      const qc = useQueryClient();
      return useMutation({
        mutationFn: (id: number) => apiSend('DELETE', `/admin/${resource}/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
      });
    },
  };
}

export const departmentsApi = adminCrud<Department>('departments');
export const programsApi = adminCrud<Program>('programs');
export const subjectTypesApi = adminCrud<SubjectType>('subject-types');
export const timeSlotsApi = adminCrud<TimeSlot>('time-slots');
export const sessionsApi = adminCrud<AcademicSession>('sessions');
export const cyclesApi = adminCrud<ExamCycle>('cycles');

export function useSetCycleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'OPEN' | 'LOCKED' }) =>
      apiSend('PATCH', `/admin/cycles/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-cycles'] });
      qc.invalidateQueries({ queryKey: ['meta'] });
    },
  });
}

// ---- Admin: users -------------------------------------------------------
export function useAdminUsers() {
  return useQuery({ queryKey: ['admin-users'], queryFn: () => apiGet<{ data: AdminUser[] }>('/admin/users').then((r) => r.data) });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; email: string; department_id: number }) =>
      apiSend<{ data: { id: number; name: string; email: string; temp_password: string } }>('POST', '/admin/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: { name?: string; is_active?: boolean } }) =>
      apiSend('PUT', `/admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (id: number) => apiSend<{ data: { temp_password: string } }>('POST', `/admin/users/${id}/reset-password`),
  });
}

// ---- Admin: branding ----------------------------------------------------
export function useBranding() {
  return useQuery({
    queryKey: ['admin-branding'],
    queryFn: () => apiGet<{ data: Record<string, string> }>('/admin/branding').then((r) => r.data),
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { controller_name?: string; controller_title?: string }) => apiSend('PUT', '/admin/branding', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-branding'] }),
  });
}

export function useUploadBrandingFile(kind: 'logo' | 'signature') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiUpload(`/admin/branding/${kind}`, fd);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-branding'] }),
  });
}

// ---- Admin: audit log ---------------------------------------------------
export function useAuditLogs(params: { page: number; page_size: number }) {
  return useQuery({
    queryKey: ['admin-audit-logs', params],
    queryFn: () => apiGet<Paged<AuditLogRow>>(`/admin/audit-logs${buildQuery(params as Record<string, any>)}`),
  });
}
