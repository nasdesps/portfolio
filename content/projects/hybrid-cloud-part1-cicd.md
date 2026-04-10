---
title: "Part 1: Building a Security-Gated CI/CD Pipeline with GitHub Actions"
date: 2026-04-10
dateString: April 2026
description: "Learn how to build a professional, multi-stage DevSecOps pipeline for your portfolio site using GitHub Actions. This guide covers parallel security gates with Gitleaks and CodeQL, containerized Hugo builds, Lighthouse performance audits, and secretless OIDC deployments — no stored tokens."
draft: false
author: " | Prajwol Bikram Adikari"
tags:
  - DevOps
  - DevSecOps
  - GitHubActions
  - CICD
  - Gitleaks
  - CodeQL
  - Lighthouse
  - Docker
  - OIDC
  - Security
  - Automation
  - GitHub
  - Homelab
weight: 101
cover:
  image: "/projects/hybrid-cloud-part1/hybrid-cloud-part1.png"
  alt: 'GitHub Actions workflow showing all five pipeline stages with green checkmarks — Gitleaks, CodeQL, Build Hugo, Lighthouse Audit, and Deploy to GitHub Pages.'
---

### Introduction

If you have followed along with the homelab series, you have seen me build a Debian server from scratch, lock it down with Zero Trust tunnels, and set up high-availability DNS across two continents. The infrastructure side has been a lot of fun to learn.

But there was something that had been nagging me. Every time I pushed code to this portfolio, it deployed automatically with zero checks. No secret scanning, no security analysis, no performance gates. One bad push and the site could break — or worse, I could accidentally leak a token and not even know it.

As I have been working toward a DevOps engineering role, CI/CD pipelines have been one of those topics I kept reading about but had not actually built from scratch myself. I am the kind of person who learns best by doing — reading documentation only gets me so far. I wanted to actually build something real, something I could showcase, and something that would teach me the tools that professional engineering teams use every day.

So that is what this post is about. Building a proper **multi-stage, security-gated CI/CD pipeline** using GitHub Actions — not because a tutorial told me to, but because I wanted to understand how it actually works.

Fair warning: it did not all go smoothly. There were failed runs, confusing errors, and at least one moment where I had no idea why the build was failing. I will walk you through all of it.

---

### What is CI/CD and why does it matter?

Before I built this, I had a loose understanding of CI/CD. "Code goes in, site comes out automatically." That is technically true but it misses the point.

- **CI (Continuous Integration)** means every push automatically triggers a set of checks — security scans, builds, audits. Every single push. Not once a week before a release.
- **CD (Continuous Deployment)** means if all those checks pass, your code goes to production automatically. No human clicking deploy.

The real value is not the automation itself — it is the _gates_. Without CI/CD, you are trusting yourself to manually check everything every time. That works until it does not. The day you are tired, rushing, or just distracted, something slips through.

**DevSecOps** takes this a step further by making security part of the pipeline itself. Security checks run on every push, blocking anything that does not meet the standard. Given that I am working in a regulated pharmaceutical environment at AbbVie where GxP compliance is part of daily life, this mindset clicked for me immediately. You do not check compliance once a quarter. You build it into the process.

---

### Chapter 1: The Pipeline Architecture

Before I wrote a single line of YAML, I spent time thinking about how the jobs should depend on each other. This turned out to be one of the most valuable parts of the whole exercise.

Here is the structure I landed on:

```
git push to master
        │
        ├── Gitleaks      (secret scanning)       ┐
        ├── CodeQL        (SAST analysis)         ├── parallel
        └── Dep Review    (CVE scanning)          ┘
                │  all three must pass
                ▼
        ┌─────────────────────────────┐
        │   Containerized Hugo build  │
        │   Docker · pinned version   │
        └─────────────────────────────┘
                │
                ▼
        ┌─────────────────────────────┐
        │   Lighthouse audit          │
        │   Performance ≥ 90          │
        │   Accessibility ≥ 90        │
        └─────────────────────────────┘
                │
                ▼
        ┌─────────────────────────────┐
        │   Deploy to GitHub Pages    │
        │   OIDC · no stored tokens   │
        └─────────────────────────────┘
```

