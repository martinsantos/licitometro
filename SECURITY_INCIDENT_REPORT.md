# Security Incident Report — VPS srv1342577.hstgr.cloud

**Date:** March 24, 2026
**Account:** Hostinger VPS — IP 76.13.234.213
**Domain:** licitometro.ar
**Reported issue:** Server suspended due to malware detection
**Conclusion:** Residual crypto miner configuration found and removed. No active malware running. Root cause was SSH brute-force attack exploiting Hostinger's default cloud-init configuration (`PasswordAuthentication yes` + `almalinux ALL NOPASSWD:ALL`). Comprehensive hardening applied. Full scans clean.

---

## 1. Investigation Summary

Upon receiving the malware notification, we conducted a full security audit including:

- Process inspection for known miner signatures (xmrig, minerd, kdevtmpfsi, kinsing)
- ClamAV antivirus scan (168,277 files, 6.5GB)
- Rootkit Hunter (rkhunter) scan
- All outbound network connections
- All crontabs (root and system)
- SSH authorized keys audit
- Filesystem analysis (modified files, /tmp, /dev/shm, setuid binaries)
- Docker containers and images
- SSH authentication logs

---

## 2. Findings

### 2.1 XMRig Crypto Miner Artifacts (REMOVED)

Residual files from the **XMRig 6.25.0** Monero crypto miner were found:

| File | Type | Created | Owner |
|------|------|---------|-------|
| `/usr/bin/.config.json` | XMRig configuration | Feb 27, 2026 | root |
| `/usr/bin/xmrig-6.25.0/` | Empty directory (binary already removed) | Feb 27, 2026 | almalinux |

**Configuration contents** (preserved as evidence in `/root/EVIDENCE_miner_config_20260324.json`):
```json
{
  "pools": [{
    "url": "pool.supportxmr.com:3333",
    "user": "89Ad4pKMNaaUBVBwNSdHRv9uA9MZMsHisME8nqXCSavQGCa8H22t7dBREHPSuXEFauczZmF5F6dd7KwEQ1FJCEho6DaKfKK",
    "enabled": true
  }],
  "cpu": { "enabled": true },
  "randomx": { "mode": "auto" }
}
```

**Status:** The miner binary was NOT running at the time of investigation. The binary had been removed (empty directory remained). Only the configuration file persisted. Both have been removed.

### 2.2 Root Cause: Vulnerable Cloud-Init Defaults

The compromise vector was Hostinger's default cloud-init provisioning:

| Vulnerability | File | Impact |
|--------------|------|--------|
| `PasswordAuthentication yes` | `/etc/ssh/sshd_config.d/50-cloud-init.conf` | Allowed password brute-force |
| `almalinux ALL=(ALL) NOPASSWD:ALL` | `/etc/sudoers.d/90-cloud-init-users` | Any login = instant root |
| `PermitRootLogin yes` | `/etc/ssh/sshd_config` | Direct root password attempts |
| No fail2ban | — | No brute-force protection |

**Attack chain:** SSH brute-force → password guessed for `almalinux` → `sudo` without password → root → XMRig installed on Feb 27, 2026.

### 2.3 SSH Brute-Force Attack

Detected from IP **171.231.181.57** (Vietnam), attempting hundreds of common usernames:

```
mms, sergey, super, admin, cisco, test, user, tushar, master, db2inst2, ...
```

### 2.4 Unidentified SSH Key (REMOVED)

