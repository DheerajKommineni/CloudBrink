### Bridge Mode User Guide

Cloudbrink's Bridge Mode enables users to connect more than one endpoint to enterprise private apps as well as SaaS apps through the primary endpoint on which the BrinkAgent is installed. All the other connected endpoints are referred to as secondary endpoints and do not require Brink App to be installed. This guide outlines the process for configuring the BrinkAgent to effectively leverage Bridge Mode.

## Introduction

This document will walkthrough how to configure devices for Bridge Mode. Bridge mode must be enabled by the Cloudbrink Administrator at each device-user-group level before the users can use the option to connect secondary endpoints.

## Prerequisites

- Bridge Mode is only supported on Windows platforms. Primary endpoint must be a Win-
dows 10/11 OS.
- Secondary endpoints may be any OS (Windows, Linux, Mac).

### Bridge Mode Important Notes

- When the secondary endpoint is connected to the primary endpoint via an L2/L3 switch, cer-
tain features such as physical interface flap on secondary endpoint may not detected on the primary endpoint (Brink Agent).
- To establish a "bridge" users must carefully choose the physical interface of primary endpoint
to which secondary endpoints will be connected.
- The WAN Interface (internet providing interface) must not be used for bridge.
- After configuring bridge mode on the primary BrinkAgent endpoint, and connecting the
secondary endpoint, ensure the secondary endpoint interface is flapped (DOWN/UP) so that secondary endpoint generates DHCP request
- It is recommended to setup the "Bridge" on the primary device first, then connect the sec-
ondary endpoint to that device.
- Certain secondary endpoint operating systems may need to have an MTU manually config-
ured.

### Bridge Mode User Config

1. When logging into the Brink App, a new tab "Bridge" once properly enabled. If you do not see this, contact your administrator.

### Bridge Mode User Config - Continued

2. Click on the "Bridge" tab, and users will see all available interfaces on the primary endpoint. 3. Check the box(es) to select the interface(es) you want to bridge out to a secondary device(s), and click on the "Bridge" button at the bottom.

4. Once the interface is successfully added to the "Bridge", connect the secondary endpoint to this interface to start accessing enterprise app from the secondary endpoint.