The key decision is running the three security gates **in parallel**, not one after another. Gitleaks, CodeQL, and dependency review do not depend on each other — there is no reason to wait for Gitleaks to finish before starting CodeQL. Running them simultaneously means the whole security check phase takes as long as the slowest single scan, not the sum of all three.

The build only starts once all three pass. If any one of them fails, the whole pipeline stops there.

---

### Chapter 2: Security Gate 1 — Gitleaks Secret Scanning

Gitleaks scans your repository for accidentally committed secrets — API keys, tokens, passwords, private keys. This was one of those tools I had heard about but never actually used. Setting it up was straightforward. Understanding why one specific line matters took me longer.

```yaml
secret-scan:
  name: Gitleaks
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: gitleaks/gitleaks-action@v2
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

That `fetch-depth: 0` line is the important one. Without it, GitHub only checks out your latest commit. But git history keeps everything — if you committed a Cloudflare token six months ago and deleted it in the next commit, that token is still visible to anyone who clones your repo with `git log`. The `fetch-depth: 0` tells Gitleaks to scan the entire history, not just the tip.

A scanner that only sees the latest commit is security theater. The full history scan is what makes it real.

If you have test files or documentation with example tokens that look like real secrets, add a `.gitleaks.toml` to your repo root to suppress false positives:

```toml
[allowlist]
description = "Known false positives"
regexes = [
  '''EXAMPLE_API_KEY''',
  '''test-token-placeholder'''
]
paths = [
  '''testdata/'''
]
```

---

### Chapter 3: Security Gate 2 — CodeQL Static Analysis

CodeQL is GitHub's free SAST tool — Static Application Security Testing. Instead of looking for secrets, it reads your actual code and looks for patterns that could be exploited: XSS vulnerabilities, injection risks, insecure patterns in JavaScript.

```yaml
codeql:
  name: CodeQL
  runs-on: ubuntu-latest
  permissions:
    security-events: write
    contents: read
  steps:
    - uses: actions/checkout@v4
    - uses: github/codeql-action/init@v3
      with:
        languages: javascript
    - uses: github/codeql-action/autobuild@v3
    - uses: github/codeql-action/analyze@v3
```

One thing worth noticing: `security-events: write` is declared at the **job level**, not globally. This is the principle of least privilege — each job only gets the permissions it actually needs. The global permissions block deliberately does not include this. Only CodeQL needs to write security events, so only CodeQL gets that permission.

Results appear in your repository's **Security → Code scanning alerts** tab. For a static Hugo portfolio, CodeQL will likely find nothing — which is the expected and correct result. The habit and the architecture are what matter.

---

### Chapter 4: Security Gate 3 — Dependency Review

The dependency review action checks your packages against the GitHub Advisory Database on every pull request. If any dependency has a known CVE at `high` severity or above, the pipeline fails.

```yaml
dependency-review:
  name: Dependency Review
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/dependency-review-action@v4
      with:
        fail-on-severity: high
```

The `if: github.event_name == 'pull_request'` condition is here because this action requires a base and head ref to compare — it's designed specifically for pull requests. On a direct push to master there's no base to compare against, so it would fail with a confusing error.

The correct engineering response is not to remove the job — it is to scope it to the right trigger. It runs on PRs, skips silently on direct pushes.

Because it can be skipped, the build job needs a special condition to prevent a cascade where a skipped job causes everything downstream to skip too:

```yaml
build:
  needs: [secret-scan, codeql, dependency-review]
  if: ${{ !failure() && !cancelled() }}
```

This tells the build: proceed as long as nothing actually failed or was cancelled. Skipped does not count as failed.

---

### Chapter 5: The Containerized Build — And Where I Got Stuck

This is the stage where things got interesting. And by interesting, I mean frustrating for a while.

```yaml
- name: Build with Docker
  run: |
    docker run --rm \
      --user $(id -u):$(id -g) \
      -v ${{ github.workspace }}:/src \
      -w /src \
      floryn90/hugo:0.120.4-ext-alpine \
      --minify --gc
