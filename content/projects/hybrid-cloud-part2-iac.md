---
title: "Part 2: Infrastructure as Code with Terraform, OIDC, and a GitOps Pipeline"
date: 2026-05-08
dateString: May 2026
description: "How I brought my hybrid cloud homelab under Terraform management — 13 Cloudflare DNS records, an Oracle Cloud instance, remote state in AWS S3, and a GitHub Actions pipeline with secretless OIDC authentication. No more clicking around in dashboards."
draft: false
author: " | Prajwol Bikram Adikari"
tags:
  - DevOps
  - Terraform
  - IaC
  - AWS
  - OracleCloud
  - Cloudflare
  - GitHubActions
  - OIDC
  - GitOps
  - Security
  - Automation
  - Homelab
weight: 101
project_series: "Hybrid Cloud"
cover:
  image: "/projects/hybrid-cloud-part2/hybrid-cloud-part2.webp"
  alt: "A five-stage GitOps pipeline diagram showing a Terraform deployment workflow. The stages, marked with green checkmarks, include OIDC Authentication, Terraform Plan (Fmt/Validate/Plan), AWS S3 Remote State Locking, Terraform Apply (deploying 13 DNS records and an Oracle VCN/Instance), and Branch Protection. The pipeline concludes with an 'Infrastructure Updated' globe icon."
---

### Introduction

In Part 1, I built a security-gated CI/CD pipeline for my portfolio site — Gitleaks, CodeQL, Lighthouse audits, and secretless OIDC deployment to GitHub Pages. That pipeline was about code delivery. Push code, run checks, deploy the site.

But the whole time I was building that pipeline, the infrastructure underneath it — the DNS records, the cloud servers, the network configuration — was still managed by hand. I would log into Cloudflare, click around to add a DNS record. Log into Oracle Cloud, click through a wizard to resize an instance. If something broke, I would try to remember what I had changed and where.

That is fine when you have two or three things to manage. I had thirteen DNS records across multiple subdomains, a Cloudflare Tunnel configuration, an Oracle Cloud VCN with a subnet and a compute instance, and an AWS S3 bucket holding my Terraform state. Keeping track of all of that by clicking through dashboards was starting to feel like a job I was doing badly.

So Part 2 is about bringing all of that under code. Every DNS record, every cloud resource, defined in Terraform files, stored in GitHub, and deployed through a pipeline. No more dashboard clicking. No more "wait, did I change that setting last week or was it always like that?"

This one took longer than Part 1. There were more moving parts, more credentials to manage, and a migration that I was genuinely nervous about. But it is done, and my infrastructure is now as version-controlled as my code.

---

### See it live

- [The Lab](/lab/) — live infrastructure status and build progress tracker
- [Architecture diagram](/architecture/) — five-zone infrastructure map spanning Waco TX, Phoenix AZ, and Amsterdam NL

---

### What is Infrastructure as Code and why should you care?

The concept is simple: instead of configuring infrastructure by clicking through web dashboards, you write code that describes what you want to exist. Then a tool reads that code and creates it for you.

The code becomes your documentation. If someone asks "what DNS records does your domain have?", you do not need to log into Cloudflare and screenshot the dashboard. You point them at a file. If you need to recreate everything from scratch — disaster recovery, new environment, new cloud account — you run one command instead of spending a day clicking through consoles trying to remember every setting.

But the part that really sold me on it was the diff. When you change a Terraform file and run `terraform plan`, it shows you exactly what will change before anything happens. "I am going to add this DNS record, modify this subnet rule, and leave everything else alone." You review it, confirm it, and only then does it apply. Compare that to clicking "Save" in a dashboard and hoping you did not just break something.

In my day job at AbbVie, we do not make changes to production systems without documentation and review. That is what cGMP requires. Terraform brings that same discipline to infrastructure — every change is tracked, reviewed, and auditable.

---

### Chapter 1: The Module Structure

Before writing any Terraform, I had to decide how to organize the code. Terraform lets you put everything in one big file, but that gets messy fast when you are managing resources across multiple cloud providers.

I went with a modular structure:

```text
homelab-iac/
├── backend.tf              # Where Terraform stores its state
├── main.tf                 # Calls the modules, passes variables
├── variables.tf            # Declares all input variables
├── terraform.tfvars        # Actual secret values (gitignored)
├── modules/
│   ├── cloudflare/
│   │   ├── main.tf         # All 13 DNS record resources
│   │   └── variables.tf    # Cloudflare-specific variables
│   └── oracle/
│       ├── main.tf         # VCN, subnet, compute instance
│       └── variables.tf    # OCI-specific variables
└── .github/
    └── workflows/
        ├── terraform-plan.yml
        └── terraform-apply.yml
```

The idea is separation of concerns. The Cloudflare module knows how to manage DNS records. The Oracle module knows how to manage cloud infrastructure. `main.tf` connects them. If I add a third cloud provider later, I add a third module without touching the existing ones.

The `terraform.tfvars` file contains the actual secret values — API tokens, OCIDs, private keys. It is in `.gitignore` and never gets committed to GitHub. More on how the pipeline handles this later.

---

### Chapter 2: Cloudflare DNS — 13 Records as Code

Before Terraform, my DNS setup was a collection of manually created records in the Cloudflare dashboard. I knew roughly what they all did, but I could not have listed all thirteen from memory. Converting them to code forced me to actually understand each one.

Here is what I am managing:

**Portfolio site:** Two CNAME records pointing the root domain and www subdomain to Netlify, where my Hugo site is hosted.

**Cloudflare Tunnel records:** Seven CNAME records, one for each service I expose through the tunnel — Grafana, Prometheus, AdGuard, Homer, n8n, Nginx Proxy Manager, and cAdvisor. Each one points to the tunnel ID so traffic routes through Cloudflare's edge network instead of hitting my home IP directly.

**Email authentication:** Three records — SPF, DKIM, and DMARC. These are TXT records that prove to email servers that mail claiming to come from my domain is legitimate. I do not actually send email from this domain, but having these records prevents someone else from spoofing it.

**GitHub Pages verification:** A TXT record that proves to GitHub that I own the domain, required for the custom domain configuration on GitHub Pages.

A single DNS record in Terraform looks like this:

```hcl
resource "cloudflare_record" "tunnel_grafana" {
  zone_id = var.cloudflare_zone_id
  name    = "grafana"
  content = "${var.tunnel_id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
  ttl     = 1
}
```

That is it. Six lines. If I need to change the Grafana subdomain or point it somewhere else, I change one line of code, open a pull request, review the plan, and merge. The pipeline applies it automatically.

The Cloudflare provider authenticates using an API token scoped to Zone:Zone:Read and Zone:DNS:Edit on my specific zone only. Least privilege — the token cannot touch anything outside my domain.

---

### Chapter 3: Oracle Cloud — The Network and the Server

The Oracle module manages three resources that form a complete cloud environment:

**VCN (Virtual Cloud Network):** A private network inside Oracle Cloud. Think of it as creating your own isolated LAN in the cloud. Resources inside the VCN can talk to each other, but the outside world cannot reach them unless you explicitly allow it.

**Subnet:** A subdivision of the VCN that defines the IP address range and routing rules. My compute instance sits in this subnet.

**Compute Instance:** The actual virtual machine — an Ampere ARM instance with 4 OCPUs and 24GB of RAM, running Ubuntu 24.04. This is my cloud server in Phoenix, Arizona. It runs AdGuard Home for DNS ad-blocking, Ollama with DeepSeek-R1 for the AI log summarizer, and Node Exporter for monitoring.

All three resources are defined in `modules/oracle/main.tf`. If Oracle ever reclaims the instance (it happens on the Always Free tier), I can recreate the entire network and server by running the pipeline. Everything comes back exactly as defined — same VCN, same subnet, same instance shape and configuration.

One thing Terraform does not manage here is what runs inside the instance. Docker, Ollama, AdGuard — those were all set up manually via SSH. Terraform creates the machine. Configuring what is on it is a different tool's job — Ansible, probably, in a future phase.

---

### Chapter 4: Remote State — And Why It Matters More Than You Think

When Terraform creates a resource, it writes a record of that resource to a state file. The state file is how Terraform knows what already exists, so it can figure out what needs to change on the next run.

By default, the state file lives on your local machine. That works for one person on one laptop, but it has two serious problems:

1. If your laptop dies, you lose the state. Terraform no longer knows what exists. You either import every resource manually or start over.
2. If two people (or two pipeline runs) execute Terraform at the same time, they can corrupt the state by writing to it simultaneously.
   I solved both problems by storing state remotely in AWS S3:

```hcl
terraform {
  backend "s3" {
    bucket       = "your-terraform-state-bucket"
    key          = "homelab/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
```

The state file lives in an S3 bucket, encrypted at rest. If my local server catches fire, the state is safe in AWS.

The `use_lockfile = true` line enables S3-native state locking. When Terraform runs, it creates a `.tflock` file in the bucket. If a second process tries to run simultaneously, it sees the lock and waits. No corruption possible.

I originally used a DynamoDB table for state locking — that was the standard approach for years. But Terraform 1.10 introduced S3-native locking, and as of 1.11 the DynamoDB approach is deprecated. I migrated by changing one line in `backend.tf`, running `terraform init -reconfigure`, and deleting the DynamoDB table. The whole migration took about five minutes and simplified my AWS footprint.

---

### Chapter 5: The Pipeline — Plan on PR, Apply on Merge

Having Terraform code in GitHub is nice. Having it automatically validate and deploy is the real goal.

I created two GitHub Actions workflows:

**terraform-plan.yml** triggers on every pull request to main. It runs `terraform fmt -check` (is the code formatted correctly?), `terraform validate` (is the syntax valid?), and `terraform plan` (what would change?). If any step fails, the PR is blocked.

**terraform-apply.yml** triggers when code is merged to main. It runs `terraform apply -auto-approve`, actually making the infrastructure changes.

The plan workflow is the review step. When I open a PR that adds a DNS record, the plan output shows exactly what will be created. I read it, confirm it looks right, and merge. The apply workflow does the rest.

This is the same GitOps pattern used by platform engineering teams at companies much larger than my homelab. Git is the source of truth. Every change goes through a PR, gets validated by the pipeline, and is applied automatically on merge. The Git history becomes an audit log of every infrastructure change.

---

### Chapter 6: OIDC — The Part That Changed How I Think About Credentials

In Part 1, I used OIDC to deploy to GitHub Pages without stored tokens. In Part 2, I used the same concept for something more complex — authenticating GitHub Actions to AWS.

The old way would be to create an AWS access key and secret key, store them in GitHub Secrets, and reference them in the workflow. Those keys never expire. If someone compromises your repo or your secrets leak, they have permanent access to your AWS account.

OIDC flips this around. I configured three things in AWS:

1. **An OIDC Identity Provider** — tells AWS "I know what GitHub Actions is and I trust their identity tokens."
2. **An IAM Role** with a trust policy scoped to my specific repo — tells AWS "only workflows running from `<your-username>/<your-repo>` can assume this role."
3. **An inline policy** — tells AWS "this role can only read and write to the S3 state bucket. Nothing else."
   When the pipeline runs, GitHub generates a short-lived token proving it is a workflow from my repo. AWS verifies the token, checks it against the trust policy, and hands back temporary credentials that expire in one hour. The pipeline uses those credentials, finishes its work, and the credentials disappear.

No permanent keys. Nothing stored in secrets. Nothing to rotate. Nothing to leak.

The workflow step is surprisingly simple:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: us-east-1
```

The only secret stored in GitHub is the ARN (Amazon Resource Name) of the IAM role — which is not a credential. It is just an identifier. The actual authentication happens through the OIDC handshake at runtime.

This was the piece that genuinely shifted how I think about credential management. In my previous work, I had always treated API keys as "generate once, store somewhere, hope nobody finds them." OIDC eliminates the "hope" part entirely.

---

### Chapter 7: Handling Secrets in the Pipeline

The pipeline needs credentials for three providers — AWS, Cloudflare, and Oracle Cloud. Each one is handled differently.

**AWS:** OIDC, as described above. No stored credentials.

**Cloudflare:** An API token stored as a GitHub Secret (`CLOUDFLARE_API_TOKEN`). The token is scoped to Zone:Zone:Read and Zone:DNS:Edit on my specific zone. I rotated the token during this setup — generated a new one, added it to GitHub Secrets, revoked the old one.

**Oracle Cloud:** Multiple values stored as GitHub Secrets — tenancy OCID, user OCID, fingerprint, region, compartment ID, SSH public key, and a private key. The tricky one was the private key. On my local machine, Terraform reads it from a file at `~/.oci/oci_api_key.pem`. That file does not exist in GitHub Actions. So the workflow writes the key content from the secret to a temporary file before Terraform runs:

```yaml
- name: Write OCI private key
  run: |
    mkdir -p ~/.oci
    echo "${{ secrets.OCI_PRIVATE_KEY }}" > ~/.oci/oci_api_key.pem
    chmod 600 ~/.oci/oci_api_key.pem
