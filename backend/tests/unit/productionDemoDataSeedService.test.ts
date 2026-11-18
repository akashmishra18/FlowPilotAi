import { assertTaskAssigneeIsActiveProjectMember, classifyProductionDemoRecord } from '../../src/services/productionDemoDataSeedService';

describe('production demo data seed safety', () => {
  it('keeps a validated marked record on rerun and never requests overwrite', () => {
    const record = { demoSeedKey: 'marker', title: '[DEMO] task' };
    const validate = jest.fn((candidate: Record<string, unknown>) => {
      expect(candidate.title).toBe('[DEMO] task');
    });

    expect(classifyProductionDemoRecord(record, false, validate)).toBe('KEEP_EXISTING');
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('refuses to adopt an unrelated natural-key collision', () => {
    expect(() => classifyProductionDemoRecord(null, true, jest.fn())).toThrow(/non-seed record/);
  });

  it('permits assigning an active employee who is an active project member', () => {
    expect(() => assertTaskAssigneeIsActiveProjectMember(
      { isActive: true, members: ['employee-1', 'employee-2'] }, { _id: 'employee-2', isActive: true },
    )).not.toThrow();
  });

  it('rejects assigning an employee who is not a project member', () => {
    expect(() => assertTaskAssigneeIsActiveProjectMember(
      { isActive: true, members: ['employee-1'] }, { _id: 'employee-2', isActive: true },
    )).toThrow(/active member/);
  });

  it('rejects inactive projects and employees', () => {
    expect(() => assertTaskAssigneeIsActiveProjectMember(
      { isActive: false, members: ['employee-1'] }, { _id: 'employee-1', isActive: true },
    )).toThrow(/inactive project/);
    expect(() => assertTaskAssigneeIsActiveProjectMember(
      { isActive: true, members: ['employee-1'] }, { _id: 'employee-1', isActive: false },
    )).toThrow(/inactive employee/);
  });
});
