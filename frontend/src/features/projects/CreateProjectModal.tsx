import { FormEvent, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import DarkModal from './DarkModal';
import EmployeePicker from './EmployeePicker';
import { createProject } from './projectsApi';
import { darkInputClass, darkLabelClass, getInitials } from './ui';
import { getFriendlyErrorMessage } from '@/services/errorHelpers';
import { Employee } from '@/features/employees/types';

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [managerId, setManagerId] = useState('');
  const [members, setMembers] = useState<Employee[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createProject({
        name: name.trim(),
        projectCode: projectCode.trim(),
        description: description.trim() || undefined,
        clientName: clientName.trim() || undefined,
        priority: priority as never,
        startDate,
        deadline: deadline || undefined,
        managerId: managerId.trim(),
        members: members.map((m) => m._id),
      });
      onCreated();
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DarkModal title="Create Project" subtitle="Set up a new project workspace" onClose={onClose}>
      {error && (
        <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-4 py-2.5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={darkLabelClass}>Project Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={darkInputClass} placeholder="Space Shooter" />
          </div>
          <div>
            <label className={darkLabelClass}>Project Code</label>
            <input
              required
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
              className={darkInputClass}
              placeholder="FP-01"
            />
          </div>
        </div>

        <div>
          <label className={darkLabelClass}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={darkInputClass}
            rows={2}
            placeholder="What is this project about?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={darkLabelClass}>Client Name</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={darkInputClass} />
          </div>
          <div>
            <label className={darkLabelClass}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={darkInputClass}>
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

        <div>
          <label className={darkLabelClass}>Manager User ID</label>
          <input
            required
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className={darkInputClass}
            placeholder="e.g. 665f1c2e9a1b2c3d4e5f6789"
          />
          <p className="text-xs text-slate-500 mt-1">
            Must be an existing user with the MANAGER or ADMIN role. A user picker will be added once a user-search
            endpoint exists.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={darkLabelClass}>Members</label>
            <button
              type="button"
              onClick={() => setShowPicker((s) => !s)}
              className="text-xs text-brand-400 hover:text-brand-300"
            >
              {showPicker ? 'Close' : '+ Add member'}
            </button>
          </div>

          {members.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {members.map((m) => (
                <span
                  key={m._id}
                  className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300"
                >
                  <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px]">
                    {getInitials(m.user?.name ?? m.employeeId)}
                  </span>
                  {m.user?.name ?? m.employeeId}
                  <button
                    type="button"
                    onClick={() => setMembers((prev) => prev.filter((x) => x._id !== m._id))}
                    className="hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {showPicker && (
            <EmployeePicker
              excludeIds={members.map((m) => m._id)}
              onPick={(employee) => {
                setMembers((prev) => [...prev, employee]);
                setShowPicker(false);
              }}
            />
          )}
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
            Create Project
          </button>
        </div>
      </form>
    </DarkModal>
  );
}
