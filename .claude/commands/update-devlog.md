# Update DEVLOG Workflow

## Goal

Append a new chronological entry to `DEVLOG.md` for the current session's work.

---

## Steps

### 1. Get the timestamp

```bash
TZ="America/New_York" date "+%m-%d-%Y: %I:%M %p"
```

Use that exact output as the section header. **Always append to the bottom of the file** — never insert above existing entries.

### 2. Write the entry

Add a new section at the end of `DEVLOG.md`:

```markdown
## <timestamp>

### What was built

- ...

### Decisions made

- **Decision** — reason

### Project structure changes (if any)
```

path/
└── file # description

```

```

Only include "Project structure changes" if files were added, removed, or moved.
