Cloudbrink How-To Guide: Publish an App to a User Group Introduction 1 Prerequisites 1 Instructions 2

### Login 2

### Creating a User Group 3

### Application and Enterprise Services 4

### Create an Application Service 5

### Create an Enterprise Service 7

### Create a Resource Template 9

### Assign Resource Template to User Group 11

Published Application Validation 12

## Introduction

Cloudbrink adheres to zero trust network access (ZTNA) philosophy. This means that simply deploying a Brink Connector into your data center or cloud environment does not allow network access to applications within that environment. A Cloudbrink administrator must specifically allow users or user groups to access a given application. This document walks you through publishing an application to a user (group) to permit access to that application.

## Prerequisites

In order to successfully follow this documentation, please ensure the following prerequisites are met: 1.1. An Identity Provider (IDP) has been registered in your Cloudbrink Enterprise Portal 1.2. If publishing an internal application, a Brink Connector has been deployed in your data center or cloud environment 1.3. A Cloudbrink account with Super-Admin or Delegated-Admin privileges

Instructions

### Login

2.1. Navigate to https://admin.cloudbrink.com, and enter your email to be redirected to your organization’s identity provider login.

### Figure 1: Cloudbrink Portal Login

2.2. After a successful login you’ll be redirected to the Cloudbrink Dashboard.

### Figure 2: Cloudbrink Portal Dashboard

### Creating a User Group

As mentioned above, Cloudbrink adheres to zero trust network access principles. In order to assign a user group to an application, the user group must first be defined within the Cloudbrink portal. This user group must exactly match the name of the user group in your associated identity provider. 3.1. In the upper left corner of the Cloudbrink Portal, click either the Gear Icon or the Configure button (depending on whether the left menu is collapsed or expanded, respectively)

### Figure 3: Gear Icon

3.2. There will be four tabs along the top on the page that appears, leave the default User Groups tab selected

### Figure 4: Configure: User Groups

3.3. Expand the User Group section, and then click the teal + icon

### Figure 5: User Groups: User Group

3.4. In the configuration pane that appears, fill in the following information and then click the ✔ icon: 3.4.1. User Group: the exact name of the user group in your identity provider 3.4.2. User Group Description: a friendly description of the user group

### Figure 6: User Group Creation

### Application and Enterprise Services

Under the Configure: Resources section of the Cloudbrink Portal, you’ll notice two entities which have many similarities, Application Services and Enterprise Services. Customer administrators new to Cloudbrink often ask the difference between these two resources, and it comes down to how the resource is able to be accessed: public internet or via a Connector?

### Figure 7: Application Services vs Enterprise Services

Application Services are typically external or SaaS apps that are managed via a third party, and are able to be accessed via the public internet. Enterprise Services are resources that can only be accessed through a Cloudbrink Connector, and typically reside in the customer’s on-premises data center or cloud environment.

### Create an Application Service

An application service in the Cloudbrink context is a publicly accessible application (often provided by a third party), and publishing this application to a user group ensures Cloudbrink applies quality of experience (QoX) optimizations to the application traffic. Some of the most common third party applications are automatically created for every Cloudbrink customer for convenience. If you’ve already created an application in the Cloudbrink Portal or plan on only using the pre-created applications, skip ahead to the Create a Resource Template section to assign the app to a user group. 4.1. In the upper left corner of the Cloudbrink Portal, click either the Gear Icon or the Configure button (depending on whether the left menu is collapsed or expanded, respectively)

### Figure 8: Gear Icon

4.2. On the page that appears, click the Resources tab

### Figure 9: Configure: Resources

4.3. On the page that appears, expand the Application Services section, and click the teal + button Figure 10: Resources: Application Services

4.4. In the configuration pane that appears, fill in the following information and then click the ✔ icon: 4.4.1. Application: a friendly name for this application 4.4.2. App Type: select UCaaS for unified communication applications, or Web-SaaS for all other applications 4.4.3. Port: the port used for this application (optional) 4.4.4. Protocol: the protocol used for this application (udp, tcp, or http) 4.4.5. Domains: any number of fully qualified domain names of this application (at least one domain or IP address must be entered) 4.4.6. IP Addresses: any number of IP addresses of this application (at least one domain or IP address must be entered)

