# GitHub Actions Workflows

## Smoke Tests Workflows

### 1. `smoke-tests.yml` - Main Smoke Tests

**Triggers:**
- Push to `main` branch
- Pull requests to `main`
- Scheduled (every 6 hours)
- Manual dispatch

**Jobs:**
- **Production Tests**: Tests against live production environment (copypal.online)
- **Docker Tests**: Builds and tests Docker containers locally

**Usage:**
```bash
# Manual trigger via GitHub CLI
gh workflow run smoke-tests.yml
```

### 2. `smoke-tests-manual.yml` - Manual Smoke Tests

**Triggers:**
- Manual dispatch only

**Inputs:**
- `api_base`: API Base URL (default: https://copypal.online/api)
- `frontend_url`: Frontend URL (default: https://copypal.online)
- `test_suite`: Which tests to run (all/backend/frontend/integration)

**Usage:**
```bash
# Run all tests on production
gh workflow run smoke-tests-manual.yml

# Run only backend tests on custom environment
gh workflow run smoke-tests-manual.yml \
  -f api_base=https://staging.example.com/api \
  -f frontend_url=https://staging.example.com \
  -f test_suite=backend
```

### 3. `smoke-tests-pr.yml` - Pull Request Tests

**Triggers:**
- Pull request opened/updated
- Only when backend/frontend/docker-compose changes

**Jobs:**
- Builds Docker images from scratch
- Runs smoke tests on built containers
- Comments test results on PR
- Shows detailed logs on failure

**Features:**
- No-cache builds to ensure fresh test environment
- Automatic PR comments with test results
- Detailed summary in GitHub Actions UI

## Workflow Features

### Caching
- Bun installation cached automatically
- Docker layers cached between runs

### Artifacts
- Test results uploaded as artifacts
- Available for 90 days after run

### Notifications
- Failed runs trigger notification job
- PR comments show test status

### Timeouts
- Production tests: 10 minutes
- Docker tests: 20 minutes
- PR tests: 20 minutes

## Test Matrix

| Workflow | Production | Docker | PR Build |
|----------|-----------|--------|----------|
| smoke-tests.yml | ✅ | ✅ | ❌ |
| smoke-tests-manual.yml | ✅ | ❌ | ❌ |
| smoke-tests-pr.yml | ❌ | ❌ | ✅ |

## Monitoring

View workflow runs:
```bash
# List recent runs
gh run list --workflow=smoke-tests.yml

# View specific run
gh run view <run-id>

# Watch live run
gh run watch
```

## Troubleshooting

### Tests failing on Docker
1. Check service logs in workflow output
2. Verify .env configuration
3. Check for port conflicts

### Tests failing on Production
1. Verify production services are running
2. Check network connectivity
3. Review GlitchTip for backend errors

### Workflow not triggering
1. Check workflow file syntax: `gh workflow view smoke-tests.yml`
2. Verify branch protection rules
3. Check repository permissions
