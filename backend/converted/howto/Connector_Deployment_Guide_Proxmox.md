Connector Deployment Guide - Proxmox | 1Hybrid Access as a Service

### Connector Deployment Guide - Proxmox

Cloudbrink's Hybrid Access as a Service enables enterprises to deliver best-in-class quality of experience and security for their end users in the new mobile-first and cloud-native world.

### Cloudbrink achieves this through three simple components:

1. The Brink App is installed on end user devices, with all major platforms supported. 2. Enterprise access points are automatically created via machine learning in close proximity to the end user, enabling Cloudbrink’s revolutionary overlay protocol to overcome the most challenging last-mile network conditions, delivering best-in-class, hi fidelity quality of experience for the end- user no matter the network they are connected to. 3. To provide end-to-end security, a Cloudbrink Connector is deployed in the customer’s data center or cloud environment, creating a dark tunnel connection from the end user to their applications.

## Introduction

This document will guide in deploying Cloudbrink Connector(s) in Proxmox.

## Prerequisites

- Proxmox Hypervisor Deployed
- Proxmox Connector Image
- Cloudinit ISO - Generated here: https://cloudinit.cloudbrink.pro
- IP, Netmask, Gatway, and DNS information for Cloudbrink Connector VM(s)
- Outbound ports 443, 9090 (TCP) and 9993/9994 UDP to Cloudbrink SaaS and Edges
Connector VM Requirements

### Overall Connector

Throughput vCPU RAM Disk Expected no. of concurrent user sessions 0.5-to-2 Gbps 4 8GB 50GB 400 sessions; 5Mbps/session avg throughput 2-to-4 Gbps 8 16GB 50GB 800 sessions; 5Mbps/session avg throughput 4-to-7 Gbps 16 32GB 50GB 1400 sessions; 5Mbps/session avg throughput

### Create Connector Portal Configuration

When deploying a connector on any platform, you need to pre-stage the configuration in your Tenant first. Start by publishing at least 1 Enterprise Service. 1. Navigate to Configure > Resources > Enterprise Services.

Connector Deployment Guide - Proxmox | 2Hybrid Access as a Service 2. Expand the window and click the symbol in the bottom right corner. 3. Provide a Name, Domain and Brink VNET. Multiple Domains or Brink VNET’s may be specified for the Enterprise Service. a. Server initiated connections allow tools like InTune or JAMF to initiate a connection to users running Cloudbrink b. By default, only inbound traffic from Agents is allowed. 4. Once complete click the check mark in the upper right corner. 5. Navigate to Configure > Resources > Connectors, and select ADD from the menu. Fill in the necessary fields. a. Name: Provide a name for the Connector b. Hosting Environment: Choose the platform. In this case Private for Proxmox c. Deployment Mode: Choose non-ha for stand-alone appliance or active-standby if you plan to deploy them in a pair d. Region: private e. DNS Servers: Provide a primary and secondary DNS server f. Deployment Mode: Select if you'd like to use DHCP or SourceNAT for client connections g. Enterprise Resources: Add the enterprises resources you would like to access through the connector 6. Click the in the upper right corner when finished.

Connector Deployment Guide - Proxmox | 3Hybrid Access as a Service 7. After you have saved your Connector configuration click the key symbol in the upper right corner to generate your Connector Key. Save this key, as you will need this later in the deployment process. a. If generating an HA Pair, click the key again to generate a second separate key.

### Deploy Connector Services from Proxmox:

1. Download and extract the connector file provided from Cloudbrink. 2. Using your preferred copy method, copy only the .qcow2 disk file into the template directory in Proxmox. Below is an example using SCP from the source machine copying into the proxmox host. scp ~/Downloads/connector-ubuntu-2004-amd64-v13.4.21/image/connector-latest.qcow2 root@ proxmox://var/lib/vz/template/qcow/connector-latest.qcow2 connector-latest.qcow2 100% 2997MB 15.0MB/s 03:20

Connector Deployment Guide - Proxmox | 4Hybrid Access as a Service 3. SSH to the proxmox host and verify the md5sum to ensure it matches.

### Note: This will vary depending on version:

root@proxhost:~# md5sum /var/lib/vz/template/qcow/connector-latest.qcow2 3e666c2284ac2a398243625400043aa9 /var/lib/vz/template/qcow/connector-latest.qcow2 4. Deploy a new VM in Proxmox 5. Name it appropriately. To make sure it is always available after host restarts, ensure "Start at boot" is checked 6. Under OS, select the Cloudinit .iso file you created earlier

Connector Deployment Guide - Proxmox | 5Hybrid Access as a Service 7. Under disks, remove the existing scsi0 disk 8. Configured the CPU based on the desired performence detailed in the above table. Minimum 4 CPU's should be configured. For optimal performance, consider changing the CPU type to "host".

Connector Deployment Guide - Proxmox | 6Hybrid Access as a Service 9. On the network tab, ensure the "Firewall" box is unchecked. 10. Continue to the confirmation screen. Ensure "Start after created" is not checked. Confirm all other settings as well. Note the "vmid" number that will be created as you will need that in the next step. 11. From an SSH or Console session to the proxmox host, run the below command to copy the disk image to the VM. qm importdisk <vmid> /var/lib/vz/template/qcow/connector-latest.qcow2 <storage> Example: qm importdisk 123 /var/lib/vz/template/qcow/connector-latest.qcow2 local-lvm 12. Once the disk image is completed, navigate back to the Proxmox UI. Select your VM, then select Hardware, and double click on the "Unused Disk".

Connector Deployment Guide - Proxmox | 7Hybrid Access as a Service 13. Click "Add" to make the disk active. 14. Select the disk, and towards the top, click "Disk Action" and "Resize". 15. Under size increment, type in "40" to incease the disk size from 10 GiB to 50 GiB in total

Connector Deployment Guide - Proxmox | 8Hybrid Access as a Service 16. Select "Options" on the left hand side panel. Then double click on "Boot Order". Check the box for the scsi0 disk drive, and uncheck the box for the virtio network interface. 17. Power on the VM.

Cloudbrink Hybrid Access as a Service

### Deployment Verification

The following steps may be taken to verify the connector is online and able to successfully pass trafic.
- Navigate to the admin portal, then Configuration > Resources > Connectors > The newly
created connector should show as "Active," with its IP address in green. If an HA pair has been deployed, both IPs will be displayed, with the "Active" IP in green.
- If the connector does not progress to the "Active" state from "Configured", the most common
issues are due to outbound connectivity not establishing, or with and invalid or expired OTP being used.
- If after verifying those things have been configured correctly, please reach out to support at the
address below to assist.

### Support Information

We would love to hear from you! For any questions, concerns, or feedback regarding deploying Proxmox connectors, please reach out at support@cloudbrink.com