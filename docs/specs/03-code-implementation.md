# Spec 03: Code Implementation

## Purpose

Execute AI-powered code generation to implement features or fixes described in GitHub issues, following repository conventions and best practices.

---

## Overview

The code implementation layer is the core intelligence of Loom. It uses AI to analyze issues, understand codebase context, and generate working code changes. The agent follows a systematic process: analyze issue, explore codebase, generate implementation, and validate changes.

---

## Context

**Position in Pipeline:**
```
02: Dispatch → [03: Implementation] → 04: Verification → 05: PR Creation
```

**Dependencies:**
- Agent Dispatch (provides task)
- GitHub Service (fetches issue, repo data)
- Git Service (clone, checkout, commit)
- AI Service (LLM integration)

---

## Workflow

### Step 1: Issue Analysis

**Goal:** Understand what needs to be implemented.

**Actions:**
- Parse issue title and body
- Extract requirements and acceptance criteria
- Identify affected files/modules
- Determine implementation scope

**Output:**
```typescript
interface IssueAnalysis {
  type: 'feature' | 'bugfix' | 'refactor' | 'test'
  scope: 'small' | 'medium' | 'large'
  requirements: string[]
  affectedFiles: string[]
  acceptanceCriteria: string[]
}
```

---

### Step 2: Codebase Exploration

**Goal:** Gather context about the repository structure and patterns.

**Actions:**
- Clone repository to temporary workspace
- Read relevant files (based on issue analysis)
- Identify existing patterns and conventions
- Extract test files for reference
- Understand build and test commands

**Output:**
```typescript
interface CodebaseContext {
  repository: {
    language: string
    framework: string
    buildCommand: string
    testCommand: string
  }
  patterns: {
    codeStyle: 'ts-standard' | 'js-standard' | 'custom'
    namingConvention: 'camelCase' | 'snake_case'
    testFramework: 'vitest' | 'jest' | 'mocha'
  }
  files: {
    relevant: Array<{ path: string; content: string }>
    tests: Array<{ path: string; content: string }>
    configs: Array<{ path: string; content: string }>
  }
}
```

---

### Step 3: Implementation Planning

**Goal:** Create a step-by-step plan for implementing the feature.

**Actions:**
- Use AI to generate implementation plan
- Break down into smaller steps
- Identify new files to create
- Identify existing files to modify
- Determine test additions needed

**Output:**
```typescript
interface ImplementationPlan {
  steps: Array<{
    description: string
    type: 'create' | 'modify' | 'delete'
    filePath: string
    changes: string[]
  }>
  dependencies: string[]
  estimatedComplexity: 'low' | 'medium' | 'high'
}
```

---

### Step 4: Code Generation

**Goal:** Generate actual code changes.

**Actions:**
- Execute implementation plan
- Generate new file contents
- Apply modifications to existing files
- Ensure code follows repository patterns
- Add type definitions if needed

**Output:**
```typescript
interface GeneratedChanges {
  createdFiles: Array<{ path: string; content: string }>
  modifiedFiles: Array<{
    path: string
    original: string
    modified: string
    diff: string
  }>
  deletedFiles: string[]
}
```

---

### Step 5: Self-Review

**Goal:** Verify generated code quality before committing.

**Actions:**
- Run code analysis (type checking, linting)
- Check for common anti-patterns
- Validate against repository conventions
- Add explanatory comments if needed

**Output:**
```typescript
interface ReviewResult {
  passed: boolean
  issues: Array<{
    severity: 'error' | 'warning' | 'info'
    file: string
    message: string
    suggestion?: string
  }>
  score: number // 0-100 quality score
}
```

---

### Step 6: Commit Changes

**Goal:** Persist changes to repository.

**Actions:**
- Create feature branch
- Stage all changes
- Create commit with conventional message
- Push to remote repository

**Output:**
```typescript
interface CommitResult {
  branch: string
  commitSha: string
  commitMessage: string
  changedFiles: number
  additions: number
  deletions: number
}
```

---

## AI Integration

### LLM Provider

**Primary Provider:** OpenAI GPT-4 (or equivalent)
**Backup Provider:** Anthropic Claude 3.5 Sonnet

