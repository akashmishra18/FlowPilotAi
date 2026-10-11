import { FormEvent, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import DarkModal from './DarkModal';
import { updateProject } from './projectsApi';
import { Project } from './types';
import { darkInputClass, darkLabelClass } from './ui';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';

interface EditProjectModalProps {
  project: Project;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditProjectModal({ project, onClose, onUpdated }: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [clientName, setClientName] = useState(project.clientName);
  const [priority, setPriority] = useState(project.priority);
  const [startDate, setStartDate] = useState(project.startDate.slice(0, 10));
  const [deadline, setDeadline] = useState(project.deadline?.slice(0, 10) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await updateProject(project._id, {
        name: name.trim(),
        description: description.trim(),
        clientName: clientName.trim(),
        priority: priority as never,
        startDate,
        deadline: deadline || undefined,
      });
      onUpdated();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DarkModal title={`Edit ${project.projectCode}`} onClose={onClose}>
      {error && (
        <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-4 py-2.5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={darkLabelClass}>Project Name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={darkInputClass} />
        </div>
        <div>
          <label className={darkLabelClass}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={darkInputClass} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={darkLabelClass}>Client Name</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={darkInputClass} />
          </div>
          <div>
            <label className={darkLabelClass}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as never)} className={darkInputClass}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={darkLabelClass}>Start Date</label>
            <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={darkInputClass} />
          </div>
          <div>
            <label className={darkLabelClass}>End Date</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={darkInputClass} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 rounded-lg">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-60 rounded-lg transition-colors"
          >
            {isSubmitting && <LoaderCircle className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </DarkModal>
  );
}
