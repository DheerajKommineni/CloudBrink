Cloudbrink's IPSec Peering feature allows administrators to connect remote users to their existing IPSec infrastructure which can be a datacenter or branch IPSec gateway, an SD-WAN cloud gateway or branch edge appliance. Administrators can deploy Cloudbrink for remote users and take advantage of the application performance and zero-trust security capabilities without any change to their existing networking infrastructure and still provide access to the applications in these networks. Cloudbrink Network Firewall as-a-Service Overview Organizations need to provide a high-performance zero-trust access solution to remote users because user productivity is significantly impacted if the applications are responding slowly. Cloud- brink can improve the application performance by overcoming the last-mile networking challeng- es (eg: unreliable networks in hotel, airport, shared home WiFi) and providing best user experience. Administrators want to deploy Cloudbrink for remote users but also want to ensure that this de- ployment is smooth and doesn’t require major changes to their existing networking infrastructure inside their on-prem datacenter or branches. With the Cloudbrink IPSec Peering feature, custom- ers can terminate their remote user connections via Cloudbrink on to their existing IPSec solution that is already deployed inside their datacenters or branches. With this feature, customers can benefit from Cloudbrink application performance improvements, zero-trust security for remote users and with no changes to their existing networking infrastruc- ture. Sample topologies for IPSec Peering Deployments Sample topology-1

Sample topology-2 Sample topology-3 Configuration

**1.** Configure the enterprise-services that represent the networks behind the IPSec Gateway(s) that users need access to. Configure > Resources > Enterprise-Services

**2.** Create a new IPSec Gateway by providing the peer IPSec gateway public IP address(es), primary/ secondary details, cipher suites to be used for IKE and IPSec, DNS and enterprise-services info (created in step-1). Configure > Resources > IPSec Gateways a. Peer Connections b. Tunnel Parameters c. DNS server d. User IP Management

e. Enterprise-services

**3.** Create a new resource-template with the set of applications (application-services and enter- prise-services) that will be enabled to remote users.

### Configure > Resources > Resource Templates

**4.** Assign the resource-template to the appropriate device-user-groups. Configure > Device User Groups > Device User Group Policies

Cloudbrink **Hybrid Access** as a Service

ministrators need to contact Cloudbrink support team to get the public IP information of the Cloudbrink IPSec endpoints. IPSec requires configuration on both sides to create the IPSec tunnels. With the above configuration, remote users belong to “VPN_ODBT” device-user-group can access all subnets defined under “IPSec_resource_template” via the IPSec gateways defined under “IP- Sec_endpoint_DC1”. Support We would love to hear from you! For any questions, concerns, or feedback regarding this feature, please reach out at support@cloudbrink.com

---
  
  **Corporate Headquarters Cloudbrink, Inc.**  
  *530 Lakeside Drive, Suite 190, Sunnyvale, CA 94085*

  <sub>© 2021 Cloudbrink, Inc. All rights reserved. Cloudbrink, the Cloudbrink logo, and all product and service names mentioned herein are registered trademarks or trademarks of Cloudbrink, Inc. in the United States and other countries. All other trademarks, service marks, registered marks, or registered service marks mentioned herein are for identification purposes only and are the property of their respective owners.</sub>