```

The `chmod 600` ensures only the current user can read the key — same as on your local machine. The file exists only for the duration of the workflow run and is destroyed when the runner is cleaned up.

All the secret values are passed to Terraform using the `TF_VAR_` prefix convention. Terraform automatically reads any environment variable starting with `TF_VAR_` and maps it to the corresponding variable:

```yaml
env:
  TF_VAR_cloudflare_api_token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  TF_VAR_oci_tenancy_ocid: ${{ secrets.OCI_TENANCY_OCID }}
```

This means `terraform.tfvars` is only needed locally. The pipeline gets its values from GitHub Secrets and environment variables instead.

---

### Chapter 8: Branch Protection — Closing the Loop

A pipeline is only as strong as the rules that enforce it. Without branch protection, nothing stops you from pushing directly to main at midnight and bypassing all the checks.

I created a ruleset on the repository:

- **Require a pull request before merging** — no direct pushes to main
- **Require the `plan` status check to pass** — merge is blocked until Terraform plan succeeds
- **Block force pushes** — no rewriting history on main
  Now the only way to change infrastructure is: branch → commit → push → open PR → plan runs → review → merge → apply runs. No shortcuts. Not even for the repo owner.

It felt slightly paranoid to lock myself out of my own main branch. But then I remembered that the one time I would want to bypass the pipeline is exactly the time I should not — late at night, tired, "just this one quick fix." The branch protection is there for that version of me.

---

### Chapter 9: The Migration That Made Me Nervous

Everything I have described so far was building something new. But there was one part that involved changing something that already existed — migrating from DynamoDB state locking to S3-native locking.

The state file is the single most important file in a Terraform setup. If it gets corrupted or lost, Terraform loses track of every resource it manages. You do not casually mess with how the state file is stored.

The actual migration was anticlimactic. I changed one line in `backend.tf`:

```diff
-    dynamodb_table = "terraform-lock-table"
+    use_lockfile   = true
```

Ran `terraform init -reconfigure`. Ran `terraform plan`. It showed no changes — meaning Terraform could still read the state and nothing had drifted. I deleted the DynamoDB table in AWS. Done.

But the fact that I was nervous about it taught me something about infrastructure work. The migration itself took five minutes. The caution I felt — checking the plan output twice, making sure I could roll back — that is the right instinct. In production, you do not rush infrastructure changes just because the technical step is simple.

---

### What I Took Away From This

Part 1 taught me CI/CD. Part 2 taught me that the same principles — version control, automated validation, review before deploy — apply to infrastructure just as well as they apply to code.

The specific tools matter less than the pattern. Terraform could be replaced by Pulumi or OpenTofu. GitHub Actions could be replaced by GitLab CI or CircleCI. S3 could be replaced by GCS or Azure Blob Storage. The pattern stays the same: define infrastructure in code, store the code in version control, validate changes automatically, deploy through a pipeline, and never make changes by hand.

The part I am most proud of is the OIDC setup. Not because it was technically difficult — it was about an hour of work — but because it represents a genuine shift in how I think about security. Moving from "store a key and hope it does not leak" to "there is no key to leak" is the kind of change that sticks with you.

Building this also made me realize how much of DevOps is about discipline, not tooling. The pipeline does not do anything I could not do manually. But it does it the same way every time, it does it on every change without exception, and it leaves a record. That consistency is the actual value.

---

### What is Next?

**Part 3** brings Kubernetes into the homelab. I will be setting up a K3s cluster with my local server as the control plane node and the Oracle Cloud instance as a worker node — a geographically distributed cluster connected over Tailscale. Same discipline: infrastructure as code, pipeline-driven, documented.

The container orchestration layer is where everything built in Parts 1 and 2 starts to converge. The CI/CD pipeline from Part 1 will build and push container images. The Terraform infrastructure from Part 2 will provision the nodes. Kubernetes will run the workloads.

Stay tuned, and happy building.
