# App-Level **QOE Analytics**

> **NOTE (Internal)**:** This feature is available only if the feature flag “App-Level QOE Visibility” is
> set to ENABLED for the tenant from the Ops-portal or MSP-portal.
> Cloudbrink provides best user experience (Quality of Experience – QOE) when accessing
> enterprise applications from anywhere over a highly secured zero-trust platform. Customers
> can improve their user’s productivity while providing flexibility to work from anywhere
> options without compromising on the application performance or user experience.
> It is very critical for IT administrators to have a deep visibility into the quality of experience
> that users are getting. These insights help administrators to monitor, plan and deliver the
> right set of applications and user experience to their users. Administrators can use the
> deeper visibility into user experience in two different ways.

## Use Cases

**1.** Cloudbrink Value: Administrators can quickly see the benefits of Cloudbrink platform in terms of how the network impairements have been overcome and the throughput that their users are able to get.

**2.** Troubleshoot: When users raise IT tickets related to application performance or experience, administrators can quickly triage the issue using the Cloudbrink QOE analytics info and narrowing down the root cause of the problem.

## **QOE Analytics** Functionality

**QOE Analytics** feature provides deeper insights into the network characteristics and traffic information for each endpoint/device of a user at the device-level and at the individual application level. Administrators can navigate to the **QOE Analytics** section from the **Admin Portal** (aka **Enterprise Portal**) in the following path **Admin Portal** → Troubleshoot → Devices → QOE column → Click on the value of the QOE

![Diagram 1](/api/images/App-Level_QOE_Analytics_Admin_Guide/img-000.png)

**i)** Packet Loss

Packet loss graph shows the total percentage of the packets lost at the endpoint. This packet loss percentage is before the Cloudbrink recovered the packets. This information provides insight into the quality of the user’s ISP network and any potential issues in the last-mile.

**ii)** Packets Recovered

Packets recovered is the no.of packets that Cloudbrink was able to recover from the network after detecting that there is packet loss at the endpoint. Administrators can corelate this information with the Packet Loss graph to see that when there is packet loss detected on the last-mile network, Cloudbrink will start the recovery process and hence, ensures applications perform at optimal levels.

**iii)** Latency

Latency is the end-to-end between BrinkAgent (endpoint) to the application service/server that user is accessing over Cloudbrink tunnel. The lower the latency, the higher the application performance can be maintained.

**iv)** Total Packets Recovered

Total packets recovered in the cumulative number of total packets that Cloudbrink was able to recover in the selected time duration.

**v)** Jitter

Jitter value is applicable only for “collaboration” (UCaaS) type of applications such as Zoom, Teams, Webex, etc. Maintaining a low and consistent jitter is important for having a productive virtual meeting. Administrators can see the jitter that Cloudbrink is able to manage for UCaaS applications in order to deliver best quality of experience.

**vi)** Tx/Rx Throughput

The Tx/Rx throughput is the throughput over Cloudbrink tunnel that the user was able to achieve. The graph provides both Tx (transmission) and Rx (receive) side of the throughput so that administrators have clear insight into the network performance of the endpoint.

**vii)** Services dropdown:

The “Services” dropdown at the top of the graphs can be used to select a specific application for which administrators want to get deeper insights. When “Services” dropdown is selected as “All”, the data in the graphs is at the device-level. If a specific app is selected, then the data in the graphs is at the individual application-level.

**viii)** Time Duration:

Time duration is a common field in all the sections of the Cloudbrink **Admin Portal**. The data shown in the graphs will be limited to the selected time duration. Administrators can see data for the last 30days by setting the time duration accordingly.

---
  
  **Corporate Headquarters Cloudbrink, Inc.**  
  *530 Lakeside Drive, Suite 190, Sunnyvale, CA 94085*

  <sub>© 2021 Cloudbrink, Inc. All rights reserved. Cloudbrink, the Cloudbrink logo, and all product and service names mentioned herein are registered trademarks or trademarks of Cloudbrink, Inc. in the United States and other countries. All other trademarks, service marks, registered marks, or registered service marks mentioned herein are for identification purposes only and are the property of their respective owners.</sub>