### Figure 11: Application Service Creation

### Create an Enterprise Service

An enterprise service is an individual application in your data center or cloud environment, or internal network(s) that you wish end users to access. For instance, you could add an enterprise service which represents an individual, internally hosted web application (for example 10.0.1.10/32), or an individual network (for example 10.0.1.0/24), or a group of networks (for example 10.0.1.0/24 and 10.0.128.0/20). Publishing an enterprise service requires a Brink Connector, and ensures both quality of experience (QoX) optimizations and end-to-end security through mTLS. If you’ve already created an enterprise service in the Cloudbrink Portal, and are looking to assign the enterprise service to a user group, skip ahead to the next section. 5.1. In the upper left corner of the Cloudbrink Portal, click either the Gear Icon or the Configure button (depending on whether the left menu is collapsed or expanded, respectively)

### Figure 12: Gear Icon

5.2. On the page that appears, click the Resources tab

### Figure 13: Configure: Resources

5.3. On the page that appears, expand the Enterprise Services section, and click the teal + button

### Figure 14: Resources: Enterprise Services

5.4. In the configuration pane that appears, fill in the following information and then click click the ✔ icon: 5.4.1. Name: a friendly name for this enterprise service 5.4.2. Domain: one or more domain names to enable end-users to access the resource(s) in question via hostname(s) 5.4.3. Brink Vnet: one or more IPs or network addresses and subnet masks of the resource, in CIDR notation

### Figure 15: Enterprise Service Creation

### Create a Resource Template

Resource Templates are a way to logically group a set of application and/or enterprise services, based on a set of similar characteristics. For example, you may want to group all unified communication applications into the same resource template. Or you may want to group a set of applications utilized

by your Sales or Engineering teams. A single application or enterprise service can be in any number of resource templates. Once these resources are grouped together in a resource template, you can assign the resource template to a user group for access. If you’ve already created a resource template in the Cloudbrink Portal, and are looking to assign the app to a user group, skip ahead to the next section. 6.1. If you’re not already in the Configure: Resources section, click the Gear Icon in the upper left corner of the portal, and in the page that appears click the Resources tab. 6.2. Expand the Resource Templates section and click the teal + button.

### Figure 16: Resources: Resource Templates

6.3. In the configuration pane that appears, fill in the following information and then click the ✔ icon: 6.3.1. Resource Template: a friendly name for this resource template 6.3.2. Application: optionally select one (or more) application services to be part of this app template 6.3.3. Enterprise Service: optionally select one (or more) enterprise services to be part of this app template 6.3.4. Exception List with QoX: optionally select one (or more) application services to override an enterprise service definition and instead have the application traffic split at the Brink Edge rather than be carried to the Connector (useful for default route 0.0.0.0/0 use cases) 6.3.5. Exception List No QoX: optionally select one (or more) application services to override an enterprise service definition and instead have the application traffic split at the end-user device rather than be carried to the Connector, meaning the application traffic is not handled by Cloudbrink at all (useful for default route 0.0.0.0/0 use cases)

### Figure 17: Create Resource Template

### Assign Resource Template to User Group

Now that we have created our resource template (or a group of applications or enterprise services), we’re ready to assign it to a user group. This enables users that are members of the group to access the applications and enterprise services which belong to the resource template. 7.1. If you’re not already in the Configure section, click the Gear Icon in the upper left corner of the portal, and in the page that appears click the User Groups tab 7.2. Expand the Assign Resource Template section and click the teal + button.

### Figure 18: User Groups: Assign Resource Templates

7.3. In the Assign Resource Template pane that appears, fill in the following information and then click the ✔ icon: 7.3.1. User Group: select the previously created User Group which requires access to the

### Resource Template

7.3.2. Resource Template: select the previously created Resource Template

### Figure 19: Assign Resource Template

### Published Application Validation

8.1. In a workstation of a user that belongs to the previously configured user group, either start the Cloudbrink App, or if already running, restart the Cloudbrink App to pick up the new resource template configuration 8.2. Using a web browser (or your custom application client), enter in the FQDN or IP address of an application that’s part of the previously configured resource template 8.3. Ensure the application is accessible