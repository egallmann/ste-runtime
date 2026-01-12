# Dual-Repo Workflow Guide

## Strategy Overview

You have two repositories with different purposes:

1. **`ste-runtime` (public)** — Stable releases, showcasing, public documentation
2. **`ste-runtime-private` (private)** — Active development, experimental features, work-in-progress

This allows you to:
- Develop privately without exposing incomplete work
- Release stable versions publicly when ready
- Maintain a clean public history while working messily in private
- Keep sensitive experiments/prototypes private indefinitely

---

## Initial Setup (One-Time)

### 1. Rename GitHub Repository

On GitHub:
1. Go to https://github.com/egallmann/ste-runtime/settings
2. Scroll to "Repository name"
3. Change to: `ste-runtime-private`
4. Click "Rename"

GitHub automatically redirects old URLs, but we'll update local config to be explicit.

### 2. Update Local Remote

```bash
cd /path/to/ste-runtime
git remote set-url origin https://github.com/egallmann/ste-runtime-private.git
git remote -v  # Verify
```

Output should show:
```
origin  https://github.com/egallmann/ste-runtime-private.git (fetch)
origin  https://github.com/egallmann/ste-runtime-private.git (push)
```

### 3. Create New Public Repository

On GitHub:
1. Go to https://github.com/new
2. Repository name: `ste-runtime`
3. Visibility: **Public**
4. Do NOT initialize with README/license/gitignore
5. Click "Create repository"

### 4. Add Public Repo as Remote

```bash
git remote add public https://github.com/egallmann/ste-runtime.git
git remote -v  # Should now show both 'origin' and 'public'
```

### 5. Initial Push to Public

```bash
# Push your current develop branch to the public repo
git push public develop:main

# Or if you want develop branch on public too:
git push public develop

# Or push main if that's your stable branch:
git push public main
```

---

## Daily Workflow

### Development (Private Repository)

```bash
# Normal development work
git checkout develop
# ... make changes ...
git add .
git commit -m "Add experimental feature X"
git push origin develop  # → Goes to ste-runtime-private
```

**This stays private.** Your WIP commits, experiments, and private features never leave `ste-runtime-private`.

### Release to Public

When a feature/version is ready for public release:

```bash
# 1. Ensure your develop/main branch is clean and tested
git checkout develop
npm test  # Make sure everything passes

# 2. Update version in package.json (if releasing a new version)
# Edit package.json, then commit:
git add ste-runtime/package.json
git commit -m "Bump version to 1.1.0"
git push origin develop

# 3. Push to public repository
git push public develop:main  # Push develop → public main
# OR
git push public develop  # Push develop → public develop
# OR
git push public main  # If you use main for releases

# 4. Tag the release (optional but recommended)
git tag v1.1.0
git push public v1.1.0
```

**What gets published:**
- All commits from the branch you push
- All files tracked in git (respecting .gitignore)

**What stays private:**
- Commits/branches you don't push
- Anything in private-only branches
- Work-in-progress features

---

## Advanced: Selective Syncing

### Cherry-Pick Specific Commits

If you want to publish only specific commits (not the full branch):

```bash
# Create a public-release branch
git checkout -b public-release origin/main  # Start from current public state

# Cherry-pick specific commits from develop
git cherry-pick <commit-hash-1>
git cherry-pick <commit-hash-2>

# Push to public
git push public public-release:main
```

### Merge Specific Features

```bash
# Create a clean branch for public release
git checkout -b feature-for-public develop

# Remove or clean up anything you don't want public
# ... make edits ...

# Commit and push
git commit -am "Clean version of feature X for public release"
git push public feature-for-public:main
```

---

## Git Submodule Workflow

Since your private project will use `ste-runtime` as a submodule:

### In Your Private Project

```bash
cd /path/to/my-private-project

# Add the PUBLIC ste-runtime as a submodule
git submodule add https://github.com/egallmann/ste-runtime.git ste-runtime

# This pulls from the public repo
# You get stable, released versions
```

### Updating the Submodule

When you push new versions to public:

