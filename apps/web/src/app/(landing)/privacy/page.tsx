import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Koraa",
  description:
    "How Koraa collects, uses and protects the personal data of merchants and their customers.",
};

const LAST_UPDATED = "2 September 2026";

export default function PrivacyPage() {
  return (
    <div className="lp-legal">
      <div className="lp-legal__hero">
        <div className="lp-legal__wrap">
          <p className="lp-legal__eyebrow">Legal</p>
          <h1 className="lp-legal__title">Privacy Policy</h1>
          <p className="lp-legal__meta">Last updated: {LAST_UPDATED}</p>
          <p className="lp-legal__intro">
            Koraa is built on the principle that your data and your customers'
            data belongs to you. This policy explains what we collect, why we
            collect it, and how you can control it.
          </p>
        </div>
      </div>

      <div className="lp-legal__body">
        <div className="lp-legal__wrap">

          {/* Navigation */}
          <nav className="lp-legal__toc" aria-label="Contents">
            <p className="lp-legal__toc-heading">On this page</p>
            <ol>
              <li><a href="#who-we-are">1. Who we are</a></li>
              <li><a href="#what-we-collect">2. What we collect and why</a></li>
              <li><a href="#merchant-data">3. Merchant data</a></li>
              <li><a href="#storefront-data">4. Storefront visitor and customer data</a></li>
              <li><a href="#payments">5. Payments and financial data</a></li>
              <li><a href="#cookies">6. Cookies and local storage</a></li>
              <li><a href="#sharing">7. Who we share data with</a></li>
              <li><a href="#retention">8. How long we keep data</a></li>
              <li><a href="#security">9. Security</a></li>
              <li><a href="#your-rights">10. Your rights</a></li>
              <li><a href="#children">11. Children</a></li>
              <li><a href="#changes">12. Changes to this policy</a></li>
              <li><a href="#contact">13. Contact us</a></li>
            </ol>
          </nav>

          <div className="lp-legal__content">

            {/* 1 */}
            <section id="who-we-are">
              <h2>1. Who we are</h2>
              <p>
                Koraa ("<strong>Koraa</strong>", "<strong>we</strong>",
                "<strong>us</strong>") is a Cameroonian commerce platform
                operated from Cameroon. We provide merchants with a hosted
                e-commerce storefront, a mobile-money checkout, and related
                tools through{" "}
                <Link href="https://koraa.cm">koraa.cm</Link> and its
                subdomains.
              </p>
              <p>
                For the purposes of data protection law, Koraa is the data
                controller for the personal data of merchants and their staff.
                For personal data submitted by a merchant's customers at
                checkout, the merchant is the controller and Koraa acts as a
                data processor on their behalf.
              </p>
              <p>
                Our contact address for all privacy matters is{" "}
                <a href="mailto:privacy@koraa.cm">privacy@koraa.cm</a>.
              </p>
            </section>

            {/* 2 */}
            <section id="what-we-collect">
              <h2>2. What we collect and why</h2>
              <p>
                We collect personal data in three main contexts: when a merchant
                creates and manages an account, when a visitor browses or buys
                from a storefront, and when a payment is made. The table below
                gives an overview; the sections that follow go into detail.
              </p>
              <div className="lp-legal__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Examples</th>
                      <th>Legal basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Account data</td>
                      <td>Name, email address, phone number, business name</td>
                      <td>Contract performance</td>
                    </tr>
                    <tr>
                      <td>Authentication data</td>
                      <td>Hashed password, Firebase UID, Google account ID</td>
                      <td>Contract performance, security</td>
                    </tr>
                    <tr>
                      <td>Payment and billing data</td>
                      <td>Mobile money number, transaction reference, amount paid</td>
                      <td>Contract performance, legal obligation</td>
                    </tr>
                    <tr>
                      <td>Store and catalogue data</td>
                      <td>Product names, prices, images, descriptions</td>
                      <td>Contract performance</td>
                    </tr>
                    <tr>
                      <td>Order data</td>
                      <td>Buyer name, phone number, delivery address, items ordered</td>
                      <td>Contract performance (processor role)</td>
                    </tr>
                    <tr>
                      <td>Analytics data</td>
                      <td>Page views, referrer, browser type, country (aggregated)</td>
                      <td>Legitimate interest</td>
                    </tr>
                    <tr>
                      <td>Support communications</td>
                      <td>Emails and messages you send us</td>
                      <td>Legitimate interest</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3 */}
            <section id="merchant-data">
              <h2>3. Merchant data</h2>
              <p>
                When you create a Koraa account we ask for your full name,
                email address, and a password. If you sign in with Google, we
                receive your name, email address and Google account identifier
                from Google; we do not store your Google password.
              </p>
              <p>
                During merchant onboarding you provide a business name, phone
                number, and optionally a business address. This information
                appears on invoices and is used to set up your payout account
                with our mobile-money payment partners.
              </p>
              <p>
                We use your email address to send you:
              </p>
              <ul>
                <li>A verification email when you sign up</li>
                <li>Password-reset and security notifications</li>
                <li>Receipts for your Koraa subscription payments</li>
                <li>Product updates and announcements — you can opt out at any time from your account settings</li>
              </ul>
              <p>
                We do not sell your contact details to third parties, and we do
                not use your business data to train machine-learning models
                without your explicit consent.
              </p>
            </section>

            {/* 4 */}
            <section id="storefront-data">
              <h2>4. Storefront visitor and customer data</h2>
              <p>
                When someone visits a storefront powered by Koraa we collect
                aggregated, anonymised analytics: pages visited, referrer
                domain, browser family, operating system, and approximate
                country (derived from the IP address, which is then
                discarded). This data is attributed to your store, not to an
                individual visitor, and is presented in the analytics section
                of your dashboard.
              </p>
              <p>
                When a customer places an order they provide a name, phone
                number, and the mobile-money number they are paying from. This
                data is stored in Koraa's database and is visible to you, as
                the store owner, in your order management dashboard. You are
                responsible for how you use and retain that customer data, and
                you must inform your customers according to any applicable law.
              </p>
              <p>
                Customers do not need a Koraa account to buy from your store.
                We do not set tracking cookies on storefront pages.
              </p>
            </section>

            {/* 5 */}
            <section id="payments">
              <h2>5. Payments and financial data</h2>
              <p>
                Koraa integrates with MTN Mobile Money and Orange Money to
                process payments. When a payment is initiated, your mobile
                money number (or your customer's) is passed to the relevant
                network's API to generate a payment prompt. Koraa stores the
                transaction reference, amount, currency, and outcome for
                accounting and dispute purposes. We do not store, and never
                see, full card numbers or mobile-banking PINs.
              </p>
              <p>
                Your subscription to Koraa is also billed by mobile money.
                The payout number you add to your account is used by our
                payment partner to settle merchant funds to you according to
                their payout schedule.
              </p>
              <p>
                Financial records are kept for seven years to satisfy
                Cameroonian legal and tax obligations, even after you close
                your account.
              </p>
            </section>

            {/* 6 */}
            <section id="cookies">
              <h2>6. Cookies and local storage</h2>
              <p>
                On the Koraa dashboard we use:
              </p>
              <ul>
                <li>
                  <strong>Session storage and IndexedDB</strong> — to keep you
                  signed in via Firebase Authentication. These are cleared when
                  you sign out or when the browser session ends.
                </li>
                <li>
                  <strong>Local storage</strong> — to remember lightweight UI
                  preferences (such as your chosen theme). No personal data is
                  stored here.
                </li>
              </ul>
              <p>
                We do not use advertising cookies, fingerprinting, or any form
                of cross-site tracking. We do not run Google Analytics or
                Meta Pixel. Our own analytics are first-party only and use
                aggregated, IP-discarded data as described in section 4.
              </p>
            </section>

            {/* 7 */}
            <section id="sharing">
              <h2>7. Who we share data with</h2>
              <p>
                We share personal data only where necessary to deliver the
                service:
              </p>
              <ul>
                <li>
                  <strong>Firebase (Google)</strong> — for authentication
                  (sign-in, email verification, password reset). Firebase
                  processes the minimum data needed to confirm your identity.
                </li>
                <li>
                  <strong>MTN Mobile Money / Orange Money</strong> — phone
                  numbers and payment amounts, to initiate and verify
                  transactions.
                </li>
                <li>
                  <strong>Fapshi</strong> — our payment gateway partner, which
                  processes mobile-money transactions on our behalf under its
                  own data processing agreement.
                </li>
                <li>
                  <strong>Resend</strong> — our transactional email provider,
                  which receives your email address and the content of system
                  emails (receipts, password resets). Resend does not use this
                  data for any purpose other than delivery.
                </li>
                <li>
                  <strong>Cloudflare</strong> — our CDN and storage provider.
                  Images and static assets you upload are stored on Cloudflare
                  R2. Cloudflare may log requests for security purposes.
                </li>
              </ul>
              <p>
                We do not sell personal data. We do not share data with
                advertisers. We will disclose data to law enforcement or
                regulatory authorities only when required by Cameroonian law
                and after verifying the legal basis for the request.
              </p>
            </section>

            {/* 8 */}
            <section id="retention">
              <h2>8. How long we keep data</h2>
              <ul>
                <li>
                  <strong>Account and store data</strong> — retained while your
                  account is active and for 90 days after you request deletion,
                  to allow for data export and dispute resolution.
                </li>
                <li>
                  <strong>Order and payment records</strong> — retained for
                  seven years from the date of transaction for legal and tax
                  purposes.
                </li>
                <li>
                  <strong>Analytics data</strong> — aggregated, non-personal.
                  Retained for the period visible in your dashboard (30 days on
                  the free plan, up to 365 days on Pro and Enterprise).
                </li>
                <li>
                  <strong>Support communications</strong> — retained for two
                  years from the last message, after which they are deleted.
                </li>
              </ul>
            </section>

            {/* 9 */}
            <section id="security">
              <h2>9. Security</h2>
              <p>
                We implement the following measures to protect your data:
              </p>
              <ul>
                <li>All data in transit is encrypted with TLS 1.2 or higher</li>
                <li>Passwords are never stored in plain text — authentication is managed by Firebase, which uses industry-standard hashing</li>
                <li>Database access is restricted to the application server; direct public access is disabled</li>
                <li>Media storage is access-controlled; publicly linked assets are served through authenticated signed URLs</li>
                <li>Staff access to production systems is limited to those who need it and is reviewed regularly</li>
              </ul>
              <p>
                No system is perfectly secure. If you discover a vulnerability,
                please report it to{" "}
                <a href="mailto:security@koraa.cm">security@koraa.cm</a> and we
                will investigate promptly.
              </p>
            </section>

            {/* 10 */}
            <section id="your-rights">
              <h2>10. Your rights</h2>
              <p>
                You have the right to:
              </p>
              <ul>
                <li><strong>Access</strong> the personal data we hold about you</li>
                <li><strong>Correct</strong> inaccurate data, which you can do directly in your account settings</li>
                <li><strong>Export</strong> your store data in a machine-readable format from the dashboard</li>
                <li><strong>Delete</strong> your account and associated data — go to Settings → Account → Delete account, or email us</li>
                <li><strong>Object</strong> to marketing emails at any time by unsubscribing or updating your notification preferences</li>
              </ul>
              <p>
                To exercise any right, or if you have a question we have not
                answered here, contact us at{" "}
                <a href="mailto:privacy@koraa.cm">privacy@koraa.cm</a>. We will
                respond within 30 days.
              </p>
            </section>

            {/* 11 */}
            <section id="children">
              <h2>11. Children</h2>
              <p>
                Koraa is intended for use by adults operating businesses. We do
                not knowingly collect personal data from anyone under 18 years
                of age. If you believe a minor has created an account without
                parental consent, please contact us and we will delete the
                account promptly.
              </p>
            </section>

            {/* 12 */}
            <section id="changes">
              <h2>12. Changes to this policy</h2>
              <p>
                We may update this policy when we change how we handle data or
                when the law requires it. When we make a material change we
                will notify merchants by email and display a notice on the
                dashboard for 30 days. The "Last updated" date at the top of
                this page always reflects the current version. Continuing to
                use Koraa after a change takes effect means you accept the
                updated policy.
              </p>
            </section>

            {/* 13 */}
            <section id="contact">
              <h2>13. Contact us</h2>
              <p>
                For privacy questions, data requests, or to report a concern:
              </p>
              <address className="lp-legal__address">
                <strong>Koraa</strong><br />
                Email: <a href="mailto:privacy@koraa.cm">privacy@koraa.cm</a><br />
                General support: <a href="mailto:support@koraa.cm">support@koraa.cm</a>
              </address>
              <p>
                See also our{" "}
                <Link href="/terms">Terms of Service</Link>.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
