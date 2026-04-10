# prajwolbikramadhikari.com.np

[![DevSecOps CI/CD](https://github.com/nasdesps/portfolio/actions/workflows/devsecops-pipeline.yml/badge.svg)](https://github.com/nasdesps/portfolio/actions/workflows/devsecops-pipeline.yml)
[![Lighthouse Performance](https://img.shields.io/badge/Lighthouse-90%2B-39d353?logo=lighthouse&logoColor=white)](https://github.com/nasdesps/portfolio/actions/workflows/deploy.yml)

Personal portfolio and technical blog built with Hugo. Every commit passes a multi-stage DevSecOps pipeline before reaching production — no manual deploys, no stored credentials.

**Live site:** [prajwolbikramadhikari.com.np](https://prajwolbikramadhikari.com.np)
**Live Infrastructure Dashboard:** [prajwolbikramadhikari.com.np/lab](https://prajwolbikramadhikari.com.np/lab)
**Architecture diagram:** [prajwolbikramadhikari.com.np/architecture](https://prajwolbikramadhikari.com.np/architecture)

---

## CI/CD Pipeline

Five-stage GitHub Actions pipeline with parallel security gates. Nothing reaches production without passing all checks.

```
git push
    │
    ├── Gitleaks (secret scanning — full git history)
    ├── CodeQL (SAST — JavaScript vulnerability analysis)  } parallel
    └── Dependency Review (CVE scanning — fail on high)
            │
            ▼
        Hugo Build (Docker, pinned version, --user flag)
            │
            ▼
        Lighthouse Audit (performance ≥ 90, a11y ≥ 90)
            │
            ▼
        Deploy → GitHub Pages (OIDC — no stored tokens)
```

### Pipeline design decisions

**Parallel security gates** — Gitleaks, CodeQL, and dependency review run simultaneously. The build waits for all three. Sequential scanning wastes pipeline time; these checks don't depend on each other.

**`fetch-depth: 0` on Gitleaks** — scans the full git history, not just the latest commit. A secret committed months ago is still a secret.

**`--user $(id -u):$(id -g)` in Docker build** — runs Hugo as the current runner user, not root. Prevents permission errors on the output directory for downstream steps.

**Dual artifact upload** — `upload-artifact` (uncompressed, for Lighthouse) and `upload-pages-artifact` (compressed tarball, for GitHub Pages deploy) are separate steps. The Pages deployer requires its own artifact format.

**File pruning before Lighthouse** — Google Search Console verification files and custom 404 pages are removed before the audit. They're not real content pages and would produce false audit failures.

**OIDC authentication** — `id-token: write` permission enables short-lived cryptographic tokens for deployment. No long-lived API tokens stored in repository secrets.

**Job-scoped permissions** — `security-events: write` is scoped only to the CodeQL job, not granted globally. Principle of least privilege in the pipeline itself.

---

## Stack

| Layer                 | Technology                                  |
| --------------------- | ------------------------------------------- |
| Static site generator | Hugo Extended 0.120.4                       |
| Theme                 | PaperMod (submodule)                        |
| Build environment     | Docker (`floryn90/hugo:0.120.4-ext-alpine`) |
| CI/CD                 | GitHub Actions                              |
| Secret scanning       | Gitleaks                                    |
| SAST                  | GitHub CodeQL                               |
| Dependency scanning   | GitHub Dependency Review                    |
| Performance auditing  | Lighthouse CI                               |
| DNS + CDN             | Cloudflare (proxied)                        |
| Hosting               | GitHub Pages                                |
| Deploy auth           | OIDC (no stored tokens)                     |

---

## Local Development

```bash
# Clone with theme submodule
git clone --recurse-submodules https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Run Hugo dev server (requires Hugo Extended)
hugo server -D

# Or run via Docker (matches CI environment exactly)
docker run --rm \
  --user $(id -u):$(id -g) \
  -v $(pwd):/src \
  -w /src \
  -p 1313:1313 \
  floryn90/hugo:0.120.4-ext-alpine \
  server --bind 0.0.0.0 -D
```

Site available at `http://localhost:1313`

---

## Content Structure

```
content/
├── blog/          # Technical blog posts
├── projects/      # Project writeups and homelab series
├── experience/    # Work history
└── education/     # Academic background
```

New project posts go in `content/projects/` as individual `.md` files following the existing frontmatter structure.

---

## Lighthouse Thresholds

Enforced on every push. Pipeline fails if any `error`-level threshold is missed.

| Category       | Threshold | Level |
| -------------- | --------- | ----- |
| Performance    | ≥ 90      | error |
| Accessibility  | ≥ 90      | error |
| Best Practices | ≥ 90      | warn  |
| SEO            | ≥ 90      | warn  |

Full config: [`.lighthouserc.json`](.lighthouserc.json)

---

## Related

- [Hybrid Cloud Engineering Series](https://prajwolbikramadhikari.com.np/projects/) — writeups for everything built in this pipeline and the broader homelab infrastructure
- [homelab-iac](https://github.com/nasdesps/homelab-iac) — Terraform managing the Cloudflare DNS and Oracle Cloud infrastructure behind this site

---

_Prajwol Bikram Adhikari · [prajwolbikramadhikari.com.np](https://prajwolbikramadhikari.com.np) · [LinkedIn](https://linkedin.com/in/pbadk/)_