An SSH key without identification label was found in root's authorized_keys:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILzoNOiTmlWlB0tGrL7CPjHGSX+VeoOkDqeLjAeWfQwU
Fingerprint: SHA256:po9SzNdFeZY77d5wLNkx80bjjyF+bn2wveAS2j60zek
```
Removed as precaution. May have been added by the attacker for persistent access.

---

## 3. Scan Results

### 3.1 ClamAV Antivirus Scan

```
Engine version: 1.4.3
Known viruses: 3,627,733
Scanned files: 168,277
Data scanned: 6,508.68 MB
Infected files: 0
Scan date: 2026-03-24 08:47–09:09 (21m 42s)
```

**Result: CLEAN — zero infections found.**

### 3.2 Rootkit Hunter (rkhunter) Scan

```
Rootkit Hunter version: 1.4.6
Rootkits checked: ~370 known rootkits
```

| Check | Result |
|-------|--------|
| Known rootkits (AjaKit, Adore, BeastKit, BOBKit, etc.) | Not found |
| Suspicious files | `/usr/bin/.config.json` flagged (XMRig config — removed) |
| System binary integrity | Clean |
| Hidden processes | None |
| Network interfaces (promiscuous mode) | Clean |

**Result: No rootkits detected.** Only warnings were the already-removed miner config and standard `egrep` deprecation notices.

### 3.3 Process and Network Audit

| Check | Result |
|-------|--------|
| Running crypto miners | **None** |
| Suspicious outbound connections | **None** (only Telegram API, GitHub, user SSH) |
| Malicious crontabs | **None** |
| Unauthorized systemd services | **None** |
| Non-standard setuid binaries | **None** |

---

## 4. Remediation Actions

All actions performed March 24, 2026.

### 4.1 Malware Removal

| Action | Detail |
|--------|--------|
| Removed XMRig config | `/usr/bin/.config.json` → evidence preserved |
| Removed XMRig directory | `/usr/bin/xmrig-6.25.0/` → evidence preserved |
| No running miner to kill | Binary already absent |

### 4.2 SSH Hardening

| Setting | Before | After |
|---------|--------|-------|
| `PasswordAuthentication` | `yes` (cloud-init default) | **`no`** |
| `PermitRootLogin` | `yes` | **`prohibit-password`** (key-only) |
| `MaxAuthTries` | `6` (default) | **`3`** |
| `PermitEmptyPasswords` | default | **`no`** |

Fixed in both `/etc/ssh/sshd_config` AND `/etc/ssh/sshd_config.d/50-cloud-init.conf` (which was overriding the main config).

### 4.3 User Security

| Action | Detail |
|--------|--------|
| `almalinux` account locked | `usermod -L almalinux` |
| `almalinux` shell disabled | Set to `/usr/sbin/nologin` |
| `almalinux` SSH keys removed | `/home/almalinux/.ssh/authorized_keys` deleted |
| `almalinux` sudo removed | `/etc/sudoers.d/90-cloud-init-users` moved to evidence |
| Duplicate SSH key removed | Key #5 (duplicate cotiza-deploy) |
| Unidentified SSH key removed | Key #6 (no label, possible attacker persistence) |

### 4.4 Intrusion Prevention

| Tool | Configuration |
|------|--------------|
| **fail2ban 1.1.0** | Installed, enabled, running |
| Jail: sshd | `maxretry=3`, `bantime=86400` (24h), `findtime=600` (10min) |
| Backend | systemd |
| Action | firewallcmd-rich-rules |

### 4.5 Scanning Tools Installed

| Tool | Version | Purpose |
|------|---------|---------|
| ClamAV | 1.4.3 | Antivirus scanning |
| Rootkit Hunter | 1.4.6 | Rootkit detection |
| fail2ban | 1.1.0 | Brute-force prevention |

---

## 5. Authorized SSH Keys (post-cleanup)

```
1: santosma@MacBookProMartin          — Developer (legitimate)
2: licitometro-deploy                 — CI/CD production (legitimate)
3: backup-sync-to-hostinger           — Backup sync (legitimate)
4: cotiza-deploy@github-actions       — CI/CD cotizar (legitimate)
```

---

## 6. Evidence Preserved

All removed artifacts are preserved in `/root/` for forensic reference:

```
/root/EVIDENCE_miner_config_20260324.json    — XMRig pool configuration
/root/EVIDENCE_xmrig_dir_20260324/           — Empty XMRig directory
/root/EVIDENCE_sudoers_cloud_init_20260324   — Original NOPASSWD sudoers
/root/.ssh/authorized_keys.bak              — Original authorized_keys (6 keys)
/etc/ssh/sshd_config.bak.202603240758       — Original sshd_config
```

---

## 7. Post-Remediation Verification

```
$ sshd -T | grep passwordauthentication
passwordauthentication no

$ fail2ban-client status sshd
Currently banned: 0

$ clamscan summary
Infected files: 0 (168,277 scanned)

$ rkhunter --check
No rootkits found

$ ps aux | grep xmrig
(no results)

$ grep almalinux /etc/passwd
almalinux:x:1000:1000:Cloud User:/home/almalinux:/usr/sbin/nologin
```

---

## 8. Recommendations to Hostinger

1. **Reactivate the server.** The miner artifacts have been removed, comprehensive hardening applied, and full antivirus + rootkit scans confirm the system is clean.

2. **Fix cloud-init defaults.** The root cause was Hostinger's provisioning template:
   - `/etc/ssh/sshd_config.d/50-cloud-init.conf` ships with `PasswordAuthentication yes`
   - `/etc/sudoers.d/90-cloud-init-users` gives `almalinux ALL=(ALL) NOPASSWD:ALL`
   - This combination makes every new VPS instantly vulnerable to SSH brute-force → root compromise.

3. **Ongoing monitoring.** fail2ban, ClamAV, and rkhunter are now installed for continuous protection.

---

## Contact

**Project:** Licitómetro — Public procurement monitoring platform (licitometro.ar)
**Responsible:** Martin Santos
**Email:** (account holder email)

We request the immediate reactivation of the server. The security incident has been fully investigated, all malware artifacts removed, and the system hardened against the attack vector.
