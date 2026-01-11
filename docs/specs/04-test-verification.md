# Spec 04: Test Verification

## Purpose

Execute test suites to validate generated code changes, ensuring no regressions and new functionality works correctly.

---

## Overview

The test verification layer acts as quality gate for Loom. It runs existing test suites, analyzes results, and determines whether code changes are ready for PR submission. This prevents broken or incomplete code from being submitted.

---

## Context

**Position in Pipeline:**
```
03: Implementation → [04: Verification] → 05: PR Creation
```

**Dependencies:**
- Code Implementation (provides changes)
- Git Service (provides workspace)
- Test Runner Service (executes tests)

---

## Workflow

### Step 1: Detect Test Framework

**Goal:** Identify and configure appropriate test runner.

**Actions:**
- Check for test configuration files:
  - `package.json` → check `test` scripts
  - `vitest.config.ts` / `vitest.config.js`
  - `jest.config.js` / `jest.config.ts`
  - `pytest.ini` / `pyproject.toml` (for Python)
- Detect test framework type:
  - **JavaScript/TypeScript**: Vitest, Jest, Mocha, Ava
  - **Python**: pytest, unittest
  - **Go**: go test
  - **Rust**: cargo test

**Output:**
```typescript
interface TestFramework {
  type: 'vitest' | 'jest' | 'pytest' | 'go' | 'rust' | 'unknown'
  command: string
  configFile?: string
  coverageCommand?: string
}
```

---

### Step 2: Execute Test Suite

**Goal:** Run all tests in the codebase.

**Actions:**
- Navigate to repository workspace
- Run test command with appropriate flags
- Capture stdout and stderr
- Store test results

**Commands by Framework:**

**Vitest:**
```bash
bun run test --reporter=json --outputFile=test-results.json
```

**Jest:**
```bash
npm test -- --json --outputFile=test-results.json
```

**Pytest:**
```bash
pytest --json-report --json-report-file=test-results.json
```

**Output:**
```typescript
interface TestResults {
  framework: string
  totalTests: number
  passed: number
  failed: number
  skipped: number
  duration: number
  failures: Array<{
    file: string
    test: string
    error: string
    stack?: string
  }>
  coverage?: {
    statements: number
    branches: number
    functions: number
    lines: number
  }
}
```

---

### Step 3: Analyze Results

**Goal:** Determine if tests pass and identify any failures.

**Actions:**
- Compare results against thresholds
- Identify failing tests
- Categorize failures:
  - **New failures**: Tests that passed before, now fail
  - **Existing failures**: Tests that were already failing
  - **Flaky tests**: Tests that fail intermittently

**Output:**
```typescript
interface TestAnalysis {
  passed: boolean
  score: number // 0-100
  summary: string
  newFailures: Array<{
    file: string
    test: string
    reason: string
  }>
  existingFailures: number
  flakyTests: string[]
  recommendation: 'proceed' | 'fix' | 'retry'
}
```

---

### Step 4: Generate Test Report

**Goal:** Create detailed test report for PR and logs.

**Actions:**
- Format test results as markdown
- Include summary statistics
- List all failures with details
- Add recommendations for fixes

**Output:**
```markdown
## Test Results

**Status:** ❌ FAILED
**Total:** 42 tests
**Passed:** 38
**Failed:** 4
**Skipped:** 0
**Duration:** 12.3s

### New Failures

#### 1. `src/components/Button.test.ts` → `should render with custom color`
```
Expected: "bg-red-500"
Received: "bg-blue-500"
```

#### 2. `src/utils/format.test.ts` → `should format currency`
```
TypeError: Cannot read property 'toFixed' of undefined
```

### Existing Failures

- `src/auth/session.test.ts` → `should handle expired token` (1 existing failure)

### Coverage

- Statements: 85%
- Branches: 78%
- Functions: 90%
- Lines: 84%

### Recommendation

**Status:** FIX required before PR submission.

New failures detected. Please review and fix the failing tests.
```

---

### Step 5: Make Gate Decision

**Goal:** Determine whether to proceed to PR creation or reject changes.

**Decision Logic:**

| Scenario | Decision | Reason |
|----------|----------|--------|
| All tests pass | **PROCEED** | Changes are safe |
| Only new failures | **REJECT** | Changes broke existing functionality |
| Only existing failures | **PROCEED** | Changes didn't break anything new |
| New + existing failures | **REJECT** | Changes broke additional tests |
| Tests timeout | **REJECT** | Changes caused infinite loops or hangs |

**Output:**
```typescript
interface GateDecision {
  allowed: boolean
  reason: string
  nextAction: 'create-pr' | 'reject-changes' | 'retry-tests'
}
```

---

## Success Criteria

**Verification is successful when:**

1. **Test Framework Detected**
   - Correct framework identified
   - Test command determined
   - Configuration loaded

2. **Tests Executed**
   - Test suite runs to completion
   - All test output captured
   - Results stored in structured format

3. **Results Analyzed**
   - Pass/fail status determined
   - New failures identified
   - Existing failures noted
   - Flaky tests detected

4. **Report Generated**
   - Test report created
   - Failures documented with details
   - Recommendations provided

5. **Gate Decision Made**
   - Clear proceed/reject decision
   - Reason documented
   - Next action specified

6. **Timeout Handled**
   - Long-running tests terminated
   - Timeout error logged
   - Decision: reject changes

---

## Error Handling

### Error Types

| Error | Severity | Action |
|-------|----------|--------|
| No test framework found | Medium | Proceed without tests (warn) |
| Test command fails | High | Retry, then reject |
| Tests timeout | High | Terminate, reject |
| Invalid test results | Medium | Retry, then proceed with warning |
| Coverage generation fails | Low | Log warning, continue |

