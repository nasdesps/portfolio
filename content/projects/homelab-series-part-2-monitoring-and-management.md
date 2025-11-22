---
title: "Part 2: Homelab Management & Monitoring"
date: 2025-09-25
dateString: Sep 2025
description: "Elevate your homelab with a professional management and monitoring stack. This guide details how to deploy Nginx Proxy Manager, Prometheus, Grafana, and a Homer dashboard using Docker."
draft: false
tags:
  - Homelab
  - Docker
  - Nginx Proxy Manager
  - Reverse Proxy
  - Linux
  - Grafana
  - Prometheus
  - Monitoring
  - Homer
  - Self-Hosting
  - Opensource
weight: 103
cover:
  image: "/projects/homelab-part2/homelab-part2.png"
  alt: "A futuristic data dashboard with multiple glowing panels showing server health statistics, a real-time world network map, and performance graphs, representing a monitoring stack built with Grafana and Prometheus."
---

### Introduction

Welcome to Part 2 of my homelab series! In [Part 1](/projects/homelab-series-part-1-debian-docker-foundation/), we built a solid foundation by turning an old laptop into a hardened Debian server with Docker. Now that our server is running, we need to deploy services to manage, monitor, and easily access our projects.

In this guide, we'll deploy three essential stacks. First, **Nginx Proxy Manager (NPM)** will act as our server's front door and create a shared network for our containers. Second, we'll set up a professional-grade monitoring stack with **Prometheus** and **Grafana**. Finally, we'll deploy a **Homer** dashboard to create a beautiful and convenient launchpad for all our services.

---

### 1. The Management Layer: Nginx Proxy Manager (NPM) 🌐

Before we can deploy our other services, we need a way to manage connections between them. NPM will act as our reverse proxy and, crucially, will create the shared Docker network that all our other services will connect to.

#### **A. Deploy Nginx Proxy Manager**

First, let's create a directory and the `docker-compose.yml` file for NPM.
```bash
# Create the directory
mkdir -p ~/docker/npm
cd ~/docker/npm

# Create the docker-compose.yml
nano docker-compose.yml
````

Paste in the following configuration. This file defines the NPM service and creates a network named `npm_default`.


```
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    container_name: npm-app-1
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '81:81'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
networks:
  default:
    name: npm_default
```

Launch it with 

```
docker compose up -d
``` 
You can now log in to the admin UI at `http://<your-server-ip>:81`.

---

### 2. The Monitoring Stack 📊

With our shared network in place, we can now deploy our monitoring stack.

- **Prometheus:** Collects all the metrics.
    
- **Node Exporter:** Exposes the server's hardware metrics.
    
- **cAdvisor:** Exposes Docker container metrics.
    
- **Grafana:** Visualizes all the data in beautiful dashboards.
    

#### **A. Create the Prometheus Configuration**

Prometheus needs a config file to know what to monitor.


```
# Create the project directory
mkdir -p ~/docker/monitoring
cd ~/docker/monitoring

# Create the prometheus.yml file
nano prometheus.yml
```

Paste in the following configuration:


```
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
```

#### **B. Deploy the Stack with Docker Compose**

Next, create the `docker-compose.yml` file in the same `~/docker/monitoring` directory.


```
nano docker-compose.yml
```

This file defines all four monitoring services and tells them to connect to the `npm_default` network we created earlier.


```
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    networks:
      - default

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - default

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    restart: unless-stopped
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - default

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    restart: unless-stopped
    ports:
      - "8081:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    networks:
      - default

volumes:
  prometheus_data:
  grafana_data:

networks:
  default:
    name: npm_default
    external: true
```

Now, launch the stack:

```
docker compose up -d
```

#### **C. Configure Grafana**

Log in to Grafana at `http://<your-server-ip>:3001` (default: `admin`/`admin`).

1. **Add Data Source:** Go to Connections > Data Sources, add a **Prometheus** source, and set the URL to `http://prometheus:9090`.
    
2. **Import Dashboards:** Go to Dashboards > New > Import and add these dashboards by ID:
    
    - **Node Exporter Full (ID: `1860`)**
        
    - **Docker Host/Container Metrics (ID: `193`)**
        

---

### 3. The Homer Launchpad Dashboard 🚀

Finally, let's deploy Homer as our beautiful start page with custom icons.

1. **Create Directories & Download Icons:** First, create a directory for Homer and an `assets` subdirectory. Then, `cd` into the `assets` folder and download the icons.

    ```
    mkdir -p ~/docker/homer/assets
    cd ~/docker/homer/assets
    wget -O grafana.png [https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/grafana.png](https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/grafana.png)
    wget -O prometheus.png [https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/prometheus.png](https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/prometheus.png)
    wget -O cadvisor.png [https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/cadvisor.png](https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/cadvisor.png)
    wget -O npm.png [https://nginxproxymanager.com/icon.png](https://nginxproxymanager.com/icon.png)
    ```
    
2. **Create Configuration:** Go back to the main `homer` directory and create the `config.yml` file.
    
    ```
    cd ~/docker/homer
    nano config.yml
    ```
    
    Paste in the following configuration. The `logo:` lines point to the icons we just downloaded.
    
    ```
    ---
    title: "Homelab Dashboard"
    subtitle: "Server Management"
    theme: "dark"
    
    services:
      - name: "Management"
        icon: "fas fa-server"
        items:
          - name: "Nginx Proxy Manager"
            logo: "assets/tools/npm.png"
            subtitle: "Reverse Proxy Admin"
            url: "http://<your-server-ip>:81"
    
      - name: "Monitoring"
        icon: "fas fa-chart-bar"
        items:
          - name: "Grafana"
            logo: "assets/tools/grafana.png"
            subtitle: "Metrics Dashboard"
            url: "http://<your-server-ip>:3001"
          - name: "Prometheus"
            logo: "assets/tools/prometheus.png"
            subtitle: "Metrics Database"
            url: "http://<your-server-ip>:9090"
          - name: "cAdvisor"
            logo: "assets/tools/cadvisor.png"
            subtitle: "Container Metrics"
            url: "http://<your-server-ip>:8081"
    ```
    
3. **Create Docker Compose File:** Finally, create the `docker-compose.yml` file.
    
    ```
    nano docker-compose.yml
    ```
    
    This configuration connects Homer to our shared network.
    
    ```
    services:
      homer:
        image: b4bz/homer
        container_name: homer
        volumes:
          - ./config.yml:/www/assets/config.yml
          - ./assets:/www/assets/tools
        ports:
          - "8090:8080"
        restart: unless-stopped
        networks:
          - npm_default
    
    networks:
      npm_default:
        external: true
    ```
    
4. **Launch:** Run `docker compose up -d`. You can now access your new dashboard with custom icons at `http://<your-server-ip>:8090`.
    

### Conclusion

Our homelab now has a powerful management and monitoring foundation. Nginx Proxy Manager is ready to direct traffic, Grafana is visualizing our server's health, and Homer provides a central launchpad.

In the next part of the series, we'll deploy our core network service, **AdGuard Home**, and use NPM to create clean, memorable local domains for all the applications we set up today. Stay tuned!