# Sync Workflow

## Goal
Rebase the current branch onto `main` so dev stays current without merge conflicts.

---

## Steps

### 1. Check for uncommitted changes
```bash
git status
```
If there are uncommitted changes, stop and tell the user to commit or stash them first.

### 2. Fetch and rebase
```bash
git fetch origin main && git rebase origin/main
```

### 3. Push
Since rebase rewrites history, force push with lease (safe — only force pushes if no one else pushed):
```bash
git push --force-with-lease
```

### 4. Confirm
Report the current branch is up to date with main.
