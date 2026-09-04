# Data Privacy & Protection Policy Template (GDPR & CCPA/CPRA)

> **Notice to Operators:** This privacy disclosure template outlines technical and procedural compliance measures for operators deploying Swarm Lead Intelligence. Customize all bracketed placeholders with your organization's legal particulars and appoint a designated Data Protection Officer (DPO) or privacy contact before publication.

**Effective Date:** [Date]  
**Last Updated:** [Date]  
**Data Controller:** [Legal Entity Name], [Physical Address] ("Company", "we", "us", or "our")  
**Privacy Contact / DPO:** [privacy@yourcompany.com]  

---

## 1. Scope & Roles Under Data Protection Laws
This policy describes how we collect, process, retain, and safeguard personal information obtained through our B2B lead enrichment platform and website.
- **As a Data Controller:** We act as a Controller when determining the purposes and means of processing business contact data gathered from publicly accessible sources and maintaining user account profiles.
- **As a Data Processor:** When our B2B customers input custom target domains or lists into the system for enrichment, we act as a Data Processor on their behalf under a Data Processing Agreement (DPA).

---

## 2. Categories of Information Processed

We collect and process solely professional, business-related information from public sources. We do NOT intentionally collect special categories of personal data (e.g., health, racial/ethnic origin, political beliefs, or financial bank details of data subjects).

| Category | Specific Data Points | Source |
|---|---|---|
| **Business Identity** | First Name, Last Name, Professional Title, Department | Public corporate websites, directory listings |
| **Business Contact Details** | Corporate email address, business telephone number, company headquarters address | Public websites, business registries |
| **Corporate Firmographics** | Company name, industry classification, domain name, public review scores | Corporate websites, search index metadata |
| **Technical Verification Metadata** | DNS MX records, SMTP handshake response codes, catch-all server flags | Third-party mail exchange servers |
| **Customer Account Data** | Name, login email, organization name, Stripe billing customer ID | Customer sign-up and authentication portal |

---

## 3. Legal Grounds for Processing (GDPR Article 6)

For individuals located within the European Economic Area (EEA) and the United Kingdom:
- **Legitimate Interests (Art. 6(1)(f) GDPR):** We process business contact data for the legitimate interest of facilitating B2B commerce, market research, and corporate outreach.
  - **Legitimate Interests Assessment (LIA):** We conduct a three-part balancing test:
    1. *Purpose Test:* Legitimate commercial objective in enabling B2B discovery.
    2. *Necessity Test:* Processing is limited strictly to professional contact data required for business communications.
    3. *Balancing Test:* Given the business-specific nature and public availability of the data, the processing does not override data subjects' fundamental privacy rights.
- **Contractual Necessity (Art. 6(1)(b) GDPR):** Processing customer account and credit ledger information to deliver contracted services.
- **Legal Obligation (Art. 6(1)(c) GDPR):** Maintaining transaction records and audit logs for accounting and regulatory compliance.

---

## 4. California Privacy Rights (CCPA / CPRA)

Under the California Consumer Privacy Act as amended by the California Privacy Rights Act:
- **Categories Collected:** Identifiers (name, corporate email, IP address), Professional/Employment Information (job title, employer).
- **Commercial Purpose:** Facilitating corporate business-to-business introductions and data hygiene.
- **"Do Not Sell or Share My Personal Information":** California residents have the right to opt out of the sale or sharing of their personal information. To exercise this right, visit our Opt-Out / Suppression Portal at `[yourdomain.com/privacy/opt-out]` or email `[privacy@yourcompany.com]`.
- **Non-Discrimination:** We will not discriminate against any individual for exercising statutory CCPA rights.

---

## 5. Data Subject Rights & Global Suppression

Data subjects worldwide possess the right to control their data:
1. **Right of Access (GDPR Art. 15):** Request confirmation and a copy of personal information stored about you.
2. **Right to Rectification (GDPR Art. 16):** Request correction of outdated or inaccurate professional details.
3. **Right to Erasure / "Right to be Forgotten" (GDPR Art. 17):** Request permanent removal of your information from active databases.
4. **Right to Object (GDPR Art. 21):** Absolute right to object to the processing of personal data for direct marketing purposes.
5. **Universal Suppression List:** When an individual requests erasure or objects to processing, we retain a cryptographic hash of the email address in a global suppression table to prevent re-scraping or re-indexing in future crawl cycles.

To submit a privacy or suppression request, contact: **`privacy@yourcompany.com`** (requests processed within 30 days free of charge).

---

## 6. Technical Security & Data Governance

We enforce technical safeguards to prevent unauthorized access or disclosure:
- **Tenant Data Isolation:** Multi-tenant separation enforced at the database query level with fail-closed access controls.
- **Cryptographic Protections:** All data in transit is encrypted using TLS 1.3. Sensitive credentials and webhook keys are isolated in environment configuration.
- **Deduplication & Retention:** Public contact leads are subject to scheduled retention windows and deduplication checks against domain-level unique constraints.
- **Rate-Limited Verification:** Email probes comply with strict concurrency limits and caching to prevent intrusive queries against target servers.

---

## 7. Updates to this Policy
We reserve the right to revise this Privacy Policy to reflect changing legal requirements or system enhancements. Updates will be posted with a revised "Last Updated" timestamp.
