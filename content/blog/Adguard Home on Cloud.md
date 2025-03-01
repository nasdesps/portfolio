---
title: Running Private Adguard Server on Cloud (Linode)
dateString: Feb 2023
draft: false
tags:
  - adguard
  - cloud
  - linode
  - DNS
  - DoH
weight: 102
cover:
  image: "/blog/adguard-linode/adguard_cover.jpg"
---


# What's the buzz about AdGuard Home?

Imagine AdGuard Home as your personal internet guardian. This versatile tool blocks ads, trackers, and other online nuisances across all devices connected to your network. Whether you're browsing on your phone, tablet, or computer, AdGuard Home has your back.

In today's digital landscape, robust security measures are paramount. Protecting each device shields your family from accidental clicks and malicious attacks, ensuring peace of mind and a secure online environment.

---

# Why on the Cloud?

While setting up AdGuard Home on your home network is great, installing it on a cloud server like Linode takes things up a notch. Here's why:

- **On-the-Go Protection**: Your devices stay protected from ads and trackers, no matter where you are, you can even share it with your family.
- **Centralized Control**: Manage and customize your ad-blocking settings from a single dashboard.
- **Enhanced Privacy**: Keep your browsing data away from prying eyes.

Ready to embark on this ad-free adventure? Let's get started!

---

# Setting Up The Environment

## Step 1: Create a Linode Cloud Account

Why choose Linode? Through [NetworkChuck's referral link](https://linode.com/networkchuck), you receive a generous $100 cloud credit - a fantastic start!

- **Sign Up**: Navigate to [Linode's signup page](https://linode.com/networkchuck) and register.
- **Access the Dashboard**: Log in and select 'Linodes' from the left-side menu.
- **Create a Linode**: Click 'Create Linode,' choose your preferred region, and select an operating system (Debian 11 is a solid choice).
![Create a Linode](/blog/adguard-linode/create_linode.jpg)
- **Choose a Plan**: The Shared 1GB Nanode instance is sufficient for AdGuard Home.
- **Label and Secure**: Assign a label to your Linode and set a strong root password.
- **Deploy**: Click 'Create Linode' and wait for it to initialize.

Once your Linode is up and running, access it via the LISH Console or SSH. (use root as localhost login)

---

## Step 2: Installing AdGuard Home on Linode

Yes, we're already into setting up at this point. 
1. **Log In**: Access your Linode using SSH or the LISH Console with your root credentials.
2.  Update the system:
```
sudo apt update && apt upgrade -y
```
3. Go ahead and copy this command to Install Adguard Home:
```
curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v
```

AdGuard Home is installed and running. You can use **CTRL+Shift+V** to paste into the terminal.

---

## Step 3: Configure AdGuard Home

Post-installation, you'll see a list of IP addresses with port `:3000`.
![IP Adguard](/blog/adguard-linode/ip_adguard.jpg)
1. **Access the Web Interface**: Open your browser and navigate to the IP address followed by `:3000`. If you encounter a security warning, proceed by clicking "Continue to site."
2. **Initial Setup**: Click 'Get Started' and follow the prompts. When uncertain, default settings are typically fine.
3. **Set Credentials**: Set up the Username and Password.

---

## Step 4: Integrate AdGuard Home with Your Router

After this your AdGuard Home is running, but in order to use it on your devices you need to setup inside your home router for all your devices to be protected. For that, I can't walk you through each and every router settings, but the steps are pretty similar. 

1. Find your router IP address, you should be able to find it on the back of your router (commonly 192.168.0.1 or 192.169.1.1) enter it into your browser.
2. Login into your router using the credentials mentioned in the back of your router; the default is often admin for both username and password. I suggest you change your default password.
3. **Configure DNS Settings**:
	- **Enable DHCP Server**: Ensure your router's DHCP server is active.
	- **Set DNS Addresses**: Input your AdGuard Home server's IP as the primary DNS (mine was 96.126.113.207). For secondary DNS, options like `1.1.1.1` (Cloudflare), `9.9.9.9` (Quad9), or `8.8.8.8` (Google) are reliable.
	- Save and apply the changes.

---

# Fine-Tuning AdGuard Home

If you've done everything till here you should be good, but for those who enjoy customization, AdGuard Home offers a plethora of settings. Some of the customization I did are:

## Settings
- Go to Settings -> General Settings: You can enable Parental Control and Safe Search.
- You can also make your Statistics last longer than 24hrs which is default.
- Now on Settings -> DNS Settings
	- By default it uses DNS from quad9 which is pretty good but I suggest you add more.
	- You can click on list of known DNS providers, where you can choose from.
	- I used: 
		 - https://dns.quad9.net/dns-query
		 - https://dns.google/dns-query
		 - https://dns.cloudflare.com/dns-query
	- Enable 'Load Balancing' to distribute queries evenly.
	- Scroll down to 'DNS server configuration' and enable DNSSEC for enhanced security.
	- Click on Save.

---

## Filters

### DNS blocklists
Go to Filters -> DNS blocklists, here you can add blocklist that people have created and use it to block even more things. By default AdGuard uses AdGuard DNS filter, and you can add more.
- Click on Add blocklist -> Choose from the list
- Don't choose too many from the list cause it may slow your internet requests.
![DNS blocklists](/blog/adguard-linode/dns_blocklists.png)
These are the blocklists I added. And just like that you are blocking more and more things.

### DNS rewrites
Go to Filters -> DNS rewrites, here you can add your own DNS entries, so I added AdGuard here.
- Click on Add DNS rewrite
- Type in domain adguardforme.local and your IP address for AdGuard Home.
![DNS rewrites](/blog/adguard-linode/dns_rewrite.jpg)
- And save it.

Now, when I want to go on AdGuard Home dashboard I just type in adguardforme.local and I'm into AdGuard, I don't have to remember the IP address.

### Custom filtering rules
Go to Filters -> Custom filtering rules. For some reason when I use Facebook on mobile device stories and videos does not load up, so I added custom filtering rules.

```
@@||graph.facebook.com^$important
```