---
title: "Building an LLM-Powered Log Triage Pipeline with Python and DeepSeek-R1"
date: 2026-05-10
dateString: May 2026
description: "How I built a Python automation that reads Docker container logs, classifies severity, and sends critical events to a self-hosted DeepSeek-R1 model for natural-language summarization — with alerts delivered to Discord every 15 minutes."
draft: false
author: " | Prajwol Bikram Adikari"
tags:
  - DevOps
  - Python
  - AI
  - LLM
  - DeepSeek
  - Ollama
  - Docker
  - OracleCloud
  - Observability
  - Automation
  - Homelab
weight: 147
project_series: "Standalone Deployments"
cover:
  image: "/projects/deepseek-log-triage/deepseek-log-triage.webp"
  alt: "An infographic diagram titled 'Spidey Bot APP' and dated '5/10/2026' on a dark blue grid background, illustrating a four-stage DevSecOps log triage pipeline. Stage 1, located at a 'Local Server (Waco, Texas)', is titled '1. Cron: Read and Classify logs' and uses icons of gears for 'rules-based triage' to filter 'Docker logs'. It shows logs funneling forward with red ('crit') and green ('ignore') lines, where only critical ones escalate. A connecting line labeled 'Encrypted Tailscale VPN' links to Stage 2 at 'Oracle Cloud (Phoenix, Arizona)', titled '2. Ollama / DeepSeek-R1 1.5B'. A neural network icon ('LLM') and a prompt-response loop process the logs, where the 'model writes plain-English summary of critical logs' for a 'log summary'. A line labeled 'Discord webhook' then links to a dark message embed card titled 'Alert — [CONTAINER NAME]', containing fields for 'Trigger keyword', 'Severity', 'AI Analysis', and more. The text indicates the summary is 'Summary delivered to Discord channel'. At the bottom, a green panel links to a toolbox with six logos: Ollama, DeepSeek, Docker, Python, Tailscale, and a final 'alerts' text icon."
---

### Introduction

I have Prometheus and Grafana monitoring my homelab. I have Alertmanager sending Discord notifications when a node goes down. But there was a gap in the middle that kept bugging me.

Prometheus tells me _that_ something is wrong. CPU is high. A container restarted. A scrape target is unreachable. What it does not tell me is _why_. For that, you need to read the logs. And reading Docker logs across multiple containers, multiple times a day, is the kind of task that feels productive for about ten minutes before you start skimming and missing things.

So I built something to read them for me. A Python script that runs every 15 minutes, pulls Docker container logs, checks for anything that looks critical, and sends the critical stuff to a small language model running on my Oracle Cloud instance. The model reads the raw log entry and writes a plain-English summary. That summary gets posted to a Discord channel.

Instead of me reading through hundreds of log lines and hoping I notice the important one, an LLM reads them and only bothers me when something actually matters.

This is not a fancy AI agent with tool use and multi-step reasoning. It is a straightforward automation — rules-based triage plus an LLM for summarization. But it solves a real problem I was actually having, and it taught me a lot about how to practically integrate an LLM into an infrastructure workflow.

---

### Why not just use Alertmanager for everything?

Fair question. Alertmanager handles the metrics side well — if CPU spikes above 90% for five minutes, or if a node goes unreachable, it fires an alert. But metrics and logs are different things.

A container can be running fine from a metrics perspective — CPU normal, memory stable, responding to health checks — but still be logging errors internally. Maybe it is failing to connect to an upstream API. Maybe it is retrying a database connection every 30 seconds. Maybe there is a deprecation warning that will become a breaking change next release. None of that shows up in Prometheus metrics. All of it shows up in logs.

The log triage pipeline covers the gap between "the container is running" and "the container is healthy."

---

### Chapter 1: The Architecture

The pipeline has four components spread across two machines:

**On my local server (Waco, Texas):**

- The Python script that reads Docker logs and classifies severity
- A cron job that runs the script every 15 minutes
- Docker, whose containers produce the logs
  **On the Oracle Cloud instance (Phoenix, Arizona):**
- Ollama, serving the DeepSeek-R1 1.5B model as a REST API
  **In between:**
- Tailscale, connecting both machines over an encrypted mesh VPN
- Discord webhooks, receiving the final alert messages
  The separation is intentional. The LLM runs on the Oracle instance because it has 24GB of RAM — enough to load a small model comfortably. My local server has less headroom, and I did not want model inference competing with the Docker services it is supposed to be monitoring.

The Python script calls the Ollama API over Tailscale, so the traffic never touches the public internet. The model endpoint is not exposed to anyone outside my Tailscale network.

---

