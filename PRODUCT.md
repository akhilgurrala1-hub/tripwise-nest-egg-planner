# Product

## Platform

web

## Stack

TanStack Start (React 19, Vite), Tailwind CSS v4, Radix UI, Supabase (auth, database), Vercel hosting.

## Users

Ordinary travelers, roughly 20 to 45, planning road trips, flights, cruises, train and bus trips or staycations on a real budget. They use phones on the go and laptops at home. They are not finance people: they want to know what the trip costs and what to do next. Many arrive signed out.

## Product Purpose

Waypoint prices a whole trip to the dollar, plans each day, and lists what to book. A traveler states a trip in plain words or picks a place; the app builds the budget, the itinerary with real places, the road route and the booking list, and tracks spending during the trip. It never books or takes payment.

## Positioning

An honest planner: estimates are labeled as estimates, unpublished prices say "not listed", nothing is called free unless a source says so. Free and keyless data (Open-Meteo, Wikipedia, OpenStreetMap) wherever possible.

## Operating Context

Operate mode: people complete tasks (set a budget, read a total, edit a day, record a cost). The Plan page is the front door and doubles as a Persuade surface. Every page works signed out, from 320px to wide desktop, in light and dark.

## Capabilities and Constraints

Budget math is pure functions; UI never computes totals. Photos come from Wikipedia at runtime. No paid APIs. Accessibility: axe clean, 44px targets, 4.5:1 text.

## Brand Commitments

Owner is replacing the previous identity (blue and coral, Instrument Sans, "W" route tile) in full: new mark, favicon, palette and type. No violet, no gradients, no pill buttons, no em dashes in the UI, no fake metrics or reviews.

## Evidence on Hand

Real destination photos from Wikipedia, real prices from the app's own budget engine. Brand assets are generated from `public/favicon.svg` by `scripts/brand-assets.mjs`.

## Product Principles

1. The trip is the product: every screen answers what it costs and what to do next.
2. Say it once.
3. Honest numbers.
4. Works signed out, on any screen.

## Accessibility & Inclusion

WCAG AA. Over or under budget never relies on red versus green alone. Reduced motion respected.
