# PR Workflow

## Goal
Create a pull request against `main` on origin. DEVLOG.md is updated and committed **before** the PR is created so it's included.

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

### 2. Update DEVLOG.md
Run `/update-devlog` — it handles the timestamp and entry format.

### 3. Commit and push
Run `/commit` — this stages relevant files (including the DEVLOG update), commits, and pushes to the current branch.

### 4. Run an AI review
Run `/review` on the branch changes. Use only the **key findings** section or a short bullet summary — do not paste a full breakdown. Embed the condensed output in the PR body.

### 5. Create the PR
Use this exact format, inserting the `/review` output under `## AI Review`:
```bash
gh pr create --base main --reviewer jmeegan2 --title "..." --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- ...

## AI Review
<insert /review output here>

🤖 Generated with Claude Code
EOF
)"
```
- Title must be under 70 characters
- Summary: what was built and why
- Test plan: bulleted checklist of what to verify

### 6. Return the PR URL