```

The first few runs of the pipeline kept failing at the build stage. The error was not obvious — it was a permissions issue. Hugo was running as root inside the Docker container, writing the `public/` directory with root ownership. The next pipeline step could not read those files.

The fix is the `--user $(id -u):$(id -g)` flag. This tells Docker to run the Hugo process as the current runner user instead of root, which means the output files are owned by the right user and everything downstream can read them cleanly.

It is not something you would find in a basic Docker tutorial. You find it by having the pipeline break and digging into why.

The other decision worth explaining: `floryn90/hugo:0.120.4-ext-alpine` with a pinned version, not `latest`. GitHub's runners update their tool versions regularly. If Hugo releases a breaking change and the runner silently upgrades, your build breaks with no obvious reason. Pinning to `0.120.4` means that exact version runs every time, regardless of what the runner has.

After the build, two separate artifacts get uploaded:

```yaml
# Uncompressed HTML for Lighthouse to audit
- name: Upload artifact for Lighthouse
  uses: actions/upload-artifact@v4
  with:
    name: public-site
    path: public/

# Compressed tarball for GitHub Pages deploy
- name: Upload artifact for Pages
  uses: actions/upload-pages-artifact@v3
  with:
    path: public/
```

These are different formats. `actions/deploy-pages` requires its own specific artifact format from `upload-pages-artifact`. You cannot reuse the same artifact for both — something I discovered when the deploy step failed because it could not find the right artifact format.

---

### Chapter 6: The Lighthouse Audit

Before anything reaches production, Lighthouse audits the built site against enforced thresholds. If scores drop below the minimums, the deploy is blocked.

```yaml
lighthouse:
  name: Lighthouse Audit
  runs-on: ubuntu-latest
  needs: [build]
  steps:
    - uses: actions/checkout@v4
    - name: Download artifact
      uses: actions/download-artifact@v4
      with:
        name: public-site
        path: public/

    # SRE fix: remove non-content files before audit
    - name: Prune non-content files from audit
      run: rm -f public/google*.html public/404.html

    - name: Serve & audit
      uses: treosh/lighthouse-ci-action@v11
      with:
        uploadArtifacts: true
        temporaryPublicStorage: true
        configPath: .lighthouserc.json
```

The file pruning step was another real discovery. Google Search Console verification files and custom 404 pages were causing Lighthouse to audit them as content pages and fail on them. They are not real content — removing them before the audit prevents false failures on files I do not control. It is a small fix that took some head-scratching to figure out.

The `.lighthouserc.json` configuration:

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./public",
      "numberOfRuns": 2
    },
    "upload": {
      "target": "temporary-public-storage"
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }]
      }
    }
  }
}
```

Running twice and averaging reduces the chance of a single slow network moment on GitHub's shared runners falsely blocking a legitimate deploy. Performance and accessibility are hard errors — below 90 blocks the deploy. Best practices and SEO are warnings — tracked but not blocking.

---

### Chapter 7: Secretless Deployment with OIDC

The deploy stage was the one I was most curious about going in. Most tutorials tell you to generate an API token, store it in GitHub Secrets, and use it on every deploy. That works, but it means there is a long-lived credential sitting in your secrets that stays valid until you manually rotate it.

OIDC is different. Instead of a stored token, GitHub Actions generates a short-lived cryptographic proof of identity at runtime. It proves who it is, completes the deploy, and the token expires minutes later. There is nothing to store, nothing to rotate, and nothing to leak.

```yaml
deploy:
  name: Deploy to GitHub Pages
  runs-on: ubuntu-latest
  needs: [build, lighthouse]
  environment:
    name: github-pages
    url: ${{ steps.deployment.outputs.page_url }}
  steps:
    - name: Deploy to GitHub Pages
      id: deployment
      uses: actions/deploy-pages@v4
```

