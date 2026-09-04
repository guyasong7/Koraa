import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Koraa",
  description:
    "The terms that govern your use of the Koraa commerce platform, including merchant responsibilities, billing, and acceptable use.",
};

const LAST_UPDATED = "2 September 2026";

export default function TermsPage() {
  return (
    <div className="lp-legal">
      <div className="lp-legal__hero">
        <div className="lp-legal__wrap">
          <p className="lp-legal__eyebrow">Legal</p>
          <h1 className="lp-legal__title">Terms of Service</h1>
          <p className="lp-legal__meta">Last updated: {LAST_UPDATED}</p>
          <p className="lp-legal__intro">
            These terms form the agreement between you and Koraa when you open
            an account or use any part of our platform. Please read them — they
            are written to be understood, not to confuse.
          </p>
        </div>
      </div>

      <div className="lp-legal__body">
        <div className="lp-legal__wrap">

          {/* Navigation */}
          <nav className="lp-legal__toc" aria-label="Contents">
            <p className="lp-legal__toc-heading">On this page</p>
            <ol>
              <li><a href="#about-koraa">1. About Koraa</a></li>
              <li><a href="#accounts">2. Accounts and eligibility</a></li>
              <li><a href="#merchant-responsibilities">3. Merchant responsibilities</a></li>
              <li><a href="#acceptable-use">4. Acceptable use</a></li>
              <li><a href="#storefronts">5. Storefronts and customer sales</a></li>
              <li><a href="#payments">6. Payments and billing</a></li>
              <li><a href="#plan-limits">7. Plan limits and upgrades</a></li>
              <li><a href="#intellectual-property">8. Intellectual property</a></li>
              <li><a href="#third-party">9. Third-party services</a></li>
              <li><a href="#availability">10. Service availability</a></li>
              <li><a href="#termination">11. Termination and suspension</a></li>
              <li><a href="#liability">12. Limitation of liability</a></li>
              <li><a href="#disputes">13. Disputes and governing law</a></li>
              <li><a href="#changes">14. Changes to these terms</a></li>
              <li><a href="#contact">15. Contact</a></li>
            </ol>
          </nav>

          <div className="lp-legal__content">

            {/* 1 */}
            <section id="about-koraa">
              <h2>1. About Koraa</h2>
              <p>
                Koraa is an e-commerce platform operated from Cameroon that
                lets merchants create online stores, list products, and accept
                payment through MTN Mobile Money and Orange Money. By creating
                an account or using any Koraa service, you agree to these
                Terms of Service ("<strong>Terms</strong>").
              </p>
              <p>
                References to "<strong>Koraa</strong>", "<strong>we</strong>",
                "<strong>us</strong>" or "<strong>our</strong>" mean the Koraa
                platform and the team operating it. References to{" "}
                "<strong>you</strong>" or "<strong>merchant</strong>" mean the
                individual or business that has created a Koraa account.
              </p>
            </section>

            {/* 2 */}
            <section id="accounts">
              <h2>2. Accounts and eligibility</h2>
              <p>
                To use Koraa you must:
              </p>
              <ul>
                <li>Be at least 18 years old</li>
                <li>Have the legal capacity to enter into a binding contract</li>
                <li>Provide accurate, current, and complete information when you register</li>
                <li>Keep your account credentials secure and not share them with others</li>
              </ul>
              <p>
                If you are opening an account on behalf of a business, you
                confirm that you are authorised to bind that business to these
                Terms.
              </p>
              <p>
                You are responsible for all activity that occurs under your
                account. If you believe your account has been compromised,
                contact us immediately at{" "}
                <a href="mailto:support@koraa.cm">support@koraa.cm</a>.
              </p>
              <p>
                We reserve the right to refuse or cancel accounts at our
                discretion, for example where we detect fraudulent activity or
                a violation of these Terms.
              </p>
            </section>

            {/* 3 */}
            <section id="merchant-responsibilities">
              <h2>3. Merchant responsibilities</h2>
              <p>
                As a Koraa merchant you are responsible for:
              </p>
              <ul>
                <li>
                  <strong>Your products and services.</strong> You must only sell
                  products you are legally permitted to sell in Cameroon. You are
                  solely responsible for product descriptions, pricing, stock
                  accuracy, and fulfilment.
                </li>
                <li>
                  <strong>Your customers.</strong> You are the data controller
                  for your customers' personal data. You must have a lawful basis
                  to collect it and must handle it in accordance with applicable
                  law.
                </li>
                <li>
                  <strong>Taxes.</strong> You are responsible for calculating,
                  collecting, and remitting any taxes (including VAT or sales tax)
                  due on your sales. Koraa does not calculate or collect taxes on
                  your behalf.
                </li>
                <li>
                  <strong>Refunds and disputes.</strong> You set and communicate
                  your own refund policy to customers. Koraa does not arbitrate
                  commercial disputes between merchants and their customers.
                </li>
                <li>
                  <strong>Content accuracy.</strong> All information you publish
                  through your storefront must be true, accurate, and not
                  misleading.
                </li>
              </ul>
            </section>

            {/* 4 */}
            <section id="acceptable-use">
              <h2>4. Acceptable use</h2>
              <p>
                You may not use Koraa to sell, promote, or distribute:
              </p>
              <ul>
                <li>Illegal goods or services under Cameroonian or applicable international law</li>
                <li>Counterfeit, pirated, or stolen goods</li>
                <li>Drugs, controlled substances, or paraphernalia not lawfully sold over the counter</li>
                <li>Weapons, ammunition, or explosive devices</li>
                <li>Tobacco or alcohol products without any required licences</li>
                <li>Content that is obscene, harmful to children, or constitutes harassment</li>
                <li>Financial products, investment schemes, or anything that could constitute fraud</li>
                <li>Anything that violates a third party's intellectual property rights</li>
              </ul>
              <p>
                You may not use Koraa to:
              </p>
              <ul>
                <li>Attempt to gain unauthorised access to any part of the platform or another user's account</li>
                <li>Transmit malware, viruses, or any code designed to disrupt or damage</li>
                <li>Scrape, crawl, or harvest data from the platform without our prior written consent</li>
                <li>Interfere with the platform's infrastructure, including by excessive automated requests</li>
                <li>Impersonate another person or entity, or misrepresent your affiliation with any person or entity</li>
              </ul>
              <p>
                We may remove content, suspend, or terminate accounts that
                violate this section without prior notice.
              </p>
            </section>

            {/* 5 */}
            <section id="storefronts">
              <h2>5. Storefronts and customer sales</h2>
              <p>
                Each Koraa account can operate one or more storefronts
                accessible at a subdomain of koraa.cm (e.g.{" "}
                <em>yourshop.koraa.cm</em>) or at a custom domain you own.
                The number of storefronts available depends on your plan — see
                the{" "}
                <Link href="/#pricing">pricing page</Link>.
              </p>
              <p>
                When a customer places an order through your storefront, the
                sale is between you and that customer. Koraa is not party to
                the transaction and accepts no liability for the products sold,
                their quality, delivery, or any dispute arising from the sale.
              </p>
              <p>
                You may not publish a storefront that exists solely to
                redirect visitors elsewhere, to harvest personal data without
                a legitimate commercial purpose, or to deceive visitors.
              </p>
              <p>
                Storefronts on suspended or expired-to-free accounts remain
                accessible but will display the free plan's limitations. We
                will not delete a storefront solely because a paid plan has
                lapsed.
              </p>
            </section>

            {/* 6 */}
            <section id="payments">
              <h2>6. Payments and billing</h2>
              <h3>6.1 Subscription billing</h3>
              <p>
                Koraa is billed in CFA francs (XAF) on the term you choose when
                you pay: one month or one year. The yearly price is set at ten
                times the monthly price, so a year costs two months less than
                twelve single months. Your subscription renews at the end of
                each term, unless you cancel or downgrade before the renewal
                date.
              </p>
              <p>
                Payment is taken by MTN Mobile Money or Orange Money. You must
                ensure your mobile money account has sufficient funds on the
                billing date. If a payment fails we will retry and notify you;
                if it remains unpaid after 14 days, the account will revert to
                the free plan.
              </p>
              <p>
                If you upgrade before your current term ends, you will be
                charged the new plan price immediately and your term will
                extend by the term you paid for, measured from the payment
                date.
              </p>

              <h3>6.2 Transaction fees</h3>
              <p>
                Koraa does not charge a per-transaction fee on your customer
                sales. MTN and Orange Money may charge their standard network
                fees, which are outside our control and are not paid to Koraa.
              </p>

              <h3>6.3 Refunds</h3>
              <p>
                Koraa subscription fees are non-refundable except where
                required by law or at our sole discretion in exceptional
                circumstances (for example, a duplicate charge caused by a
                technical error on our side). Contact{" "}
                <a href="mailto:support@koraa.cm">support@koraa.cm</a> within
                14 days of any incorrect charge.
              </p>

              <h3>6.4 Merchant payouts</h3>
              <p>
                Funds collected from your customers are settled to the mobile
                money number you have registered as your payout account,
                according to the payout schedule of our payment processing
                partner (Fapshi). Koraa is not responsible for delays caused
                by the payment network or by the mobile money operator.
              </p>
            </section>

            {/* 7 */}
            <section id="plan-limits">
              <h2>7. Plan limits and upgrades</h2>
              <p>
                Each plan has limits on the number of stores, products, staff
                accounts, storefront templates, and analytics history. Current
                limits are shown on the{" "}
                <Link href="/#pricing">pricing page</Link> and in your
                dashboard. We may update plan limits — if we reduce limits for
                existing paid subscribers, we will give 30 days' notice.
              </p>
              <p>
                If you exceed a limit (for example by importing more products
                than your plan allows), the excess items may become
                non-functional until you upgrade or remove the excess. We will
                not automatically delete data that exceeds a limit.
              </p>
            </section>

            {/* 8 */}
            <section id="intellectual-property">
              <h2>8. Intellectual property</h2>
              <h3>8.1 Your content</h3>
              <p>
                You retain ownership of all content you upload to Koraa —
                product photographs, descriptions, logos, and any other
                materials ("<strong>Your Content</strong>"). By uploading
                content you grant Koraa a non-exclusive, royalty-free licence
                to store, display, and transmit Your Content as necessary to
                deliver the service (for example, to display your products on
                your storefront).
              </p>
              <p>
                You confirm that you own or have the right to use all content
                you upload, that it does not infringe any third party's
                intellectual property rights, and that it complies with these
                Terms.
              </p>

              <h3>8.2 Koraa's platform</h3>
              <p>
                The Koraa name, logo, platform software, storefront templates,
                and all associated intellectual property belong to Koraa and
                its licensors. You may not copy, modify, reverse-engineer, or
                create derivative works from any part of the platform without
                our prior written consent.
              </p>
            </section>

            {/* 9 */}
            <section id="third-party">
              <h2>9. Third-party services</h2>
              <p>
                Koraa integrates with third-party services including Firebase
                (authentication), MTN Mobile Money, Orange Money, Fapshi
                (payment gateway), Resend (email), and Cloudflare (storage
                and CDN). Your use of these services through Koraa is also
                subject to their respective terms of service.
              </p>
              <p>
                We are not responsible for the availability, accuracy, or
                actions of any third-party service. Outages or changes in
                third-party services may affect features of the Koraa platform
                without us being at fault.
              </p>
            </section>

            {/* 10 */}
            <section id="availability">
              <h2>10. Service availability</h2>
              <p>
                We aim to keep Koraa available at all times but cannot
                guarantee uninterrupted service. We may take the platform
                offline for scheduled maintenance, security patches, or
                emergency fixes. We will give advance notice of planned
                downtime where practical.
              </p>
              <p>
                We do not guarantee that the platform will be error-free or
                that data will never be lost, though we take reasonable steps
                (including regular backups) to prevent both. In the event of
                data loss, our liability is limited as described in section 12.
              </p>
            </section>

            {/* 11 */}
            <section id="termination">
              <h2>11. Termination and suspension</h2>
              <p>
                <strong>By you.</strong> You may close your account at any time
                from Settings → Account → Delete account. On deletion, your
                stores are taken offline and your data is queued for deletion
                after a 90-day grace period during which you may export it.
                Financial records required by law are retained as described in
                our Privacy Policy.
              </p>
              <p>
                <strong>By us.</strong> We may suspend or terminate your
                account immediately and without notice if:
              </p>
              <ul>
                <li>You violate any provision of these Terms</li>
                <li>We are required to do so by law or regulatory order</li>
                <li>We determine that your activity poses a risk to the platform, other users, or third parties</li>
                <li>Your subscription payment fails and remains unpaid after 14 days</li>
              </ul>
              <p>
                Where we terminate for a material breach, no refund will be
                given for unused subscription time. Where we terminate for any
                other reason, we will provide a pro-rata refund at our
                discretion.
              </p>
              <p>
                Sections 3, 4, 8, 12, and 13 survive termination.
              </p>
            </section>

            {/* 12 */}
            <section id="liability">
              <h2>12. Limitation of liability</h2>
              <p>
                To the maximum extent permitted by applicable law:
              </p>
              <ul>
                <li>
                  Koraa provides the platform "<strong>as is</strong>" and
                  "<strong>as available</strong>" without warranties of any
                  kind, express or implied, including warranties of
                  merchantability, fitness for a particular purpose, or
                  non-infringement.
                </li>
                <li>
                  Koraa is not liable for any indirect, incidental, special,
                  consequential, or punitive damages, including lost profits,
                  lost data, or business interruption, arising from your use
                  of or inability to use the platform.
                </li>
                <li>
                  Koraa's total liability to you for any claim arising from
                  these Terms or your use of the platform shall not exceed the
                  amount you paid to Koraa in the 12 months preceding the
                  claim, or 10,000 XAF — whichever is greater.
                </li>
              </ul>
              <p>
                Nothing in these Terms limits liability that cannot legally be
                excluded, such as liability for fraud or personal injury caused
                by our negligence.
              </p>
            </section>

            {/* 13 */}
            <section id="disputes">
              <h2>13. Disputes and governing law</h2>
              <p>
                These Terms are governed by the laws of Cameroon. Any dispute
                that cannot be resolved informally will be submitted to the
                competent courts of Yaoundé, Cameroon, and you consent to the
                exclusive jurisdiction of those courts.
              </p>
              <p>
                Before initiating any formal proceeding, you agree to contact
                us at{" "}
                <a href="mailto:support@koraa.cm">support@koraa.cm</a> and
                give us 30 days to try to resolve the issue informally.
              </p>
            </section>

            {/* 14 */}
            <section id="changes">
              <h2>14. Changes to these terms</h2>
              <p>
                We may update these Terms at any time. When we make a material
                change we will notify merchants by email at least 14 days
                before the change takes effect, and display a notice on the
                dashboard. The "Last updated" date at the top of this page
                reflects the current version. Continuing to use Koraa after
                the effective date means you accept the updated Terms. If you
                do not accept the updated Terms, you may close your account
                before they take effect.
              </p>
            </section>

            {/* 15 */}
            <section id="contact">
              <h2>15. Contact</h2>
              <p>
                For questions about these Terms:
              </p>
              <address className="lp-legal__address">
                <strong>Koraa</strong><br />
                Email: <a href="mailto:support@koraa.cm">support@koraa.cm</a><br />
                Legal: <a href="mailto:legal@koraa.cm">legal@koraa.cm</a>
              </address>
              <p>
                See also our{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
