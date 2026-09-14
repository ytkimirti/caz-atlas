# Git workflow

- Make repository changes in a worktree under `<project-root>/.claude/worktrees/<name>`.
- Once the changes are complete and relevant checks pass, commit with a short message and merge into `main` without asking for confirmation. If the task targets another branch, merge into that branch instead. Complete the merge before handing the work back to the user.
- Pushes, PRs, issues, and external comments still require an explicit user request.
