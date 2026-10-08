import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

export function PdfPreviewModal({ open, onClose, previewUrl, downloadUrl, title }: {
  open: boolean;
  onClose: () => void;
  previewUrl: string;
  downloadUrl: string;
  title: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <a href={downloadUrl}>
            <Button variant="secondary">Download PDF</Button>
          </a>
        </div>
        <iframe src={previewUrl} title={title} className="h-[70vh] w-full rounded border border-border" />
      </div>
    </Modal>
  );
}
