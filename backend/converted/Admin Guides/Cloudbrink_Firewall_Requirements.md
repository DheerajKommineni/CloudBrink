Cloudbrink Firewall Requirements | 1Hybrid Access as a Service

### Cloudbrink Firewall Requirements

Cloudbrink's high-performance Zero-Trust Security solution helps enterprises to safeguard their users and applications from unauthorized access as well as external threats. Cloudbrink secures all types of applications (protocol agnostic) that are hosted anywhere – SaaS, private apps hosted inside physical on-premises or public/private cloud IaaS. While delivering a very strong security stack, Cloudbrink also improves the quality of experience for users over these enterprise applications by using a unique, innovative performance optimization stack. Enterprises benefit from both strong Zero-Trust Security access and improved application performance benefits.

## Introduction

This document provides the information of the domain-names and protocol/ports that are used by Cloudbrink components. For a seamless rollout and functionality of Cloudbrink, these firewall requirements should be taken care by the customers.

### Brink App

Brink App communicates with Brink SaaS (control plane) and with Brink FAST Edges (datapath) and requires below firewall settings.

### Source Destination Protocols Ports Domain-Names

Brink App Endpoint Brink SaaS TLS 443 admin.cloudbrink.com wren.cloudbrink.com wrenrobin.cloudbrink.com releases.cloudbrink.com

### Brink App Endpoint Brink Fast Edges UDP 9993 -NA-

Note-1: BrinkAgent is supported on Windows, Mac, Ubuntu, Chromebook, iOS and Andriod Note-2: If any other solutions on the endpoint that performs TLS inspection (ex: SWG, Proxy) are deployed, then Cloudbrink traffic must be added to the exception list of these solutions.

Cloudbrink Hybrid Access as a Service

### Brink Connector

Brink Connector is deployed inside the customer’s premises (physical or cloud datacenters) to provide end- to-end secure access to private applications. Brink Connector uses Software Defined-Perimeter compliant connectivity model where only outbound connections are used to communicate with BrinkSaaS (control place) and Brink FAST Edges (datapath).

### Source Destination Protocols Ports Domain-Names

### Brink Connector Brink SaaS TLS 443 wren.cloudbrink.com

wrenrobin.cloudbrink.com releases.cloudbrink.com

### Brink Connector Brink SaaS TCP 9090 -NA-

### Brink Connector Brink FAST Edges UDP 9993, 9994 -NA-

### Brink Connector Public DNS DNS 53 -NA-

Note-3: If BrinkConnector is deployed behind a NAT device on the datacenter, the BrinkConnector instance internal IP address must be used during the ISO file generation step. The NAT IP address must not be used as BrinkConnector IP during the ISO file generation step.

### Support Information

We would love to hear from you! For any questions, concerns, or feedback regarding the ports or protocols requirements, please reach out at support@cloudbrink.com