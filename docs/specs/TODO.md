# TODO

## High Priority Tasks

### Markdown Formatting Support

**Issue:** Biome formatter does not support markdown files yet ([Biome issue #3818](https://github.com/biomejs/biome/issues/3818))

**Current State:**
- `.editorconfig` requires 2-space indentation for all files
- `editorconfig-checker` (ec) reports markdown files with 4-space indentation as errors
- `bun ec` cannot fix these errors automatically
- Biome format doesn't process markdown files

**Current Workaround:**
- Markdown files are excluded from `ec` in `lefthook.yaml`
- This allows commits to proceed while formatting issue is unresolved

**Solutions to Consider:**

1. **Add dprint for markdown formatting**
   - Install dprint with markdown plugin
   - Configure to respect `.editorconfig`
   - Add to pre-commit workflow
   - Keep Biome for everything else

2. **Wait for Biome markdown support**
   - Track Biome roadmap for markdown formatter
   - Re-enable `ec` for markdown once supported

3. **Manual formatting with tool**
   - Use existing markdown formatter (e.g., prettier) just for docs
   - Create custom script: `bun format:docs`

4. **Fix indentation manually**
   - Use sed or similar to batch fix markdown indentation
   - Run: `find docs -name "*.md" -exec sed -i '' 's/^    /  /g' {} \;`

**Decision Needed:**
- Which solution should we implement?
- Should we temporarily disable `ec` for markdown or use dprint?
- Timeline: When should we address this?

---

## Medium Priority Tasks

### Spec Implementation

- [ ] Implement Spec 01: GitHub Ingestion (webhook + sync mode)
- [ ] Implement Spec 02: Agent Dispatch
- [ ] Implement Spec 03: Code Implementation
- [ ] Implement Spec 04: Test Verification
- [ ] Implement Spec 05: PR Creation
- [ ] Implement Spec 06: Orchestration Workflow
- [ ] Implement Spec 07: Web Dashboard

### Infrastructure Setup

- [ ] Create `packages/core` package
- [ ] Create `packages/agents` package
- [ ] Create `packages/integrations` package
- [ ] Create `packages/db` package
- [ ] Set up SQLite database schema
- [ ] Create `apps/worker` package

### GitHub Integration

- [ ] Set up GitHub App for webhook authentication
- [ ] Configure repository access and permissions
- [ ] Test webhook delivery to local development environment
- [ ] Implement GitHub API client with rate limiting

### AI/LLM Integration

- [ ] Choose LLM provider (OpenAI vs Anthropic vs Local)
- [ ] Set up API keys and configuration
- [ ] Create prompt templates for code generation
- [ ] Implement self-review mechanism
- [ ] Test code generation quality

---

## Low Priority / Future

### Multi-Agent Support

- [ ] Design multi-agent coordination system
- [ ] Implement planner agent (task breakdown)
- [ ] Implement reviewer agent (code review before PR)
- [ ] Add agent marketplace/template system

### Advanced Features

- [ ] Multi-repository support
- [ ] Automated PR comment iteration (agent responds to feedback)
- [ ] Analytics dashboard (agent performance, success rates)
- [ ] Cost optimization (token usage tracking, batching)

### Docker Sandbox

- [ ] Replace Cloudflare Workers sandbox with Docker containers
- [ ] Add multi-language support (Python, Rust, Go, etc.)
- [ ] Implement network isolation and security policies

---

## Completed

### 2026-01-11

- ✅ Created MVP roadmap (docs/specs/README.md)
- ✅ Created architecture overview (docs/architecture.md)
- ✅ Created detailed specs (01-07)
- ✅ Updated Spec 01 to include sync mode
- ✅ Updated architecture doc with sync workflow
- ✅ Created Spec 00: Database Setup (Effect-TS + Drizzle)
- ✅ Configured database package to use `@workspace/db`
- ✅ Updated dependencies to use `@effect/sql-sqlite-bun` (Bun runtime)
- ✅ Updated Spec 01 to use new database package
- ✅ Temporarily excluded markdown from `ec` checker