The OIDC capability comes from the global permissions block:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write # enables OIDC
```

That `id-token: write` line is what enables the handshake. Without it, GitHub Actions cannot request the short-lived identity token and the deploy fails.

---

### Chapter 8: The Moment It All Worked

I am not going to pretend the first run was clean. There were multiple failed runs — the permissions error on the Docker build, the artifact format mismatch, the Lighthouse false failures on the verification files. Each one took some digging to understand and fix.

But when I finally pushed a commit and watched all five jobs turn green in the GitHub Actions tab — Gitleaks, CodeQL, Build Hugo, Lighthouse Audit, Deploy to GitHub Pages, all green — it felt genuinely good. Not just because it worked, but because I actually understood _why_ each piece was there and what it was doing.

What surprised me most was how well everything worked together once it was wired up correctly. GitHub Actions triggering the pipeline, GitHub Pages serving the site, Cloudflare picking it up for DNS and CDN — the whole chain from `git push` to live site update was faster and more seamless than I expected. The integration between these tools is genuinely impressive.

---

### Branch Protection — Locking It In

The pipeline means nothing if you can bypass it by pushing directly to `master` without any checks running. In your GitHub repository go to **Settings → Branches → Add branch protection rule** for `master`:

- ✅ Require status checks to pass before merging
  - Add: `Gitleaks`, `CodeQL`, `Build Hugo`, `Lighthouse Audit`
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

Now the pipeline is the only path to production. Not even the repo owner can push directly to master and skip it.

---

### The Complete Workflow File

The full `.github/workflows/deploy.yml`:

```yaml
name: DevSecOps CI/CD Pipeline

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  secret-scan:
    name: Gitleaks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  codeql:
    name: CodeQL
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3

  dependency-review:
    name: Dependency Review
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high

  build:
    name: Build Hugo
    runs-on: ubuntu-latest
    needs: [secret-scan, codeql, dependency-review]
    if: ${{ !failure() && !cancelled() }}
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
      - name: Build with Docker
        run: |
          docker run --rm \
            --user $(id -u):$(id -g) \
            -v ${{ github.workspace }}:/src \
            -w /src \
            floryn90/hugo:0.120.4-ext-alpine \
            --minify --gc
      - name: Upload artifact for Lighthouse
        uses: actions/upload-artifact@v4
        with:
          name: public-site
          path: public/
      - name: Upload artifact for Pages
        uses: actions/upload-pages-artifact@v3
        with:
          path: public/

  lighthouse:
    name: Lighthouse Audit
    runs-on: ubuntu-latest
    needs: [build]
    steps:
      - uses: actions/checkout@v4
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: public-site
          path: public/
      - name: Prune non-content files from audit
        run: rm -f public/google*.html public/404.html
      - name: Serve & audit
        uses: treosh/lighthouse-ci-action@v11
        with:
          uploadArtifacts: true
          temporaryPublicStorage: true
          configPath: .lighthouserc.json

  deploy:
    name: Deploy to GitHub Pages
    runs-on: ubuntu-latest
    needs: [build, lighthouse]
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

### What I Took Away From This

Building this taught me that CI/CD pipelines are not magic — they are just a series of jobs with dependencies between them, each one doing one specific thing. Once you understand the dependency graph, the YAML almost writes itself.

The parts that actually taught me the most were not the parts that worked. They were the failed runs — figuring out why the Docker build was writing files as root, why Lighthouse was failing on a Google verification file, why the artifact format mattered. Those failures forced me to actually understand what was happening rather than just accepting that it worked.

Tools like GitHub Actions, Gitleaks, CodeQL, and Lighthouse are not intimidating once you have broken them and fixed them yourself. That is the thing about learning by building — the failures are the lesson.

---

### What is Next?

In **Part 2** of this series, we will bring the infrastructure itself under version control. All 12 Cloudflare DNS records, the Zero Trust tunnel configuration, and the Oracle Cloud instance — managed by Terraform, with state stored in AWS S3, and changes deployed through the same pipeline we built here.

The same discipline applied to code delivery, applied to the servers themselves.

Stay tuned, and happy building!

---

### Appendix: The `.lighthouserc.json`

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./public",
      "numberOfRuns": 2
    },
    "upload": {
      "target": "temporary-public-storage"
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.9 }]
      }
    }
  }
}
```
