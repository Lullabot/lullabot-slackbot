# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2025-01-09 (Initial Release)

### Added

- Core bot functionality with Slack Bolt framework
- Plugin architecture for modular feature development
- Factoids plugin for Q&A responses
- Karma tracking system (++ and --)
- Help system with dynamic documentation
- Temperature and unit conversion features
- Greeting detection and responses
- Uptime monitoring
- Bot snack interactions
- Pattern registry service for conflict detection
- Comprehensive test suite with Vitest
- Docker support for containerized deployment
- TypeScript for type safety
- GitHub Actions CI/CD pipeline
- Release process documentation (docs/RELEASE_PROCESS.md)
- Changelog file for tracking changes

### Fixed

- TypeScript build errors in conversions.test.ts by replacing Jest types with Vitest types

### Security

- Comprehensive security remediation and infrastructure improvements
- Migration from vulnerable dev dependencies to secure alternatives
- Implementation of security scanning workflows (TruffleHog, npm audit)
- Pre-commit hooks for security validation

### Infrastructure

- Socket mode for real-time Slack events
- JSON-based persistent storage per team
- Nodemon for development hot-reload
- ESLint and Prettier for code quality

[Unreleased]: https://github.com/Lullabot/lullabot-slackbot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Lullabot/lullabot-slackbot/releases/tag/v0.1.0
