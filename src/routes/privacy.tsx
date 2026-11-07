import { createFileRoute, Link } from "@tanstack/react-router";

import { ContactEmail, LegalPage, Section } from "@/components/app/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

const DESCRIPTION =
  "What Waypoint stores about you, where it lives, which services see your trip details, and how to get your data deleted.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Waypoint" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Privacy Policy | Waypoint" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary={
        <>
          <p>
            <strong>The short version.</strong> You can plan a whole trip without an account, and
            then everything stays in your own browser. If you create an account, we store your email
            and the trips and preferences you choose to save. We don't sell your data, show ads, or
            use tracking or analytics tools.
          </p>
        </>
      }
    >
      <Section title="1. Who we are">
        <p>
          This policy covers the Waypoint website and app (&ldquo;Waypoint&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;). Waypoint is {LEGAL.operator}. Questions about this policy or your data
          go to <ContactEmail />.
        </p>
      </Section>

      <Section title="2. What stays in your browser">
        <p>
          Without an account, Waypoint keeps everything on your device, in your browser&rsquo;s
          local storage. We never receive it. This includes:
        </p>
        <ul>
          <li>
            your current trip: destination, dates, group size, budget, itinerary, bookings you mark
            and costs you log;
          </li>
          <li>your conversation with the trip assistant (only until you close the tab);</li>
          <li>
            display settings: light or dark theme, units, currency, and your home city if you set
            it.
          </li>
        </ul>
        <p>
          Clearing your browser&rsquo;s site data removes all of it. If you sign in, your browser
          also keeps a session token so you stay signed in.
        </p>
      </Section>

      <Section title="3. What we store if you create an account">
        <ul>
          <li>
            <strong>Your email address and password.</strong> Passwords are handled by our
            authentication provider and stored hashed; we can&rsquo;t read them.
          </li>
          <li>
            <strong>Trips you choose to save</strong>, with everything in them.
          </li>
          <li>
            <strong>Travel preferences you choose to save</strong> on your profile: home city, home
            airport, travel style, usual group size, how you like to travel, interests and loyalty
            memberships.
          </li>
          <li>
            <strong>Bookings you record</strong>: provider, price, status, confirmation code and
            notes. Waypoint never books anything or takes payment, so we never see card details.
          </li>
        </ul>
        <p>
          Each account can only read its own records; this is enforced in the database itself, not
          just in the app.
        </p>
      </Section>

      <Section title="4. Services that see your trip details">
        <p>
          To look things up, Waypoint sends the minimum needed (usually a place name, coordinates or
          dates, never your email) to these services:
        </p>
        <ul>
          <li>
            <strong>From your browser, for everyone:</strong> Open-Meteo (weather and place search),
            Wikipedia, Wikivoyage and Wikimedia (photos, introductions, travel guides, landmarks),
            OpenStreetMap&rsquo;s Overpass service (restaurants), Nager.Date (public holidays) and
            Frankfurter (exchange rates). Like any website, they see your IP address when your
            browser asks them for something.
          </li>
          <li>
            <strong>Only when you tap &ldquo;Use my location&rdquo;:</strong> your device&rsquo;s
            location is sent to BigDataCloud to find the name of your town. The coordinates are kept
            with your trip (in your browser, or in your account if you save the trip) to measure
            distances, and are left out of shared trip links.
          </li>
          <li>
            <strong>Only for signed-in travelers, when you press the button:</strong> the AI planner
            and trip assistant (your trip details and messages go through the Lovable AI gateway to
            the model provider that answers), Google Maps (routes and places), and SerpApi (Google
            Flights and Google Hotels prices) and the U.S. Energy Information Administration (gas
            prices) for live prices.
          </li>
          <li>
            <strong>Hosting:</strong> Waypoint runs on Cloudflare, and accounts and saved trips are
            stored with Lovable Cloud (built on Supabase). Cloudflare tells our server the
            approximate city your connection comes from, which we use only to suggest a starting
            city. It isn&rsquo;t stored.
          </li>
        </ul>
        <p>
          Each of these services handles data under its own privacy policy. We don&rsquo;t send them
          anything for advertising, and they don&rsquo;t receive your account details from us.
        </p>
      </Section>

      <Section title="5. Shared trip links">
        <p>
          When you share a trip, the whole plan is packed into the link itself, after the
          &ldquo;#&rdquo;. That part of a link is never sent to our server, so we don&rsquo;t keep a
          copy. Anyone with the link can see the plan. Shared links leave out your bookings, logged
          costs, passport, account and exact location.
        </p>
      </Section>

      <Section title="6. Cookies and tracking">
        <p>
          Waypoint doesn&rsquo;t use advertising cookies, analytics, tracking pixels or session
          recording. Our hosting provider may set a cookie needed to protect the site from abuse.
        </p>
      </Section>

      <Section title="7. How long we keep it">
        <ul>
          <li>Data in your browser stays until you clear it.</li>
          <li>
            Account data stays until you delete it or ask us to. Deleting a saved trip in{" "}
            <Link to="/trips" className="text-primary underline-offset-2 hover:underline">
              Saved trips
            </Link>{" "}
            removes it from your account right away; write to us if you want it permanently erased
            from our database as well.
          </li>
          <li>
            To keep the service affordable, we hold a few hours of identical price searches (places
            and dates only, nothing about you) and an hourly count of each account&rsquo;s AI and
            price requests in server memory.
          </li>
        </ul>
      </Section>

      <Section title="8. Your choices and rights">
        <p>
          Wherever you live, you can ask us to show you, correct, export or delete the data tied to
          your account by writing to <ContactEmail /> from the email address on the account. We
          answer within 30 days. If you live where privacy laws give you further rights, such as the
          EU, the UK or California, we&rsquo;ll honor them, and you can also complain to your local
          data protection authority.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          Connections are encrypted (HTTPS), each account can only read its own records, services
          that cost money require sign-in and are rate limited, and API keys stay on the server. No
          system is perfectly secure; if we learn of a breach affecting your data, we&rsquo;ll tell
          you by email.
        </p>
      </Section>

      <Section title="10. Children">
        <p>
          Waypoint isn&rsquo;t meant for children under 13, and we don&rsquo;t knowingly collect
          their data. If you believe a child has created an account, write to us and we&rsquo;ll
          delete it.
        </p>
      </Section>

      <Section title="11. Changes to this policy">
        <p>
          If we change this policy, we&rsquo;ll update the date at the top. If a change affects how
          we use data you&rsquo;ve already given us, we&rsquo;ll email account holders before it
          takes effect.
        </p>
      </Section>
    </LegalPage>
  );
}
