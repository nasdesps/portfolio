---
title: "Dive into AI Fun: Running DeepSeek-R1 on a Docker Container on Ubuntu"
dateString: Feb 2023
draft: false
tags:
  - docker
  - ubuntu
  - AI
  - opensource
  - deepseek-r1
weight: 110
cover:
    image: "/projects/deepseek-r1-docker/docker-ai.png"
---

# What's a Docker Container?

Before we dive into setting up DeepSeek-R1, let me explain what a Docker container is. Imagine you have a toy that works perfectly on your birthday but gets broken if you move it to another room. A Docker container is like a magic box that keeps your AI model (the toy) in perfect condition wherever you take it, whether it's running as a background task, on a web server, or even in the cloud.

Docker containers encapsulate everything required to run an application: the code, dependencies, and environment settings. This ensures consistency across different machines, which is super important for AI models that rely on precise configurations.

---

# Setting Up The Environment

## Step 1: Install Ubuntu on Windows (If You Haven't Already)

If you're using Windows, the easiest way to get an Ubuntu environment is through the Microsoft Store. Here's how:
1. Open the Microsoft Store and search for Ubuntu.
2. Click Get and let it install.
3. Once installed, open Ubuntu from the Start menu and follow the setup instructions.
4. Update the system:

```
sudo apt update && sudo apt upgrade
```

Now, you have an Ubuntu terminal running on Windows!

---

## Step 2: Install Docker (If You Haven't Already)

First, let's check if you have Docker installed. Open a terminal and run:
```
docker --version
```
If that returns a version number, congrats! If not, install Docker:
```
sudo apt update && sudo apt install docker.io -y
sudo systemctl enable --now docker
```

---

## Step 3: Prerequisites for NVIDIA GPU

Install NVIDIA Container Toolkit:

- Configuring the production repository:

```
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
&& curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
```

- Update the package list:

```
sudo apt-get update
```

- Install the NVIDIA Container Toolkit:

```
sudo apt-get install -y nvidia-container-toolkit
```

---
# Running Ollama Inside Docker

Run these commands(P.S. shoutout to NetworkChuck):
```
docker run -d \
--gpus all \
-v ollama:/root/.ollama \
-p 11434:11434 \
--security-opt=no-new-privileges \
--cap-drop=ALL \
--cap-add=SYS_NICE \
--memory=8g \
--memory-swap=8g \
--cpus=4 \
--read-only \
--name ollama \
ollama/ollama
```

---
# Running DeepSeek-R1 Locally

Time to bring DeepSeek-R1 to life locally and containerized:
```
docker exec -it ollama ollama run deepseek-r1
```
or you can run other versions of deepseek-r1 just by typing in the version at the end after a colon(:)
```
docker exec -it ollama ollama run deepseek-r1:7b
```

After this, play around with the AI, if you wanna exit just type: 
```
/bye
```

# Starting Deepseek-R1

To Start Deepseek-R1 from next time go to Ubuntu and type:
```
docker start ollama
```
this will start ollama docker container; then type:
```
docker exec -it ollama ollama run deepseek-r1:7b
```