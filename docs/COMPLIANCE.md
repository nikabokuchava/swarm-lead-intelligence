# Swarm Lead Intelligence — Legal & Compliance Posture

## Scope & Disclaimers
1. **Public Data Collection Only:** This system collects publicly available contact details. It does not bypass paywalls or unauthorized private databases.
2. **Email Verification vs Deliverability:** Validation statuses (`VALID`, `INVALID`, `CATCH_ALL`, `UNKNOWN`) indicate server responsiveness to DNS/MX queries and SMTP handshakes. They do NOT constitute an inbox delivery guarantee or sender reputation endorsement.
3. **CAN-SPAM, GDPR, and CASL Compliance:**
   - Any cold outreach conducted using extracted leads MUST provide a clear unsubscribe mechanism (`List-Unsubscribe` headers or opt-out links).
   - In jurisdictions requiring opt-in consent (e.g., GDPR), outreach to EU data subjects requires legitimate interest assessments (LIA) or explicit prior consent.
4. **HELO Domain Identity:** SMTP verification probes announce a HELO/EHLO identity. Operators MUST configure `SMTP_HELO_DOMAIN` and `SMTP_PROBE_FROM` to an address and domain they legitimately control.

---

## Regulatory Frameworks

### 1. United States — CAN-SPAM Act (15 U.S.C. § 7701 et seq.)
Any commercial electronic mail messages sent based on leads extracted through Swarm must adhere strictly to CAN-SPAM mandates:
- **No False or Misleading Header Information:** Transmission data (From, To, Reply-To, routing domain) must accurately identify the sender.
- **Accurate Subject Lines:** Subject headers must reflect the substantive content of the message.
- **Clear Identification as Advertisement:** Unless explicit prior opt-in consent exists, communications must disclose their nature as promotional or commercial.
- **Physical Postal Address:** Messages must contain a valid physical postal address of the sender.
- **Prompt Opt-Out Execution:** Opt-out and unsubscribe mechanisms must remain active for a minimum of 30 days post-transmission and unsubscribe requests must be honored within 10 business days.

### 2. European Union & UK — GDPR & PECR
Under the General Data Protection Regulation (EU 2016/679) and UK GDPR:
- **Legal Basis for Processing:** Lead enrichment and storage of identifiable business contacts (e.g., `first.last@company.com`) constitutes processing of personal data. Operators rely on **Legitimate Interests (Article 6(1)(f))** for B2B communications, requiring a documented **Legitimate Interests Assessment (LIA)**.
- **Balancing Test:** Operators must verify that commercial interests do not override the fundamental rights and freedoms of the data subjects.
- **Right to Object & Erasure:** Data subjects maintain absolute rights to object (Article 21) to direct marketing at any time and request erasure (Article 17). System operators must honor suppression across all queues and databases.
- **Direct Electronic Marketing (PECR):** Sole traders and certain partnerships in the UK require opt-in consent; corporate bodies (LLCs, Ltd, PLCs) permit opt-out B2B outreach with identified senders.

### 3. Canada — CASL (Canada's Anti-Spam Legislation)
- CASL requires express or verifiable implied consent before sending Commercial Electronic Messages (CEMs).
- **Conspicuous Publication:** Implied consent exists under CASL only if a business contact's email is conspicuously published on a public website without an accompanying statement that the individual does not wish to receive unsolicited CEMs, AND the outreach is directly relevant to the recipient's business role or duties.

---

## Technical Security & Verification Safeguards

### SMTP HELO/EHLO Protocol Disclosures
- SMTP mailbox probing connects directly to the recipient domain's Mail eXchanger (MX) server on port 25.
- During the `HELO`/`EHLO` and `MAIL FROM` handshakes, the probe declares its originating domain identity.
- Using third-party domains without authorization constitutes protocol spoofing and may violate computer fraud regulations.
- Operators must designate verified domains (`SMTP_HELO_DOMAIN`) and valid sender addresses (`SMTP_PROBE_FROM`) that publish valid reverse DNS (PTR) and SPF records.
- If unconfigured, the verification engine safely defaults to MX-only inspection and tags mailbox statuses as `UNKNOWN`.

### Scraping Etiquette & Denial of Service Protection
- Crawlers must respect target server bandwidth, utilizing concurrency limits, exponential backoff, and randomized jitter.
- The crawler must never attempt to access password-protected administrative interfaces, intranet assets, or bypass CAPTCHA solving controls.
