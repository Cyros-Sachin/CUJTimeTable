'use client';

import { Modal } from './Modal';
import { Button } from './Button';

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-text">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