### Retry Strategy

**Test Execution Failures:**
- Retry immediately: 2 times
- If all fail: Reject changes
- Log all retry attempts

**Timeout:**
- Set timeout: 5 minutes
- If exceeded: Terminate and reject

---

## Configuration

```typescript
interface VerificationConfig {
  timeout: number              // default: 300000ms (5 minutes)
  maxRetries: number           // default: 2
  failOnNewFailures: boolean   // default: true
  failOnExistingFailures: boolean // default: false
  generateCoverage: boolean     // default: true
  coverageThreshold: {
    statements: number         // default: 80
    branches: number          // default: 75
    functions: number         // default: 80
    lines: number            // default: 80
  }
}
```

---

## Testing Requirements

### Unit Tests

**Test Suite: `test-verification.spec.ts`**

1. **Framework Detection**
   - ✅ Detect Vitest from package.json
   - ✅ Detect Jest from config file
   - ✅ Detect pytest from pyproject.toml
   - ✅ Return unknown if no framework found

2. **Test Execution**
   - ✅ Execute test command successfully
   - ✅ Capture stdout and stderr
   - ✅ Parse test results from JSON output
   - ✅ Handle test command failures

3. **Result Analysis**
   - ✅ Identify passed/failed tests
   - ✅ Distinguish new vs existing failures
   - ✅ Calculate test score
   - ✅ Detect flaky tests

4. **Report Generation**
   - ✅ Generate markdown report
   - ✅ Include test summary
   - ✅ List all failures with details
   - ✅ Add coverage information

5. **Gate Decision**
   - ✅ Proceed when all tests pass
   - ✅ Reject on new failures
   - ✅ Proceed with existing failures only
   - ✅ Reject on timeout

### Integration Tests

**Test Suite: `test-verification.integration.spec.ts`**

1. **Full Workflow**
   - Detect framework → run tests → analyze → decide
   - Verify correct decision for passing tests
   - Verify correct decision for failing tests

2. **Error Scenarios**
   - No test framework → proceed with warning
   - Test execution fails → retry or reject
   - Tests timeout → terminate and reject

---

## Implementation Notes

### Test Runner Service

```typescript
// packages/integrations/src/test-runner.ts
export const TestRunnerService = Effect.gen(function* () {
  const config = yield* VerificationConfig

  return {
    detectFramework: (repoPath: string) =>
      Effect.gen(function* () {
        // Check package.json for test scripts
        const pkgJson = yield* readFile(`${repoPath}/package.json`)
        const pkg = JSON.parse(pkgJson)

        if (pkg.scripts?.test?.includes('vitest')) {
          return { type: 'vitest', command: 'bun run test' }
        }
        if (pkg.scripts?.test?.includes('jest')) {
          return { type: 'jest', command: 'npm test' }
        }

        // Check for config files
        // ... more detection logic

        return { type: 'unknown', command: 'echo "No tests found"' }
      }),

    executeTests: (repoPath: string, framework: TestFramework) =>
      Effect.gen(function* () {
        const result = yield* exec(framework.command, {
          cwd: repoPath,
          timeout: config.timeout
        })

        // Parse results based on framework type
        return parseTestResults(result.stdout, framework.type)
      }),

    analyzeResults: (results: TestResults, baseline?: TestResults) =>
      Effect.succeed({
        passed: results.failed === 0,
        score: (results.passed / results.totalTests) * 100,
        newFailures: identifyNewFailures(results, baseline),
        existingFailures: baseline?.failed || 0,
        recommendation: makeRecommendation(results, baseline)
      })
  }
})
```

### Effect Workflow Structure

```typescript
// packages/core/src/verification/test-verification.ts
export const TestVerificationWorkflow = Effect.gen(function* () {
  const runner = yield* TestRunnerService
  const git = yield* GitService

  return {
    verify: (workspacePath: string, baseBranch: string) =>
      Effect.gen(function* () {
        // 1. Detect framework
        const framework = yield* runner.detectFramework(workspacePath)

        // 2. Run tests on base branch (for baseline)
        const baseline = yield* git.checkout(workspacePath, baseBranch)
        const baselineResults = yield* runner.executeTests(workspacePath, framework)

        // 3. Run tests on feature branch
        yield* git.checkout(workspacePath, '-') // Back to feature branch
        const featureResults = yield* runner.executeTests(workspacePath, framework)

        // 4. Analyze results
        const analysis = yield* runner.analyzeResults(featureResults, baselineResults)

        // 5. Generate report
        const report = generateTestReport(analysis)

        // 6. Make gate decision
        const decision = makeGateDecision(analysis, config)

        return { analysis, report, decision }
      })
  }
})
```

---

## Performance Considerations

1. **Baseline Comparison:** Only run tests on base branch if coverage tracking enabled
2. **Parallel Execution:** Can run test suites in parallel for multiple projects
3. **Caching:** Cache test results for unchanged dependencies
4. **Timeout Enforcement:** Prevent indefinite test hangs

---

## Success Metrics

- **Test Execution Time:** < 5 minutes per task
- **Test Pass Rate:** > 95% of verification runs succeed
- **Regression Detection:** 100% of breaking changes caught
- **False Positives:** < 5% of rejected changes are actually correct

---

## Open Questions

1. **Baseline Testing:** Should we always run tests on base branch for comparison?
2. **Flaky Tests:** How to handle tests that fail intermittently?
3. **Coverage Requirements:** Should coverage be a hard requirement for PR?
4. **Test Parallelization:** Can we run tests in parallel to reduce time?

---

## Next Steps

After implementing this spec, proceed to:
- **Spec 05: PR Creation** - Pull request creation
- **Spec 06: Orchestration Workflow** - Full pipeline coordination
