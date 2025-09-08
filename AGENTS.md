# Agent Guidelines

## Commenting on GitHub Issues

When the agent needs to post analysis or comments to a GitHub issue, it should use the GitHub CLI (`gh`) with a multiline heredoc, for example:

```bash
gh issue comment <issue-number> --body "$(cat << 'EOF'
Your comment goes here...
EOF
)"
```

The agent must request and receive explicit user approval before running this command.