### Chapter 2: Setting Up Ollama and DeepSeek-R1

Ollama makes self-hosting a language model surprisingly painless. On the Oracle instance, the setup was:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull deepseek-r1:1.5b
```

That is it. Ollama downloads the model and serves it as a REST API on port 11434. You can test it immediately:

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "deepseek-r1:1.5b",
  "prompt": "Summarize this log entry: ERROR: database connection refused at 10.0.0.5:5432, retrying in 30s",
  "stream": false
}'
```

And it responds with a natural-language summary of what the log entry means.

I chose the 1.5B parameter model for a reason. It is small enough to run on the Oracle ARM instance without maxing out memory, and fast enough that inference takes a few seconds per log entry rather than minutes. For summarizing log lines, you do not need GPT-4 level intelligence. You need something that can read a stack trace and say "the database connection is failing" in plain English. The 1.5B model does that reliably.

A larger model would produce slightly more polished summaries, but the latency and memory tradeoff is not worth it for an automation that runs every 15 minutes. I would rather have fast and good enough than slow and perfect.

---

### Chapter 3: The Python Script — Rules First, LLM Second

This is where the design decision that matters most lives. The script does not send every log line to the LLM. That would be slow, expensive on compute, and pointless — most log lines are routine. Instead, it uses a two-stage approach:

**Stage 1: Rules-based severity classification.** The script reads the last 15 minutes of logs from each Docker container using `docker logs --since 15m`. It then checks each line against a set of keyword patterns:

- Lines containing `error`, `fatal`, `critical`, `OOM`, `killed`, `panic`, `exception` → classified as critical
- Lines containing `warn`, `timeout`, `retry`, `refused` → classified as warning
- Everything else → ignored
  This is intentionally simple. I am not trying to build a perfect classifier. I am trying to filter out the 95% of log lines that say things like "request completed in 12ms" so the LLM only has to deal with the 5% that might actually matter.

**Stage 2: LLM summarization.** Only the lines classified as critical get sent to DeepSeek. The prompt is straightforward:

```python
prompt = f"""You are a DevOps engineer reviewing system logs.
Summarize the following log entry in one or two sentences.
Explain what happened and whether immediate action is needed.

Log entry:
{log_line}"""
```

The model returns a summary like: "The Grafana container failed to authenticate with its PostgreSQL backend. The connection was refused, suggesting the database container may be down or the credentials have changed. Immediate investigation recommended."

That summary is what gets posted to Discord — not the raw log line, but the plain-English interpretation of it.

---

### Chapter 4: The Discord Integration

Discord webhooks are probably the simplest notification integration you can set up. You create a webhook URL in your Discord server settings, and then posting to it is one HTTP request:

```python
import requests

def send_discord_alert(summary, container_name, severity):
    webhook_url = "your-discord-webhook-url"

    payload = {
        "embeds": [{
            "title": f"🔴 {severity.upper()} — {container_name}",
            "description": summary,
            "color": 15158332  # red
        }]
    }

    requests.post(webhook_url, json=payload)
```

The embed format gives you a clean, colored card in Discord rather than a wall of text. Critical alerts show up in red. Warnings could show up in yellow if I ever decide to surface those too — for now I only send critical ones to keep the noise low.

The webhook URL is stored as an environment variable, not hardcoded. I learned this the hard way earlier in the project when I accidentally shared webhook URLs in a chat and had to regenerate them. Treat webhook URLs like API keys — anyone with the URL can post to your channel.

---

### Chapter 5: The Cron Job

The script runs every 15 minutes via cron on my local server:

```bash
*/15 * * * * /usr/bin/python3 /home/user/scripts/log-triage.py >> /var/log/log-triage.log 2>&1
```

Fifteen minutes is a balance between responsiveness and noise. Every 5 minutes would catch things faster but generate more Discord traffic during noisy periods (like when I am actively deploying something and containers are restarting). Every hour would miss things for too long. Fifteen minutes means I find out about a critical issue within fifteen minutes — which for a homelab is perfectly fine.

The output gets appended to its own log file, which is a bit meta — the log triage tool has its own logs. But it is useful for debugging when the script itself fails, which happened more than once during development.

---

### Chapter 6: What I Learned Building This

**The rules-based first stage is doing most of the work.** I originally planned to send all logs to the LLM and let it figure out what was important. That was a mistake. The model was slow, the responses were inconsistent for routine log lines, and the Discord channel was flooded with summaries of perfectly normal events. Adding the keyword filter in front cut the LLM calls by about 95% and made the whole pipeline actually useful.

