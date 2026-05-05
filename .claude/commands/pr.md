# PR Workflow

## Goal
Create a pull request against `main` on origin. DEVLOG.md is updated and committed **before** the push so it's included in the PR.

---

## Steps

### 1. Understand the branch
Run these in parallel:
- `git status` — see uncommitted changes
- `git log main..HEAD` — see commits on this branch vs main

### 2. Update DEVLOG.md
Run `/update-devlog` — it handles the timestamp, entry format, and commit.

### 3. Run an AI review
Run `/review` on the branch changes. Use only the **key findings** section or a short bullet summary — do not paste a full breakdown. Embed the condensed output in the PR body.

### 4. Push the branch
```bash
git push -u origin HEAD
```

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
