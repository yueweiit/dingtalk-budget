import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCurrentOrganizationOptions } from '../services/department-tree.js';

test('builds current companies and nested departments from the latest tree', () => {
  const options = buildCurrentOrganizationOptions([
    {
      corp_id: 'corp-1',
      dept_id: 'company-1',
      name: '悦为智能 YW Tech_AI',
      path_ids: ['1', 'group-1', 'company-1'],
      path_names: ['ROOT', '悦为集团YUEWEI Grupo', '悦为智能 YW Tech_AI'],
    },
    {
      corp_id: 'corp-1',
      dept_id: 'department-1',
      name: '财务中心',
      path_ids: ['1', 'group-1', 'company-1', 'department-1'],
      path_names: ['ROOT', '悦为集团YUEWEI Grupo', '悦为智能 YW Tech_AI', '财务中心'],
    },
    {
      corp_id: 'corp-1',
      dept_id: 'department-1-child',
      name: '应付组',
      path_ids: ['1', 'group-1', 'company-1', 'department-1', 'department-1-child'],
      path_names: ['ROOT', '悦为集团YUEWEI Grupo', '悦为智能 YW Tech_AI', '财务中心', '应付组'],
    },
  ]);

  assert.deepEqual(options.groups, [{ id: 'group-1', name: '悦为集团YUEWEI Grupo' }]);
  assert.deepEqual(options.companies, [{
    id: 'company-1',
    name: '悦为智能 YW Tech_AI',
    group_dept_id: 'group-1',
    group_name: '悦为集团YUEWEI Grupo',
  }]);
  assert.deepEqual(options.departments.map(({ id, name, company_dept_id }) => ({ id, name, company_dept_id })), [
    { id: 'department-1', name: '财务中心', company_dept_id: 'company-1' },
    { id: 'department-1-child', name: '应付组', company_dept_id: 'company-1' },
  ]);
});

test('does not classify unrelated top-level organization trees as YUEWEI companies', () => {
  const options = buildCurrentOrganizationOptions([{
    corp_id: 'corp-1',
    dept_id: 'aolin-1',
    name: 'AOLIN部门',
    path_ids: ['1', 'aolin'],
    path_names: ['ROOT', 'AOLIN'],
  }]);

  assert.deepEqual(options, { groups: [], companies: [], departments: [] });
});
