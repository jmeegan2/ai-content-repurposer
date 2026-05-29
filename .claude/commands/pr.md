# PR Workflow

## Goal
Create a pull request against `main` on origin.

---

## Steps

### 0. Branch safety check
```bash
git branch --show-current
```
If the output is `main`, **STOP immediately**. Tell the user: "You're on main — switch to a feature branch before running /pr." Do not proceed past this point.

### 1. Understand the branch
Run these in parallel:
- `git status` — see uncommitted changes
- `git log main..HEAD` — see commits on this branch vs main

### 2. Commit and push
Run `/commit` — this stages and commits any uncommitted changes, then pushes to the current branch.

### 3. Create the PR
Use this exact format:
```bash
gh pr create --base main --reviewer jmeegan2 --title "..." --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- ...

🤖 Generated with Claude Code
EOF
)"
```
- Title must be under 70 characters
- Summary: what was built and why
- Test plan: bulleted checklist of what to verify

### 4. Return the PR URL
