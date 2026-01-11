# Loom MVP Roadmap

## Success Criterion

**MVP Goal:** "I can label a GitHub issue `loom:ready` and get a PR with working tests within 24 hours."

---

## Architecture Strategy

- **Single Repository:** Focus on one repo for MVP
- **Single Agent:** One agent type implementing changes
- **Queue System:** Cloudflare Durable Objects (in-memory with persistence)
- **Orchestration:** Effect-ts workflows for async pipeline
- **Database:** SQLite for task tracking
- **Sandbox:** Cloudflare Workers isolation for test execution

---

## Timeline: 6-8 Weeks

### Week 1-2: Foundation

#### Tasks
1. **GitHub Webhook Handler** (`apps/api`)
   - Parse webhook payloads (issue events)
   - Verify webhook signature (security)
   - Validate issue labels (`loom:ready`)
   - Return task ID on successful enqueue

2. **Task Queue via Durable Objects** (`apps/api/worker`)
   - `AgentCoordinator` DurableObject implementation
   - Enqueue/dequeue tasks
   - Task state persistence
   - Status transitions (pending → running → completed/failed)

3. **SQLite Schema + Database Service** (`packages/db`)
   - `tasks` table (id, github_issue_id, status, pr_number, timestamps)
   - `task_logs` table (id, task_id, level, message, metadata)
   - CRUD operations for task management
   - Logging infrastructure

4. **Base Effect Workflow Structure** (`packages/core`)
   - Effect pipeline scaffolding
   - Error handling patterns
   - Retry mechanisms
   - Resource management

**Deliverables:**
- ✅ Webhook endpoint responding to GitHub events
- ✅ Tasks being enqueued and persisted
- ✅ Basic Effect workflow skeleton
- ✅ Test coverage for core infrastructure

---

### Week 3-4: Agent Core

#### Tasks
5. **GitHub Service Integration** (`packages/integrations`)
   - Octokit client setup with authentication
   - Issue data fetching and parsing
   - Repository cloning via GitHub API
   - PR creation and comment management
   - Rate limiting and retry logic

6. **Git Service** (`packages/integrations`)
   - Clone repository to temporary workspace
   - Create feature branch from base branch
   - Commit generated code changes
   - Push to remote repository
   - Cleanup temporary workspace

7. **Single Agent Implementation** (`packages/agents`)
   - LLM integration (provider selection: OpenAI/Anthropic/Local)
   - Prompt engineering for code generation
   - Context window management (repo analysis)
   - Self-review mechanism before submission
   - Error handling for LLM failures

8. **Test Runner Service** (`packages/integrations`)
   - Execute test suite in sandbox
   - Parse test results (Jest/Vitest/PYtest/etc.)
   - Determine pass/fail status
   - Capture test output for logs
   - Timeout enforcement (5 min max)

**Deliverables:**
- ✅ GitHub service with full CRUD operations
- ✅ Git operations working locally
- ✅ Agent generating code for simple issues
- ✅ Test runner executing and reporting results

---

### Week 5-6: Integration

#### Tasks
9. **PR Creation Workflow** (`packages/core`)
   - Draft PR with structured template
   - Include issue reference, changes summary
   - Add test results output
   - Request reviewer (configurable)
   - Set labels and metadata

10. **Worker Loop** (`apps/worker`)
    - Consume tasks from Durable Object queue
    - Execute full orchestration workflow
    - Handle errors and retries
    - Update task status throughout
    - Log all operations

11. **Basic Web UI** (`apps/web`)
    - Dashboard: List all tasks with status
    - Task detail view: Full logs, PR link
    - Manual trigger: Submit issue for processing
    - Health check: Worker status
    - Responsive design (mobile-friendly)

12. **End-to-End Testing**
    - Integration test: Webhook → PR creation
    - Test on actual repository with real issues
    - Validate test verification gate works
    - Measure success rate (working PRs / total PRs)

**Deliverables:**
- ✅ PRs being created automatically
- ✅ Worker processing queue continuously
- ✅ Dashboard monitoring system
- ✅ End-to-end pipeline validated

---

### Week 7-8: Polish

#### Tasks
13. **Error Handling and Logging**
    - Structured logging with levels (info/error/debug)
    - Retry logic with exponential backoff
    - Error categorization (transient vs permanent)
    - Alert thresholds (consecutive failures)
    - Log retention policy

14. **Security Hardening**
    - Input validation on all endpoints
    - Sandbox isolation verification
    - Secret management (GitHub App private key)
    - Webhook signature verification enforcement
    - API rate limit monitoring

15. **Documentation**
    - Setup guide (local development, deployment)
    - Issue template for users
    - Troubleshooting common issues
    - API documentation (internal services)
    - Architecture diagrams

16. **Beta Testing**
    - Run on actual repository
    - Process real issues (10-20 for validation)
    - Gather feedback on PR quality
    - Identify edge cases and failure modes
    - Iterate on prompts and logic

**Deliverables:**
- ✅ Robust error handling and monitoring
- ✅ Security audit passed
- ✅ Complete documentation set
- ✅ Beta tested with real issues

---

## Success Metrics

### Technical Metrics
- **Pipeline Success Rate:** ≥60% of issues produce working PRs
- **End-to-End Time:** <24 hours from issue label to PR creation
- **Test Pass Rate:** 100% of PRs pass existing test suite
- **Worker Uptime:** >99% availability

### Quality Metrics
- **Code Review Score:** Human reviewers approve ≥70% of PRs without major changes
- **Bug Rate:** <20% of PRs introduce regressions
- **Code Style:** Follows existing project patterns (measured via linter)

---

## Risk Mitigation

### Week 1-2 (Must Address)
- ✅ Basic test verification gate (prevent bad PRs)
- ✅ Workers sandbox isolation (security)

### Week 3-4 (Should Address)
- ✅ GitHub App authentication (higher rate limits)
- ✅ Task checkpointing (handle long-running tasks)

### Week 5-6 (Can Defer to v1)
- ⏳ Multi-agent coordination
- ⏳ Advanced sandboxing (Docker)
- ⏳ Historical analytics

---

## Escalation Criteria

Move to more complex architecture if:
- Processing >100 issues/day → Consider external queue (BullMQ)
- Need multi-language support → Add Docker sandboxing
- Coordinated multi-agent workflows → Implement agent scheduler
- Multi-repository management → Add tenant isolation, RBAC

---

## Parallelization Opportunities

These can be developed concurrently:
- GitHub service, Git service, Database service, Web UI
- Only dependencies are on Effect workflow structure

---

## Weekly Review Points

- **Week 2:** Foundation complete? Webhook → queue working?
- **Week 4:** Agent core working? Can generate code?
- **Week 6:** Full pipeline end-to-end? PRs created?
- **Week 8:** Beta tested? Ready for v1 planning?

---

## Post-MVP Roadmap (v1)

1. **Multi-Agent Coordination**
   - Planner agent (breaks down complex tasks)
   - Coder agent (implements features)
   - Reviewer agent (reviews code before PR)

2. **Advanced Sandbox**
   - Docker-based isolation
   - Multi-language support (Python, Rust, Go)
   - Network configuration

3. **Automated Iteration**
   - Parse PR comments
   - Agent refines code based on feedback
   - Automatic re-run of tests

4. **Analytics & Optimization**
   - Agent performance metrics
   - Cost optimization (batching, caching)
   - Success rate tracking per issue type
