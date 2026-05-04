Create a pull request against the main branch on origin. 

Steps:
1. Run `git status` and `git log main..HEAD` to understand what commits are on this branch.
2. Run `git push -u origin HEAD` to ensure the branch is pushed.
3. Use `gh pr create --base main --reviewer jmeegan2` with a clear title (under 70 chars) and a body that summarizes what was built and why. Use a HEREDOC to pass the body. Format:

```
gh pr create --base main --reviewer jmeegan2 --title "..." --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- ...

🤖 Generated with Claude Code
EOF
)"
```

4. Return the PR URL when done.
