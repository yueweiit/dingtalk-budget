import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDepartmentPresentation,
  departmentIdentityKey,
} from '../services/department-identity.js';

test('uses department ID as the aggregation key even when names are identical', () => {
  assert.equal(departmentIdentityKey({ dept_id: '100', dept_name: 'Sales', form_no: 'A' }), 'id:100');
  assert.equal(departmentIdentityKey({ dept_id: '200', dept_name: 'Sales', form_no: 'B' }), 'id:200');
});

test('isolates legacy name-only records by form number', () => {
  assert.equal(
    departmentIdentityKey({ dept_name: 'Sales', form_no: 'A' }),
    'legacy:A:sales'
  );
  assert.equal(
    departmentIdentityKey({ dept_name: 'Sales', form_no: 'B' }),
    'legacy:B:sales'
  );
});

test('derives parent and sub-department display values from a YUEWEI path', () => {
  assert.deepEqual(buildDepartmentPresentation({
    dept_id: '1079492125',
    dept_path_names: ['ROOT', 'YUEWEI', 'Business Unit', 'Finance', 'Finance CN'],
    form_no: 'A',
  }), {
    departmentDisplay: 'Business Unit',
    subDepartmentDisplay: 'Finance CN',
    identityKey: 'id:1079492125',
  });
});

test('marks records without a reliable department path as pending confirmation', () => {
  assert.deepEqual(buildDepartmentPresentation({
    dept_name: 'Sales',
    form_no: 'A',
  }), {
    departmentDisplay: '待确认',
    subDepartmentDisplay: '',
    identityKey: 'legacy:A:sales',
  });
});
