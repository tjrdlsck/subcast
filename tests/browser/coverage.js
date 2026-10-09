const fs = require('node:fs/promises');
const path = require('node:path');

async function writeCoverage(resultsPath) {
  const root = path.resolve(__dirname, '../..');
  const spec = await fs.readFile(path.join(root, 'docs/current/user-scenario-test-spec.md'), 'utf8');
  const defined = [...spec.matchAll(/^### (SC-\d{2}-\d{2}) (.+) \[(P[012])\]/gm)];
  const report = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
  const cases = [];
  function visit(suites) {
    for (const suite of suites || []) {
      for (const scenario of suite.specs || []) {
        const statuses = scenario.tests.map(test => test.status);
        cases.push({ title: scenario.title, file: scenario.file, statuses });
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  const mapping = new Map();
  for (const scenario of cases) {
    for (const match of scenario.title.matchAll(/(SC-\d{2})-(\d{2})((?:\/\d{2})*)/g)) {
      const ids = [`${match[1]}-${match[2]}`, ...match[3].split('/').filter(Boolean).map(n => `${match[1]}-${n}`)];
      for (const id of ids) {
        if (!mapping.has(id)) mapping.set(id, []);
        mapping.get(id).push(scenario);
      }
    }
  }
  const mapped = defined.filter(item => mapping.has(item[1])).length;
  const stats = report.stats || {};
  const lines = [
    '# 브라우저 회귀 검증 결과와 시나리오 연결', '',
    `- 실행 시각: ${stats.startTime || 'unknown'}`,
    `- 실제 테스트: 통과 ${stats.expected || 0}, 실패 ${stats.unexpected || 0}, 불안정 ${stats.flaky || 0}, 건너뜀 ${stats.skipped || 0}.`,
    `- 명세 ${defined.length}개 중 테스트 ID 연결 ${mapped}개, 미연결 ${defined.length - mapped}개.`,
    '- ID 연결은 해당 명세의 일부 행동을 검사한다는 뜻이며 모든 변형의 완전한 커버리지를 보장하지 않는다.',
    '- 미연결 사례를 통과 또는 테스트 완료로 집계하지 않는다. 실제 설치·트레이·다중 디스플레이·출력 장비는 별도 환경 검증이 필요하다.',
    '- 정답 판정에 필요한 정책이 미확정인 사례는 명세의 정책 항목을 참조한다.', '',
    '## 사례별 연결', '',
  ];
  for (const [, id, title, priority] of defined) {
    const tests = mapping.get(id) || [];
    lines.push(`### ${id} ${title} [${priority}]`);
    if (!tests.length) lines.push('- 상태: 자동화 미연결, 검증 완료 아님.');
    else for (const item of tests) {
      lines.push(`- ${item.statuses.join(', ')}: ${item.title} (${item.file})`);
    }
    lines.push('');
  }
  if (report.errors?.length) {
    lines.push('## 실행 환경 오류', '', ...report.errors.map(error => `- ${error.message || error.value || 'unknown error'}`), '');
  }
  const output = path.join(path.dirname(resultsPath), 'coverage.md');
  await fs.writeFile(output, lines.join('\n'));
  console.log(`Scenario mapping: ${mapped}/${defined.length}; report: ${output}`);
  return output;
}

module.exports = { writeCoverage };
