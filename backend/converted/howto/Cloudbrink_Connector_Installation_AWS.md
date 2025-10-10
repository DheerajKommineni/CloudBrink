Cloudbrink Connector - AWS

of experience and security for their end users in the new mobile-first and cloud-native world. Cloudbrink achieves this through three simple components: 1. The Brink Agent is installed on end user devices, with all major platforms supported. 2. Enterprise access points are automatically created via machine learning in close proximity to the end user, enabling Cloudbrink’s revolutionary overlay protocol to overcome the most challenging last-mile network conditions, delivering best-in-class, hi fidelity quality of experience for the end-user no matter the network they are connected to. 3. To provide end-to-end security, a Cloudbrink Connector is deployed in the customer’s data center or cloud environment, creating a dark tunnel connection from the end user to their applications. This document covers deploying the Cloudbrink Connector in an AWS environment.

## Introduction

This document will guide you to create a Cloudbrink Connector in AWS. Steps 1 through 14 must be completed twice if deploying an active-standby Connector pair.

## Prerequisites

- An AWS account with necessary quota to deploy one (or two if active-standby pair)
instance(s) with the below compute requirements
- Cloudbrink Connector AMI(s) have been shared your AWS Account (please notify Cloudbrink
if additional regions are required)
- A Connector and corresponding OTP token has been generated in the Cloudbrink Admin
Portal, or alternatively a cloud-init customization script has been separately provided by

### Cloudbrink

Connector VM Requirements
- OS: Ubuntu 20.04
- Compute: c5.xlarge (4 CPU and 8GiB RAM)
- Networking:
○ Inbound port 22 must be open between Connector instances if deploying an active- standby pair ○ Outbound ports 443 (TCP), and 9993-4 (UDP) to Cloudbrink SaaS and Edges
- Username: cbrink (required for hardening scripts)
- User Data cloud-init script

### Create Connector VM from AWS AMI

1. Navigate to the EC2 section of the AWS Console, and under Images in the left pane, select AMIs. 2. Search for the Connector AMI ID provided separately via email, and click the blue Launch button. 3. On Step 2: Choose an Instance Type, select c5.xlarge, and click the gray Next: Configure Instance Details button. 4. On Step 3: Configure Instance Details, ensure Number of instances is set to 1, even if deploying an active-standby pair (each instance will have a unique OTP token).

5. Still on Step 3, under the Advanced Details section, paste in the User data script as text, with the appropriate OTP Token for your environment. If unsure of this value, please contact Cloudbrink Support.

**Example Script:**

#cloud-config runcmd: - [bash, /opt/scripts/brink_connector_deploy_cloud.sh, -o, "<OTP_TOKEN>", -a, "1"] 6. Fill out the rest of Step 3 per business requirements, and then click Next: Add Storage. 7. On Step 4: Add Storage, change the Size value from 8 GiB to 50 GiB. 8. Click the gray Next: Add Tags button. 9. On Step 5: Add Tags, add any required tags per business requirements. 10. Click the gray Next: Configure Security Group button. 11. Configure the instance security group per business requirements. All Connector communication happens in the outboud direction (it must be able to talk outwards to

Cloudbrink Edges and SaaS), so opening inbound ports from the internet is not required. 12. Click the blue Review and Launch button. 13. Ensure all settings match the above steps and business requirements. Click Launch. 14. In the key pair pop-up, either generate a new key pair or use an existing pair for SSH access, per business requirements. The Connector instance is hardened, with SSH only supported for the user cbrink. Click Launch Instance.