This is a pattern I have seen in every discussion about production LLM systems: you almost always want a cheap, fast filter in front of the expensive, slow model. Let the simple rules handle the simple cases. Only escalate to the LLM when something actually needs interpretation.

**Small models are fine for specific tasks.** There is a temptation to reach for the biggest model you can run. But for log summarization, the 1.5B parameter model produces perfectly adequate output. It occasionally misses nuance that a larger model would catch, but the summaries are accurate enough to tell me whether I need to investigate further. For an alerting pipeline, "accurate enough to trigger investigation" is the right bar — not "perfect analysis."

**Self-hosting has real advantages for this use case.** I could have called an external API like OpenAI or Anthropic instead of running my own model. But there are three reasons I did not:

1. Cost — at 96 runs per day, even cheap API calls add up over months. The Oracle instance is free tier.
2. Privacy — I am sending my infrastructure logs to the model. Even in a homelab, I would rather not send container logs to a third-party API.
3. Latency — the Ollama instance responds in 2-3 seconds over Tailscale. An API call over the internet would be similar, but with more variable latency and the possibility of rate limiting.
   **This is not an AI agent.** I want to be clear about what this is and what it is not. An agent makes decisions and takes actions — it might read a log, decide the database needs restarting, and execute the restart. This pipeline does not do that. It reads logs, summarizes them, and tells me about them. I am still the one who decides what to do. That is a deliberate choice — I am not comfortable with automated remediation on infrastructure I actually depend on. Maybe in a future iteration.

---

### What Could Be Better

There are obvious improvements I have not made yet:

**Smarter classification.** The keyword matching is crude. "Error" in a log line is not always an error — sometimes it is a log line about error handling working correctly, like "recovered from error successfully." A more sophisticated approach would use regex patterns tuned per container, or even a small classifier model. For now, the false positive rate is low enough that I live with it.

**Log aggregation with Loki.** Right now, the script runs `docker logs` on each container individually. If I set up Grafana Loki, all container logs would flow into a central store, and the script could query Loki instead of Docker directly. That is a cleaner architecture and it is on my roadmap for a future phase.

**Alert deduplication.** If a container logs the same error repeatedly (like a connection retry every 30 seconds), the script will send the same alert multiple times. I should add a simple cache that tracks recently seen errors and suppresses duplicates within a time window.

---

### The Monitoring Stack So Far

This pipeline sits alongside the rest of the observability stack I have been building across the hybrid cloud project:

- **Prometheus** scrapes system metrics (CPU, memory, disk, network) from three geographically distributed nodes — my local server in Texas, Oracle Cloud in Arizona, and a shell server in the Netherlands.
- **Grafana** visualizes those metrics on dashboards.
- **Alertmanager** fires alerts to Discord when metric-based rules trigger (like a node going unreachable).
- **This Python pipeline** covers the log side — reading container logs, summarizing critical entries with DeepSeek, and posting summaries to Discord.
  Together, they give me visibility into both the system-level health (metrics) and the application-level behavior (logs) of the homelab. Not bad for infrastructure running on a laptop and a free-tier cloud instance.

---

### Appendix: The Complete Script

Here is a cleaned-up version of the script. Replace the placeholder values with your own container names, Ollama endpoint, and Discord webhook URL.