**Configuration:**
```typescript
interface AIConfig {
  provider: 'openai' | 'anthropic' | 'local'
  model: string
  maxTokens: number
  temperature: number
  apiKey: string
}
```

---

### Prompt Engineering

#### Issue Analysis Prompt

```
You are an expert software developer analyzing a GitHub issue.

ISSUE:
Title: {title}
Body: {body}
Labels: {labels}

Analyze this issue and provide:
1. Type: feature, bugfix, refactor, or test?
2. Scope: small, medium, or large?
3. List specific requirements (one per line)
4. Identify likely affected files (list paths)
5. Extract acceptance criteria (if any)

Return as JSON following this schema:
{{
  "type": "...",
  "scope": "...",
  "requirements": ["...", "..."],
  "affectedFiles": ["...", "..."],
  "acceptanceCriteria": ["...", "..."]
}}
```

#### Implementation Prompt

```
You are an expert {language} developer implementing a feature.

ISSUE ANALYSIS:
{issueAnalysis}

CODEBASE CONTEXT:
{relevantFiles}

IMPLEMENTATION PLAN:
{implementationPlan}

Generate the code changes following the plan:
1. Follow existing code style and patterns
2. Add appropriate type definitions
3. Include necessary error handling
4. Add helpful comments for complex logic
5. Ensure code is testable

Return as JSON:
{{
  "createdFiles": [{{"path": "...", "content": "..."}}, ...],
  "modifiedFiles": [{{"path": "...", "original": "...", "modified": "...", "diff": "..."}}, ...]
}}
```

#### Self-Review Prompt

```
Review the following code changes for quality and correctness.

CHANGES:
{generatedChanges}

CODEBASE CONVENTIONS:
{codeStylePatterns}

Check for:
1. Type errors or missing type definitions
2. Code style violations
3. Common anti-patterns
4. Edge cases not handled
5. Security concerns
6. Performance issues

Return as JSON:
{{
  "passed": boolean,
  "issues": [{{
    "severity": "error" | "warning" | "info",
    "file": "...",
    "message": "...",
    "suggestion": "..."
  }}],
  "score": 0-100
}}
```

---

## Success Criteria

**Implementation is successful when:**

1. **Issue Understood**
   - Requirements extracted from issue
   - Scope identified correctly
   - Affected files determined

2. **Context Gathered**
   - Relevant files identified
   - Patterns understood
   - Test files found

3. **Plan Created**
   - Implementation steps defined
   - File changes listed
   - Complexity assessed

4. **Code Generated**
   - All changes created per plan
   - Code follows repository patterns
   - Types are properly defined
   - Code is readable and maintainable

5. **Self-Review Passed**
   - Quality score ≥ 80
   - No critical issues
   - Warnings addressed

6. **Changes Committed**
   - Feature branch created
   - Commit message follows conventions
   - Changes pushed to remote

7. **No Breaking Changes**
   - Existing tests still pass (will verify in next step)
   - No breaking API changes
   - Backwards compatible

---

## Error Handling

### Error Types

| Error | Severity | Action |
|-------|----------|--------|
| Issue unclear | High | Fail task, ask for clarification |
| Context insufficient | High | Expand exploration, or fail |
| Plan generation failed | High | Retry with different prompt |
| Code generation failed | High | Retry up to 3 times |
| Self-review failed (low score) | Medium | Regenerate code, or fail |
| Type checking errors | Medium | Fix automatically, or fail |
| Git operations failed | High | Retry, or fail task |

### Retry Strategy

**LLM Failures:**
- Retry with same prompt: 1 time
- Retry with simplified prompt: 2 times
- If all fail: Mark task as failed with error

**Git Failures:**
- Retry immediately: 3 times
- If all fail: Mark task as failed with error

---

## Configuration

```typescript
interface ImplementationConfig {
  maxIssueComplexity: 'medium' // MVP: only process small/medium issues
  maxTokensPerRequest: 4000
  temperature: 0.3 // Lower for more deterministic output
  selfReviewThreshold: 80
  maxRetries: 3
  timeout: 300000 // 5 minutes max per issue
}
```

