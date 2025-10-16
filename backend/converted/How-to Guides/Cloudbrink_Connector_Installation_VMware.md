### Cloudbrink Connector - VMware ESXi

of experience and security for their end users in the new mobile-first and cloud-native world. Cloudbrink achieves this through three simple components:

**1.** The Brink Agent is installed on end user devices, with all major platforms supported.

**2.** Enterprise access points are automatically created via machine learning in close proximity to the end user, enabling Cloudbrink’s revolutionary overlay protocol to overcome the most challenging last-mile network conditions, delivering best-in-class, hi fidelity quality of experience for the end-user no matter the network they are connected to.

**3.** To provide end-to-end security, a Cloudbrink Connector is deployed in the customer’s data center or cloud environment, creating a "dark cloud" secure connection from the end user to their applications. This document covers deploying the Cloudbrink Connector in a VMware environment.

## Introduction

![Diagram 1](/api/images/Cloudbrink_Connector_Installation_VMware/img-003.png)

This document will guide you to create a Cloudbrink Connector (either single or active-standby pair) in VMware. Steps 9 through 18 must be completed twice in order to create two instances for the active-standby pair.

## Prerequisites

- Connector virtual machine VMDK and OVF files should have been provided separately,
which can be re-used for any number of Cloudbrink Connectors
- A unique cloud-init ISO file for each **Connector VM**, also provided separately via email
- VMware vCenter account with privilege to upload disk images and create virtual machines

### **Connector VM** Requirements

- Compute: 4 CPU and 8GB RAM
- Storage: 50 GB Disk
- Networking: Outbound ports 443 (TCP), and 9993-4 (UDP) to Cloudbrink SaaS and Edge IPs

### **Connector VM** – High Level Instructions

- Deploy 1 (non-HA) or 2 (HA) Connector VMs from provided OVF and VMDK files
- Edit the following settings of the deployed VM(s):
- Hard disk 1 size: 50 GB
- Add CD/DVD drive with provided ISO (unique per VM) attached
- Set forged transmits to Accept on the attached vSwitch

### **Connector VM** – Detailed Instructions

**1.** Navigate to the Storage section of the vCenter UI, and select an appropriate datastore and folder to upload the cloud-init ISO files, per business requirements.

![Diagram 2](/api/images/Cloudbrink_Connector_Installation_VMware/img-010.png)

**2.** Click Upload files, and in your OS file window, select the cloud-init ISO files that were provid- ed to you.

![Diagram 3](/api/images/Cloudbrink_Connector_Installation_VMware/img-013.png)

**3.** Utilizing the dropdown Menu at the vCenter UI, select Content Libraries.

![Diagram 4](/api/images/Cloudbrink_Connector_Installation_VMware/img-015.png)

**4.** Select (or create) the Content Library of your choice.

![Diagram 5](/api/images/Cloudbrink_Connector_Installation_VMware/img-018.png)

**5.** Click Actions and then Import item.

![Diagram 6](/api/images/Cloudbrink_Connector_Installation_VMware/img-021.png)

**6.** In the pop-up, select the Local file radio button, and then click Upload File. In your OS file window, select the Cloudbrink Connector OVF file.

![Diagram 7](/api/images/Cloudbrink_Connector_Installation_VMware/img-023.png)

**7.** Within the Source file details section, click the upload button in the 1 associated file miss- ing row, and in your OS window select the Cloudbrink Connector VMDK file.

**8.** Click the Import button in the lower right corner of the pop-up, and wait for the upload task to complete.

**9.** From within your Content Library, click on the recently uploaded OVF file, then the Actions dropdown, and finally New VM from this Template.

**10.** Name and select the appropriate location to deploy the **Connector VM**, per business require- ments, and then click Next.

**11.** Continue through the deployment wizard, selecting appropriate resources per business re- quirements. On the last step, click Finish.

**12.** Once the VM is deployed, navigate to VMs and Templates, select the recently deployed VM, click Actions, and then Edit Settings.

**13.** Ensure the CPU is set to 4, and the Memory to 8 GB.

**14.** Change the VM's Hard disk 1 size to 50 GB.

**15.** Click the Add New Device button, then CD/DVD Drive.

**16.** Change the newly added CD/DVD Drive dropdown to Datastore ISO file, navigate to and select the uploaded ISO selected in steps 1-2, and click Ok.

**17.** Click to enable the Connect at Power On checkbox in the CD/DVD Drive entry.

**18.** Ensure the Hard disk 1 and the CD/DVD Drive entries appear as in the image below, and then click Ok.

**19.** Navigate to Hosts and Clusters from the vCenter menu, and select the host (or cluster) cho- sen in step 10.

**20.** In the host UI, select the Configure tab, then in the left column under the Networking sec- tion select Virtual Switches.

**21.** In the Virtual Switches table, select the virtual switch chosen in step 10, and then click Edit.

**22.** Select Security from the left column, and ensure Forged transmits are set to Accept.

**23.** Repeat steps 18 through 21 for all vCenter hosts that can host the Connector VMs.

**24.** Navigate back to VMs and Templates, and power on the **Connector VM**(s).

---
  
  **Corporate Headquarters Cloudbrink, Inc.**  
  *530 Lakeside Drive, Suite 190, Sunnyvale, CA 94085*

  <sub>© 2021 Cloudbrink, Inc. All rights reserved. Cloudbrink, the Cloudbrink logo, and all product and service names mentioned herein are registered trademarks or trademarks of Cloudbrink, Inc. in the United States and other countries. All other trademarks, service marks, registered marks, or registered service marks mentioned herein are for identification purposes only and are the property of their respective owners.</sub>