```python
#!/usr/bin/env python3
"""
LLM-Augmented Log Triage Pipeline
Rules-based severity classification + DeepSeek-R1 summarization.
Runs via cron every 15 minutes.
"""
import subprocess
import requests
import json
import os
from datetime import datetime

# ── Configuration ──────────────────────────────────────────────
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL")
if not DISCORD_WEBHOOK_URL:
    raise ValueError("DISCORD_WEBHOOK_URL not set")

OLLAMA_URL   = "http://<your-ollama-host>:11434/api/generate"
OLLAMA_MODEL = "deepseek-r1:1.5b"

# Containers to monitor — adjust to match your Docker stack
CONTAINERS = [
    "prometheus",
    "grafana",
    "alertmanager",
    "nginx-proxy",
    "adguard",
]

# ── Stage 1: Rules-based triage ────────────────────────────────

# Keywords that trigger LLM analysis
ESCALATE_KEYWORDS = [
    "fatal", "panic", "oom", "killed", "out of memory",
    "disk full", "no space left", "corruption", "segfault",
    "exception", "unauthorized", "authentication failed",
    "permission denied", "container exited",
    "exit code 1", "exit code 2",
]

# Known-harmless patterns to ignore before keyword matching
IGNORE_PATTERNS = [
    "filter update",          # adguard routine
    "nginx reloaded",         # proxy routine
    "certificate renewed",    # TLS renewal noise
    "checkpoint",             # prometheus WAL compaction
    "compacted",              # prometheus normal
    "watching for new ooms",  # cadvisor startup
]


def get_container_logs(container, lines=30):
    """Pull the last N lines of logs from a Docker container."""
    try:
        result = subprocess.run(
            ["docker", "logs", "--tail", str(lines), container],
            capture_output=True, text=True, timeout=10
        )
        output = (result.stdout + result.stderr).strip()
        return output[:1500] if output else "No output."
    except Exception as e:
        return "Error: " + str(e)


def should_analyze(logs):
    """
    Rules-based filter. Strips known-harmless patterns first,
    then checks for escalation keywords.
    Returns (needs_analysis: bool, matched_keyword: str or None).
    """
    logs_lower = logs.lower()

    for pattern in IGNORE_PATTERNS:
        if pattern in logs_lower:
            logs_lower = logs_lower.replace(pattern, "")

    for keyword in ESCALATE_KEYWORDS:
        if keyword in logs_lower:
            return True, keyword

    return False, None


# ── Stage 2: LLM summarization ────────────────────────────────

def analyze_with_ai(container, logs, trigger_keyword):
    """Send critical logs to DeepSeek for plain-English summarization."""
    prompt = (
        "You are an SRE. A Docker container triggered an alert.\n\n"
        f"Container: {container}\n"
        f"Trigger keyword found: {trigger_keyword}\n\n"
        f"Logs:\n{logs}\n\n"
        "Explain in 2-3 sentences:\n"
        "1. What is the actual problem?\n"
        "2. How severe is it: critical or warning?\n"
        "3. What should the engineer do?\n"
    )

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 1000,
                    "num_ctx": 1024,
                }
            },
            timeout=300
        )
        resp.raise_for_status()
        raw = resp.json().get("response", "").strip()

        # DeepSeek-R1 wraps reasoning in <think> tags — strip them
        if "<think>" in raw:
            raw = raw.split("</think>")[-1].strip()

        # Determine severity from the model's response
        raw_lower = raw.lower()
        severity = "warning"
        if "critical" in raw_lower and "not critical" not in raw_lower:
            severity = "critical"

        return {"analysis": raw, "severity": severity}

    except Exception as e:
        return {"analysis": "AI analysis failed: " + str(e), "severity": "warning"}


# ── Discord alerting ───────────────────────────────────────────

def send_discord_alert(container, trigger_keyword, analysis_result):
    """Post a formatted embed to Discord with the LLM summary."""
    severity = analysis_result.get("severity", "warning")
    colors = {"critical": 0xF85149, "warning": 0xE3B341}

    payload = {
        "embeds": [{
            "title": f"Alert — {container}",
            "color": colors.get(severity, 0xE3B341),
            "fields": [
                {"name": "Container",       "value": f"`{container}`",       "inline": True},
                {"name": "Severity",        "value": severity.upper(),       "inline": True},
                {"name": "Trigger keyword", "value": f"`{trigger_keyword}`", "inline": False},
                {"name": "AI Analysis",     "value": analysis_result.get("analysis", ""), "inline": False},
                {"name": "Time",            "value": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "inline": False},
            ],
            "footer": {"text": "Rules triage + DeepSeek-R1 1.5B"}
        }]
    }

    try:
        requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=5)
    except Exception as e:
        print(f"Discord failed: {e}")


# ── Main loop ──────────────────────────────────────────────────

def main():
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Log triage starting...")
    escalated = 0

    for container in CONTAINERS:
        logs = get_container_logs(container)
        needs_analysis, keyword = should_analyze(logs)

        if not needs_analysis:
            continue

        result = analyze_with_ai(container, logs, keyword)
        send_discord_alert(container, keyword, result)
        escalated += 1

    print(f"Done. {escalated}/{len(CONTAINERS)} containers escalated.")


if __name__ == "__main__":
    main()
```

To run it on a 15-minute schedule, add a cron job:

```bash
crontab -e
```

```
*/15 * * * * DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/your-webhook-here" /usr/bin/python3 /path/to/log-triage.py >> /var/log/log-triage.log 2>&1
```

---

### What is Next

The hybrid cloud series continues with **Part 3: K3s Kubernetes Cluster** — setting up a K3s cluster with my local server as the control plane and the Oracle Cloud instance as a worker node, connected over Tailscale. Once that is running, I plan to containerize this log triage pipeline itself and deploy it as a Kubernetes workload, shipped through the CI/CD pipeline I built in Part 1. That would close the loop — the monitoring tool running inside the system it monitors, delivered through the same pipeline as everything else.

Stay tuned, and happy building.
