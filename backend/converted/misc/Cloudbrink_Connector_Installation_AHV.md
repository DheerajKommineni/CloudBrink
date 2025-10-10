Cloudbrink Connector - Nutanix AHV

of experience and security for their end users in the new mobile-first and cloud-native world. Cloudbrink achieves this through three simple components: 1. The Brink Agent is installed on end user devices, with all major platforms supported. 2. Enterprise access points are automatically created via machine learning in close proximity to the end user, enabling Cloudbrink’s revolutionary overlay protocol to overcome the most challenging last-mile network conditions, delivering best-in-class, hi fidelity quality of experience for the end-user no matter the network they are connected to. 3. To provide end-to-end security, a Cloudbrink Connector is deployed in the customer’s data center or cloud environment, creating a "dark cloud" secure connection from the end user to their applications. This document covers deploying the Cloudbrink Connector in an AHV environment.

## Introduction

This document will guide you to create a Cloudbrink Connector (either single or active-standby pair) in AHV. Steps 6 through 16 must be completed twice in order to create two instances for the active-standby pair.

## Prerequisites

- The Connector virtual machine qcow2 disk file should have been provided separately, which
can be re-used for any number of Cloudbrink Connectors
- A Cloud-Init script for static IP and one-time Connector Key should also have been provided
separately
- Nutanix Prism Element admin account to upload the disk image and create virtual
machines

### Connector VM Requirements

- Compute: 4 CPU and 8GB RAM
- Storage: 30 GB Disk
- Networking: Outbound ports 443 (TCP), and 9993-4 (UDP) to Cloudbrink SaaS and Edge IPs

### Connector VM – High Level Instructions

- Upload the provided qcow2 disk file to the AHV Image Service
- Deploy one (non-HA) or two (HA) VMs from the image with the following settings:
○ The above compute resources ○ A cloud-init customization script with desired static IP and Connector Key

### Connector VM – Detailed Instructions

1. Expand the provided tar file via your GUI, or the following CLI command: tar -xzvf connector-v*-kvm.tar.gz 2. Within Prism Element, click the gear icon in the upper right corner, and then Image Configuration along the left column. 3. Click the + Upload Image button within the Image Configuration. 4. Within the Create Image window fill out the following fields and then click Save: A. Name: a friendly name for the Cloudbrink Connector Image B. Annotation: (optional) an annotation per business practices C. Image Type: DISK D. Storage Container: choose per business practices E. Image Source: Upload a file F. Choose File: connector-v*.qcow2

5. Depending upon network speed, wait several minutes for the image to upload and convert to a usable format. Once complete, verify the image is in an Active state. 6. Expand the main menu dropdown in the upper left corner, select VM, and the click + Create VM in the upper right corner. 7. Within the Create VM pop-up, provide a name and description per business practices.

8. Within the Compute Details section, change the vCPU(s) to 4, and the Memory to 8. 9. Click the + Add New Disk button, then fill out the following fields and click Add: A. Type: DISK B. Operation: Clone from Image Service C. Bus Type: SCSI D. Image: Select the image created in step 4 E. Index: Next Available

10. Ensure the Disks appear as below, and leave the Boot Configuration as default. 11. Under Network Adapters, click + Add New NIC. 12. Select the appropriate network under the Network Name dropdown, leave the Connected radio button toggled, and click Add.

13. Enable the Custom Script checkbox, and then select the Type or Paste Script radio button. 14. Within the Type or Paste Script text box, paste in the Cloud-Init script with the correct IP address, subnet mask, default gateway, and OTP values for this Connector. 15. Click Save.

16. Select the Connector VM from the VM table, and then click Power on below the table.