---

## Testing Requirements

### Unit Tests

**Test Suite: `code-implementation.spec.ts`**

1. **Issue Analysis**
   - ✅ Extract requirements from issue
   - ✅ Identify issue type correctly
   - ✅ Determine scope accurately
   - ✅ List affected files

2. **Codebase Exploration**
   - ✅ Identify relevant files
   - ✅ Extract patterns correctly
   - ✅ Read file contents successfully

3. **Implementation Planning**
   - ✅ Generate implementation plan
   - ✅ Break down into steps
   - ✅ Estimate complexity

4. **Code Generation**
   - ✅ Generate new files
   - ✅ Modify existing files
   - ✅ Follow code style

5. **Self-Review**
   - ✅ Catch type errors
   - ✅ Detect style violations
   - ✅ Calculate quality score

6. **Commit Changes**
   - ✅ Create feature branch
   - ✅ Stage and commit changes
   - ✅ Push to remote

### Integration Tests

**Test Suite: `code-implementation.integration.spec.ts`**

1. **Full Workflow**
   - Process real issue → generate code → commit
   - Verify all files created/modified
   - Verify commit message format

2. **Error Scenarios**
   - Unclear issue → fail gracefully
   - Missing context → expand or fail
   - LLM failure → retry or fail

---

## Implementation Notes

### File Operations

**Workspace Management:**
```typescript
// Create temporary workspace
const workspaceDir = `/tmp/loom/${taskId}`
await fs.mkdir(workspaceDir, { recursive: true })

// Cleanup after completion
await fs.rm(workspaceDir, { recursive: true, force: true })
```

**Diff Generation:**
```typescript
import { diffLines } from 'diff'

function generateDiff(original: string, modified: string): string {
  const changes = diffLines(original, modified)
  return changes.map(change => {
    const prefix = change.added ? '+' : change.removed ? '-' : ' '
    return prefix + change.value
  }).join('\n')
}
```

### Effect Workflow Structure

```typescript
// packages/agents/src/implementation/code-implementation.ts
export const CodeImplementationWorkflow = Effect.gen(function* () {
  const config = yield* ImplementationConfig
  const ai = yield* AIService
  const git = yield* GitService
  const analyzer = yield* IssueAnalyzer
  const explorer = yield* CodebaseExplorer
  const reviewer = yield* CodeReviewer

  return {
    implement: (issue: GitHubIssue) =>
      Effect.gen(function* () {
        // 1. Analyze issue
        const analysis = yield* analyzer.analyze(issue)

        // 2. Explore codebase
        const context = yield* explorer.explore(issue.repository, analysis)

        // 3. Create plan
        const plan = yield* ai.generatePlan(analysis, context)

        // 4. Generate code
        const changes = yield* ai.generateCode(plan, context)

        // 5. Self-review
        const review = yield* reviewer.review(changes, context)
        if (!review.passed || review.score < config.selfReviewThreshold) {
          return yield* Effect.fail(new CodeQualityError())
        }

        // 6. Commit changes
        const result = yield* git.commitChanges(issue, changes, plan)

        return { ...result, review }
      })
  }
})
```

---

## Performance Considerations

1. **Context Window:** Limit relevant files to avoid token limit
2. **Caching:** Cache repository analysis to reuse across tasks
3. **Parallel Requests:** Can make multiple LLM calls in parallel where possible
4. **Timeout:** 5 minutes max per issue to prevent indefinite hangs

---

## Success Metrics

- **Code Quality Score:** ≥ 80 (average)
- **Implementation Success Rate:** ≥ 70%
- **Self-Review Pass Rate:** ≥ 85%
- **Average Time per Issue:** < 5 minutes

---

## Open Questions

1. **Context Selection:** How to intelligently select relevant files from large codebases?
2. **Multi-File Changes:** How to handle changes affecting many files?
3. **Test Generation:** Should agent generate tests for new features?
4. **LLM Choice:** Which provider/model works best for code generation?

---

## Next Steps

After implementing this spec, proceed to:
- **Spec 04: Test Verification** - Test execution and validation
- **Spec 05: PR Creation** - Pull request creation
