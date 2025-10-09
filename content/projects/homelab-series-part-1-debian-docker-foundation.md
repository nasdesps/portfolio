---
title: "Part 1: Reviving an Old Laptop with Debian & Docker"
dateString: Sep 2025
draft: false
tags:
  - Homelab
  - Debian
  - Docker
  - Docker Compose
  - Self-Hosting
  - Linux
  - Server
  - Firewall
  - UFW
  - SSH
  - Opensource
weight: 103
cover:
  image: "/projects/homelab-part1/laptop_server.png"
---

### Introduction

Welcome to the first post in my new homelab series! I've always been fascinated by self-hosting and DevOps, and I believe the best way to learn is by doing. In this series, I'll document my journey of turning an old, unused laptop into a powerful, efficient, and secure bare-metal server for hosting a variety of network services.

The goal for this first part is to lay a solid foundation. We'll take an old laptop, install a minimal and stable Linux operating system, perform some initial security hardening, and set up Docker as our containerization engine. By the end of this post, we'll have a perfect blank canvas ready for the exciting services we'll deploy in the upcoming parts.

---

### 1. Choosing the Hardware & OS

#### Why an Old Laptop?
Before diving in, why use an old laptop instead of a Raspberry Pi or a dedicated server? For a starter homelab, a laptop has three huge advantages:
* **Cost-Effective:** It's free if you have one lying around!
* **Built-in UPS:** The battery acts as a built-in Uninterruptible Power Supply (UPS), keeping the server running through short power outages.
* **Low Power Consumption:** Laptop hardware is designed to be power-efficient, which is great for a device that will be running 24/7.

#### Why Debian 13 "Trixie"?
For the operating system, I chose Debian. It's renowned for its stability, security, and massive package repository. It’s the bedrock of many other distributions (like Ubuntu) and is perfect for a server because it's lightweight and doesn't include unnecessary software. We'll be using the minimal "net-install" to ensure we only install what we absolutely need.

---

### 2. Installation and Network Configuration

The installation process is straightforward, but the network setup is key to a reliable server.

#### Minimal Installation
1. **Create a Bootable USB:** I downloaded the Debian 13 "netinst" ISO from the official website and used Rufus on Windows to create a bootable USB drive.
2. **Boot from USB:** I plugged the USB into the laptop and booted from it (usually pressing **F12**, **F2**, or **Esc** during startup to select the USB device).
3. **Language, Location, and Keyboard:** Selected English, United States, and the default keyboard layout.
4. **Network Setup:** Connected the laptop to my home network (Ethernet preferred for stability).
5. **Hostname & Domain:** Entered a short, memorable hostname for the server (e.g., `homelab`) and left the domain blank.
6. **User Accounts:**
   - Set a **root password**.
   - Created a non-root **regular user** (this will be used for daily management).
7. **Partition Disks:** Chose **Guided – use entire disk** with **separate /home partition**. This is simpler for a server setup.
8. **Software Selection:** At the “Software selection” screen:
   - **Unchecked** “Debian desktop environment”
   - **Checked** “SSH server” and “standard system utilities”
   - This ensures a clean command-line system that can be accessed remotely.
9. **GRUB Bootloader:** Installed GRUB on the primary drive (so the system boots correctly).
10. **Finish Installation:** Removed the USB drive when prompted and rebooted into the fresh Debian install.

#### Setting a Static IP
A server needs a permanent, unchanging IP address. The best way to do this is with **DHCP Reservation** on your router. This tells your router to always assign the same IP address to your server's unique MAC address.

First, find your laptop’s current IP address and network interface name by running:

```bash
ip a
```

You’ll see output similar to:

```
2: enp3s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    inet 192.168.0.45/24 brd 192.168.0.255 scope global dynamic enp3s0
       valid_lft 86396sec preferred_lft 86396sec
```

In this example:
- **Interface name:** `enp3s0`
- **Current IP:** `192.168.0.45`
- **MAC address:** shown under `link/ether` in the same section.

With this info, log into your router’s admin panel, find the "DHCP Reservation" or "Static Leases" section, and assign a memorable IP address (e.g., `192.168.0.45`) to your server’s MAC address.  

This ensures the server always gets the same IP from your router, making it easy to find on your network.

#### Connecting Remotely with SSH
With a static IP set, all future management will be done remotely using an SSH client. For Windows, I highly recommend **Solar-PuTTY**. I created a new session, entered the server's static IP address, my username, and password, and connected.

---

### 3. Initial Server Hardening

With a remote SSH session active, the first thing to do is secure the server and configure it for its headless role.

#### Update the System
First, let's make sure all packages are up to date.

```bash
sudo apt update && sudo apt upgrade -y
```

#### Configure the Firewall
`ufw` (Uncomplicated Firewall) is perfect for a simple setup. We'll set it to deny all incoming traffic by default and only allow SSH connections.

```bash
# Install UFW
sudo apt install ufw -y

# Allow SSH connections
sudo ufw allow ssh

# Enable the firewall
sudo ufw enable
```

#### Configure Lid-Close Action
To ensure the laptop keeps running when the lid is closed, we edit the `logind.conf` file.

```bash
sudo nano /etc/systemd/logind.conf
```

Uncomment the line:

```
HandleLidSwitch=ignore
```

Save the file, then restart the service:

```bash
sudo systemctl restart systemd-logind.service
```

---

### 4. Installing the Containerization Engine: Docker

Instead of installing applications directly on our host, we'll use Docker to keep the system clean and make management easier.

#### Install Docker Engine
The official convenience script is the easiest way to get the latest version.

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

#### Add User to Docker Group
To run docker commands without `sudo`, add your user to the docker group. The `$USER` variable automatically uses the currently logged-in user.

```bash
sudo usermod -aG docker $USER
```

After this, log out and log back in for the change to take effect.

#### Install Docker Compose
Docker Compose is essential for managing multi-container applications with a simple YAML file.

```bash
sudo apt install docker-compose-plugin -y
```

To verify the installation:

```bash
docker compose version
```

---

### Conclusion

And that's it for Part 1! We've successfully turned an old piece of hardware into a hardened, modern server running Debian and Docker with a reliable network configuration. We have a solid and secure foundation to build upon.

In the next part of the series, we'll deploy our first critical service: a local, network-wide ad-blocking DNS resolver using AdGuard Home. Stay tuned!
