### Connector **Deployment** Guide - Hyper-V

Cloudbrink's **Hybrid Access** as a Service enables enterprises to deliver best-in-class quality of experience and security for their end users in the new mobile-first and cloud-native world. Cloudbrink achieves this through three simple components:

**1.** The Brink App is installed on end user devices, with all major platforms supported.

**2.** Enterprise access points are automatically created via machine learning in close proximity to the end user, enabling Cloudbrink’s revolutionary overlay protocol to overcome the most challenging last-mile network conditions, delivering best-in-class, hi fidelity quality of experience for the end- user no matter the network they are connected to.

**3.** To provide end-to-end security, a Cloudbrink Connector is deployed in the customer’s data center or cloud environment, creating a dark tunnel connection from the end user to their applications. This document covers deploying the Cloudbrink Connector in an Hyper-V environment.

## Introduction

![Diagram 1](/api/images/Connector_Deployment_Guide_HyperV/img-009.png)

This document will guide in creating the Cloudbrink Connector(s) in Hyper-V.

## Prerequisites

- Hyper-V Image Provided from Cloudbrink
- Cloud-Init ISO generated from: cloudinit.cloudbrink.pro
- Networking:
- Outbound ports 443, 9090 (TCP), and 9993-4 (UDP) to Cloudbrink SaaS and Edges
**Connector VM** Requirements

### Overall Connector

### Throughput vCPU RAM Disk Expected no. of concurrent user sessions

0.5-to-2 Gbps 4 8GB 50GB 400 sessions; 5Mbps/session avg throughput 2-to-4 Gbps 8 16GB 50GB 800 sessions; 5Mbps/session avg throughput 4-to-7 Gbps 16 32GB 50GB 1400 sessions; 5Mbps/session avg throughput

### **Create** Connector Portal **Configuration**

When deploying a connector on any platform, you need to pre-stage the configuration in your Tenant first. Start by publishing at least 1 Enterprise Service.

**1.** Navigate to Configure > Resources > Enterprise Services.

**2.** Expand the window and click the symbol in the bottom right corner.

**3.** Provide a Name, Domain and Brink VNET. Multiple Domains or Brink VNET’s may be specified for the Enterprise Service. a. Server initiated connections allow tools like InTune or JAMF to initiate a connection to users running Cloudbrink b. By default, only inbound traffic from Agents is allowed.

**4.** Once complete click the check mark in the upper right corner.

**5.** Navigate to Configure > Resources > Connectors, and select ADD from the menu. Fill in the necessary fields. a. Name: Provide a name for the Connector b. Hosting Environment: Choose the platform. In this case Private for Hyper-V c. **Deployment** Mode: Choose non-ha for stand-alone appliance or active-standby if you plan to deploy them in a pair d. Region: private e. DNS Servers: Provide a primary and secondary DNS server f. **Deployment** Mode: Select if you'd like to use DHCP or SourceNAT for client connections g. Enterprise Resources: Add the enterprises resources you would like to access through the connector

**6.** Click the in the upper right corner when finished.

**7.** After you have saved your Connector configuration click the key symbol in the upper right corner to generate your Connector Key. Save this key, as you will need this when creating the

CloudInit ISO. a. If generating an HA Pair, click the key again to generate a second separate key. Deploy Connector in Hyper-V:

**1.** From Hyper-V Manager, select action > new > Virtual Machine

**2.** Name the virtual machine appropriately and click next

**3.** Select Generation 1, and click next

**4.** Configure the desired memory based on the desired performance in the earlier table

**5.** Select the desired network for outbound connectivity

**6.** Select "Use and existing virtual hard disk, and select the .vhd disk image provided from Cloudbrink

**7.** Proceed to the summary page, and hit finish to deploy the VM.

**8.** Before powering on, right click the deployed VM and select settings

**9.** Select the Hard Drive, and click edit on the right hand window

**10.** On the select hard disk, click next, and then expand

**11.** Expand the disk to 50 GiB. Click next and finish.

**12.** Under DVD Drive, mount the Cloudinit ISO generated from the cloudinit.cloudbrink.pro page

**13.** Start the connector Virtual Machine

Cloudbrink **Hybrid Access** as a Service

The following steps may be taken to verify the connector is online and able to successfully pass trafic.
- Navigate to the admin portal, then Configuration > Resources > Connectors > The newly
created connector should show as "Active," with its IP address in green. If an HA pair has been deployed, both IPs will be displayed, with the "Active" IP in green.
- If the connector does not progress to the "Active" state from "Configured", the most common
issues are due to outbound connectivity not establishing, or with and invalid or expired OTP being used.
- If after verifying those things have been configured correctly, please reach out to support at the
address below to assist.

## Support Information

We would love to hear from you! For any questions, concerns, or feedback regarding deploying Hyper-V connectors, please reach out at support@cloudbrink.com

---
  
  **Corporate Headquarters Cloudbrink, Inc.**  
  *530 Lakeside Drive, Suite 190, Sunnyvale, CA 94085*

  <sub>© 2021 Cloudbrink, Inc. All rights reserved. Cloudbrink, the Cloudbrink logo, and all product and service names mentioned herein are registered trademarks or trademarks of Cloudbrink, Inc. in the United States and other countries. All other trademarks, service marks, registered marks, or registered service marks mentioned herein are for identification purposes only and are the property of their respective owners.</sub>