```bash
# In your private project
cd ste-runtime
git pull origin main  # Pull latest from public repo

cd ..  # Back to private project root
git add ste-runtime
git commit -m "Update ste-runtime submodule to v1.1.0"
git push
```

### Development in Both Repos

**Option A: Develop in ste-runtime-private, release to ste-runtime public, pull into your project**

```bash
# 1. Work in ste-runtime-private
cd /path/to/ste-runtime
# ... develop features ...
git push origin develop

# 2. When stable, push to public
git push public develop:main

# 3. Update submodule in private project
cd /path/to/my-private-project/ste-runtime
git pull origin main
cd ..
git add ste-runtime
git commit -m "Update ste-runtime"
```

**Option B: Develop directly in the submodule (for quick fixes)**

```bash
# In your private project's ste-runtime submodule
cd /path/to/my-private-project/ste-runtime

# Make changes
# ... edit files ...

# Commit locally
git add .
git commit -m "Fix bug X"

# Push to PUBLIC repo (since submodule points to public)
git push origin main

# Or push to private repo instead:
git remote add private https://github.com/egallmann/ste-runtime-private.git
git push private develop
```

---

## Best Practices

### 1. Branch Strategy

**Private repo (`ste-runtime-private`):**
- `develop` — Active development (bleeding edge)
- `feature/*` — Experimental features
- `main` — Stable releases (synced with public)

**Public repo (`ste-runtime`):**
- `main` — Stable releases only
- Optional: `develop` for "next" version preview

### 2. Commit Hygiene

**Private commits can be messy:**
```bash
git commit -m "WIP: trying something"
git commit -m "debugging"
git commit -m "fix typo"
```

**Public commits should be clean:**
```bash
# Before pushing to public, squash/rebase if needed
git rebase -i HEAD~5  # Clean up last 5 commits
git push public develop:main
```

### 3. Secrets and Sensitive Data

**Never commit to private repo:**
- Production credentials
- API keys
- Internal infrastructure references

Even in private repos, avoid hardcoding secrets. Use environment variables and `.env` files (gitignored).

### 4. Documentation

**Private repo:**
- Can have internal notes, TODOs, architecture explorations

**Public repo:**
- Only polished, user-facing documentation

### 5. Versioning

**Use semantic versioning:**
- `1.0.0` — Stable public release
- `1.1.0` — New features
- `1.1.1` — Bug fixes
- `2.0.0` — Breaking changes

Update `package.json` version before each public release.

---

## Quick Reference

```bash
# Check current remotes
git remote -v

# Normal private development
git push origin develop  # → ste-runtime-private

# Push to public repo
git push public main  # → ste-runtime (public)

# Push specific branch to public
git push public develop:main  # develop → public main

# Tag a release
git tag v1.1.0
git push public v1.1.0

# Pull public changes back to private
git fetch public
git merge public/main
```

---

## Prompt for Cursor (Other Project)

When working in your other Cursor project that uses `ste-runtime` as a submodule:

```
I'm using ste-runtime as a git submodule in this project.
- The submodule is located at: ste-runtime/
- It points to the public repo: https://github.com/egallmann/ste-runtime.git
- I develop ste-runtime separately in a separate repository
- That repo has two remotes:
  - origin: ste-runtime-private (my development repo)
  - public: ste-runtime (public releases)

When I need to:
1. Use ste-runtime → Use the submodule as-is
2. Update ste-runtime → cd ste-runtime && git pull origin main
3. Develop ste-runtime → Switch to my development repository
4. Release updates → Push from private to public, then update submodule

Please respect this workflow and don't modify the submodule directly unless it's a small fix I want to push to public immediately.
```

---

## Summary

| Action | Command | Goes To |
|--------|---------|---------|
| Normal development | `git push origin develop` | Private repo |
| Public release | `git push public main` | Public repo |
| Update submodule | `cd submodule && git pull origin main` | Pull from public |
| Check remotes | `git remote -v` | Show all remotes |

**Your workflow is:** Develop in private → Test thoroughly → Push stable code to public → Update submodules

This gives you **full control** over what becomes public while maintaining **clean separation** between development and releases.



