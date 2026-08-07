import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentPathOf, departmentPathTitle } from '../src/utils/departmentPath.js';

test('department path hides ROOT and displays the current YUEWEI root name', () => {
  const record = { dept_path_names: ['ROOT', 'YUEWEI', '东莞星铭'] };

  assert.deepEqual(departmentPathOf(record), ['悦为集团YUEWEI Grupo', '东莞星铭']);
  assert.equal(departmentPathTitle(record), '完整链路：悦为集团YUEWEI Grupo > 东莞星铭');
});
