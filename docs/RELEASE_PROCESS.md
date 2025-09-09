# Release Process

This document outlines the release process for the Lullabot Slackbot project.

## Versioning Strategy

We follow [Semantic Versioning](https://semver.org/) (SemVer):

- **MAJOR** version (X.0.0): Incompatible API changes or major architectural changes
- **MINOR** version (0.X.0): New functionality in a backwards compatible manner
- **PATCH** version (0.0.X): Backwards compatible bug fixes

## Release Schedule

- **Patch releases**: As needed for critical bug fixes
- **Minor releases**: When new features are ready (typically monthly)
- **Major releases**: Only when breaking changes are necessary

## Release Process

### 1. Pre-Release Checklist

Before creating a release, ensure:

- [ ] All tests pass: `npm test`
- [ ] Build completes without errors: `npm run build`
- [ ] Security audit passes: `npm audit --production`
- [ ] All PRs for the release are merged to `main`
- [ ] CHANGELOG.md is updated with all changes

### 2. Create Release

#### Using GitHub CLI (Recommended)

```bash
# Ensure you're on main branch and up to date
git checkout main
git pull origin main

# Determine version number (check CHANGELOG.md and previous tags)
VERSION="v1.0.0"  # Replace with actual version

# Create and push tag
git tag -a $VERSION -m "Release $VERSION"
git push origin $VERSION

# Extract relevant section from CHANGELOG.md for the current version
sed -n "/^## \[$VERSION\]/,/^## \[/p" CHANGELOG.md | sed '$d' > RELEASE_NOTES.md

# Create GitHub release with extracted changelog section
gh release create $VERSION \
  --title "Release $VERSION" \
  --notes-file RELEASE_NOTES.md \
  --target main

# Clean up temporary file
rm RELEASE_NOTES.md
```

#### Using GitHub Web Interface

1. Go to [Releases page](https://github.com/Lullabot/lullabot-slackbot/releases)
2. Click "Draft a new release"
3. Click "Choose a tag" and create new tag (e.g., `v1.0.0`)
4. Set release title: "Release v1.0.0"
5. Copy relevant section from CHANGELOG.md to release description
6. Click "Publish release"

### 3. Post-Release Tasks

After creating the release:

1. **Deploy to Production**
   - The Docker image will automatically build and deploy via the production workflow
   - Monitor the deployment in Slack to ensure the bot comes back online

2. **Verify Deployment**

   ```bash
   # Check bot status in Slack
   # Type in any channel: @bot uptime
   ```

3. **Announce Release**
   - Post in #general or #tech channel about the new release
   - Include highlights of new features or important fixes

## Changelog Management

### CHANGELOG.md Format

Follow the [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- New features that have been added

### Changed
- Changes in existing functionality

### Deprecated
- Features that will be removed in future versions

### Removed
- Features that have been removed

### Fixed
- Bug fixes

### Security
- Security vulnerability fixes

## [1.0.0] - 2025-01-09

### Added
- Initial tagged release
- Comprehensive plugin system
- Factoids, karma, help, and conversion plugins
```

### Updating the Changelog

1. During development, add changes under `[Unreleased]` section
2. When preparing a release:
   - Move `[Unreleased]` items to a new version section
   - Add the version number and date  
   - Keep `[Unreleased]` section for future changes
   - Update the `[Unreleased]` link at the bottom of CHANGELOG.md to compare from the new version tag (e.g., change `main...HEAD` to `v1.0.0...HEAD`)

## Hotfix Process

For critical production bugs:

1. Create hotfix branch from the latest tag:

   ```bash
   # Replace <latest-release-tag> with your current release (e.g., v1.0.0)
   git checkout -b hotfix/fix-description tags/<latest-release-tag>
   ```

2. Make the fix and test thoroughly

3. Create PR to main branch

4. After merge, create patch release:

   ```bash
   git tag -a v1.0.1 -m "Hotfix: Description of fix"
   git push origin v1.0.1
   gh release create v1.0.1 --title "Hotfix Release v1.0.1"
   ```

## Rollback Process

If a release causes issues in production:

1. **Immediate Rollback**

   ```bash
   # Check out the previous stable release tag
   git checkout tags/<previous-version>
   
   # Rebuild and deploy from that version
   docker-compose down
   docker-compose up -d --build
   
   # OR if using a container registry with tagged images:
   # docker-compose down
   # docker pull your-registry/lullabot-slackbot:<previous-version>
   # docker-compose up -d
   ```

2. **Git Revert** (if needed)

   ```bash
   # Create revert commit
   git revert <commit-hash>
   
   # Create new patch release
   git tag -a v1.0.2 -m "Revert: Rolling back to stable state"
   ```

## Release Notes Template

When creating release notes, use this template:

```markdown
## What's New

### ✨ Features
- Brief description of new features

### 🐛 Bug Fixes
- Brief description of fixes

### 🔧 Improvements
- Performance improvements
- Code refactoring
- Documentation updates

### ⚠️ Breaking Changes (if any)
- Description of breaking changes
- Migration instructions

### 📦 Dependencies
- Updated dependencies and versions

## Contributors
Thanks to all contributors who made this release possible!

## Full Changelog
See [CHANGELOG.md](CHANGELOG.md) for detailed changes.
```

## Automation Opportunities

Consider implementing these automations:

1. **Automated Changelog Generation**
   - Use conventional commits to auto-generate changelog
   - Tools: `standard-version` or `semantic-release`

2. **Automated Version Bumping**

   ```json
   {
     "scripts": {
       "release:patch": "npm version patch && git push --follow-tags",
       "release:minor": "npm version minor && git push --follow-tags",
       "release:major": "npm version major && git push --follow-tags"
     }
   }
   ```

3. **Release Workflow** (GitHub Actions)
   - Automatically create releases when tags are pushed
   - Run tests and build before allowing release
   - Auto-deploy to production on release

## Questions?

For questions about the release process, contact the maintainers or open an issue.
