You are running the project commit workflow. Follow these steps in order:

1. Run `git status` and `git diff` to understand all staged and unstaged changes.
2. Stage only the relevant files (never .env or files with secrets).
3. Write a concise commit message: one short subject line describing _what changed and why_. Use the  
   HEREDOC format.
4. Create the commit, then push to the current branch.
5. Check if there is an open PR on this branch (`gh pr list --head <branch>`). If one exists, ask the user:
   "Do you want to update the DEVLOG for this commit?"
