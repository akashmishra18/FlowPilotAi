import Modal from './Modal';
import Button from './Button';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Replaces window.confirm for destructive or irreversible actions. */
export default function ConfirmDialog({ title, message, confirmLabel, tone = 'danger', isLoading = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <p className="text-sm text-slate-300">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
