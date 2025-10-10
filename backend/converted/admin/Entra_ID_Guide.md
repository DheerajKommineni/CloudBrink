### Entra ID Integration | 1Hybrid Access as a Service

Cloudbrink - MS Entra ID Integration

Cloudbrink's Hybrid Access as a Service has granular role based access controls, enabling administrators to assign different users and groups to needed public and private resources. Rather than requiring customers to manually define these users and groups, Cloudbrink instead integrates with the customer’s existing identity provider. This enables organizations and their end-users to utilize existing single sign-on methods, simplifying onboarding and management. This document covers configuring Cloudbrink with Entra ID.

### Overview

Microsoft Entra Identity, commonly known as Entra ID, is a comprehensive identity and access management solution designed to enhance security and streamline user access across various platforms. Its key benefits include robust authentication mechanisms, centralized identity man- agement, and simplified access controls. Entra ID facilitates secure and efficient user access, reduc- ing the risk of unauthorized access and data breaches. By offering features like multi-factor authen- tication and single sign-on, it greatly improves the user experience while maintaining high security standards. This makes Entra ID an ideal choice for organizations looking to strengthen their cyber- security infrastructure and optimize user access management with Cloudbrink.

## Prerequisites

- Administrative access into the Cloudbrink Administrators portal
- Administrative access into the Microsoft Entra ID portal
- Cloudbrink Entra ID signing certificate provided from support@cloudbrink.com

### Configure Authentication Policy

1. Navigate to the Cloudbrink Admin portal admin.cloudbrink.com 2. Navigate to Configure > Authentication > Create New Auth Policy

### Entra ID Integration | 2Hybrid Access as a Service

3. Under SAML SSO, Input a unique Auth Policy Name, and Email Domain 4. Copy the ACS URL to a notepad 5. Navigate to the Entra ID portal. 6. Navigate to Enterprise Applications on the left hand panel 7. Click to create a new Enterprise Application for Cloudbrink 8. Click and fill out the name of the app, as well as ensuring that "In- regrate any other application you dont find in the gallery (Non-gallery) is selected. Hit save.

### Entra ID Integration | 3Hybrid Access as a Service

9. On the next screen, select 1. Assign users and groups 10. Select and select the group(s) you'd like to have access via Cloudbrink.

**Note:** While here, you should copy the group "Object ID" value(s) and put them in your notepad from earlier. These will be used to map groups to access levels in the Cloudbrink admin portal later. 11. After you've added the groups required, from you Enterprise App menu, Select "Single sign-on" and then "SAML" from the left hand panel under manage.

### Entra ID Integration | 4Hybrid Access as a Service

12. Copy the "Login URL" lower on the page under number 4 to your notepad. 13. Click "Edit" on the Basic SAML Configuration 14. Under the right hand window, fill in the following fields: a. Identifier (Entity ID): https://wren.cloudbrink.com/<example>/svc/auth/<example> i. This is copied from step 4 above b. Reply URL: https://wren.cloudbrink.com/<example>/svc/auth/<example> i. Same as above c. Sign on URL: https://login.microsoftonline.com/<example>/ i. Copied from step 12. 15. Once all above fields are filled appropriately, hit save on the top left.

### Entra ID Integration | 5Hybrid Access as a Service

16. Click edit on the Attributes & Claims section 17. Click on Add new claim and fill out the following fields (non-specified fields can be left as de- fault), and then click Save: a. Name: Email b. Source attribute: user.mail 18. Click Add a Group claim and in the pane that appears to the right, enter in the following fields and click Save: a. Which groups associated: Security groups b. Source attribute: Group ID c. Advanced options: i. Customize the name of the group claim: Checkbox selected Groups ii. Name (required): Groups

### Entra ID Integration | 6Hybrid Access as a Service

19. Back within the Single sign-on section of the application, under the 3 SAML Signing Certificate section, copy the App Fedearation Metadata URL to your notepad. 20. Click the three little dots on the top right corner under the SAML Certficates window and click Edit.

### Entra ID Integration | 7Hybrid Access as a Service

21. In the pane that appears to the right: a. Click Import Certificate, and select the .PFX certificate file separately provided by Cloud- brink b. While importing the file, enter in the password also separated by Cloudbrink c. Ensure the certificate is set as Active d. Change the Signing Option to Sign SAML response and assertion e. Optionally, input a Notification Email Address to be notified of cert expiry reminders 22. Navigate back to the Cloudbrink Admin Portal and to your Authentication Policy 23. Paste in the Metadata URL, and Login URL as copied to your notepad in steps 12 and 19. Then click the checkmark in the top right corner to save 24. Navigate to Device User Groups 25. For every group you desire to use with Cloudbrink for login, create a corresponding device user group the the Device User Group value being the EntraID Group Object ID

Cloudbrink Hybrid Access as a Service

26. Create a new Device User Group Policy, and select the desired Resource Template. Optionally, select your desired DSPA Policy, Device Session Policy, and Mobile Access Policy 27. Users logging in to the Brink App with the configured group will then have the desired policies applied

### Support

We would love to hear from you! For any questions, concerns, or feedback regarding this feature, please reach out at support@cloudbrink.com