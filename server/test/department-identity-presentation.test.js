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

test('supports the renamed Yuewei root without changing the department identity key', () => {
  assert.deepEqual(buildDepartmentPresentation({
    dept_id: '1090006842',
    dept_path_names: [
      'ROOT',
      '悦为集团YUEWEI Grupo',
      '凌翔/星铭供应链及职能中心',
      '总经办',
      '供应链及采购执行单元',
    ],
    form_no: 'B',
  }), {
    departmentDisplay: '凌翔/星铭供应链及职能中心',
    subDepartmentDisplay: '供应链及采购执行单元',
    identityKey: 'id:1090006842',
  });
});

test('uses the requested company display for the four Lingxiang/Xingming departments', () => {
  const cases = [
    ['1089533879', '产品&开发', '广州凌翔'],
    ['1090006841', '供应链及采购执行单元', '广州凌翔'],
    ['1089765983', 'HR人力资源中心', '东莞星铭'],
    ['1089928990', 'FC财务中心', '东莞星铭'],
  ];

  for (const [deptId, department, company] of cases) {
    assert.deepEqual(buildDepartmentPresentation({
      dept_id: deptId,
      dept_path_names: ['ROOT', '悦为集团YUEWEI Grupo', '凌翔/星铭供应链及职能中心', department],
      form_no: `form-${deptId}`,
    }), {
      departmentDisplay: company,
      subDepartmentDisplay: department,
      identityKey: `id:${deptId}`,
    });
  }
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
