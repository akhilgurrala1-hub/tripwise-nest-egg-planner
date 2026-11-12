import { createFileRoute, Link } from "@tanstack/react-router";

import { ContactEmail, LegalPage, Section } from "@/components/app/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

const DESCRIPTION =
  "The terms for using Waypoint: what the planner does and doesn't do, your account, fair use, and the limits of estimates.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Waypoint" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Terms of Service | Waypoint" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary={
        <p>
          <strong>The short version.</strong> Waypoint is a free planning tool. Its prices, plans
          and travel rules are estimates and guidance, so check the details with the airline, hotel
          or government before you rely on them. You book and pay on each provider&rsquo;s own site,
          never through us.
        </p>
      }
    >
      <Section title="1. Agreement">
        <p>
          These terms are an agreement between you and {LEGAL.owner}, an individual based in{" "}
          {LEGAL.location} who owns and solely runs Waypoint (&ldquo;Waypoint&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). By using Waypoint you agree to them and to our{" "}
          <Link to="/privacy" className="text-primary underline underline-offset-2">
            Privacy Policy
          </Link>
          . If you don&rsquo;t agree, please don&rsquo;t use Waypoint.
        </p>
      </Section>

      <Section title="2. What Waypoint does, and doesn't do">
        <ul>
          <li>
            Waypoint helps you plan: it estimates a budget, suggests an itinerary, lists what to
            book and tracks what you spend.
          </li>
          <li>
            <strong>Waypoint doesn&rsquo;t sell travel.</strong> We don&rsquo;t book anything, take
            payment or act as a travel agent. Links to providers such as airlines, hotels, KAYAK,
            Skyscanner or Expedia take you to their sites, and their terms and prices apply to
            anything you buy there.
          </li>
          <li>
            <strong>Estimates are not quotes.</strong> Example prices, fare estimates and budgets
            are labeled as estimates. Live prices come from third parties and can change before you
            book.
          </li>
          <li>
            <strong>AI answers can be wrong.</strong> Plans from the AI planner and replies from the
            trip assistant are written by Google&rsquo;s Gemini models and labeled as unverified.
            Check opening hours, prices and availability yourself.
          </li>
          <li>
            <strong>Travel rules are guidance.</strong> Passport, visa, entry and layover
            information comes from public data that can be out of date. Always confirm with the
            destination&rsquo;s government or your airline (each answer links to the IATA Travel
            Centre) before you travel.
          </li>
          <li>
            Weather, photos, introductions, travel guides, places and holidays come from public
            sources credited on the page, and may be incomplete or wrong.
          </li>
        </ul>
      </Section>

      <Section title="3. Your account">
        <ul>
          <li>
            You need to be at least 13 to use Waypoint. If you&rsquo;re under 18, use it with a
            parent or guardian&rsquo;s permission.
          </li>
          <li>
            Give a real email address you can receive mail at, keep your password private, and tell
            us if you think someone else has used your account.
          </li>
          <li>
            One account per person. You&rsquo;re responsible for what happens under your account.
          </li>
          <li>
            You can stop using Waypoint at any time, and ask us to delete your account by writing to{" "}
            <ContactEmail />.
          </li>
        </ul>
      </Section>

      <Section title="4. Fair use">
        <p>
          Some features, such as the AI planner and live prices, cost us money each time they run,
          so they have hourly limits. Please don&rsquo;t:
        </p>
        <ul>
          <li>try to get around those limits, for example with several accounts or scripts;</li>
          <li>scrape, copy or resell Waypoint&rsquo;s data or answers in bulk;</li>
          <li>probe or disrupt the service, or access accounts or data that aren&rsquo;t yours;</li>
          <li>use Waypoint, or share links from it, to break the law or harm anyone.</li>
        </ul>
        <p>
          We may suspend or close accounts that do these things, and will tell you why by email
          unless the law or the situation prevents it.
        </p>
      </Section>

      <Section title="5. Your content">
        <p>
          The trips, notes and costs you enter are yours. You give us permission to store and
          process them only to run Waypoint for you, for example to save your trips and to send trip
          details to the services described in the Privacy Policy when you ask for a plan or prices.
        </p>
      </Section>

      <Section id="credits" title="6. Our content and other people's">
        <p>
          Waypoint&rsquo;s design, code and name belong to us. Some content belongs to others and is
          used under its license: text and photos from Wikipedia, Wikivoyage and Wikimedia Commons
          (CC BY-SA and the photographers&rsquo; licenses), map data from OpenStreetMap contributors
          (ODbL), driving routes from OSRM and the road-trip map from OpenFreeMap (OpenMapTiles and
          OpenStreetMap data), towns from GeoNames (CC BY), weather from Open-Meteo (CC BY 4.0),
          airports from OurAirports (public domain) and passport data from the Passport Index
          dataset (MIT). The credits are listed here, linked from the footer of every page.
        </p>
      </Section>

      <Section title="7. Changes to Waypoint">
        <p>
          Waypoint is free today. We may add, change or remove features, and may introduce paid
          features later. We&rsquo;ll never charge you without your clear agreement first.
        </p>
      </Section>

      <Section title="8. No warranty">
        <p>
          Waypoint is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the
          law allows, we don&rsquo;t promise it will be accurate, complete, uninterrupted or free of
          errors, and we disclaim implied warranties such as merchantability and fitness for a
          particular purpose.
        </p>
      </Section>

      <Section title="9. Limits of our liability">
        <p>
          To the extent the law allows, we aren&rsquo;t liable for indirect or consequential losses,
          such as a missed flight, a denied boarding, a booking that cost more than its estimate, or
          lost data, and our total liability for any claim about Waypoint is limited to the greater
          of the amount you paid us in the 12 months before the claim or US$50. Some places
          don&rsquo;t allow these limits, so they may not all apply to you.
        </p>
      </Section>

      <Section title="10. Law and disputes">
        <p>
          These terms are governed by the laws of {LEGAL.governingLaw} and of the United States,
          without regard to conflict-of-law rules. Any dispute that can&rsquo;t be settled by
          writing to us first will be decided in {LEGAL.venue}, unless the law where you live gives
          you the right to bring it there.
        </p>
      </Section>

      <Section title="11. Changes to these terms">
        <p>
          If we change these terms, we&rsquo;ll update the date at the top, and email account
          holders about important changes before they take effect. Using Waypoint after that means
          you accept the new terms.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these terms: <ContactEmail />.
        </p>
      </Section>
    </LegalPage>
  );
}
