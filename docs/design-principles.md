# Ecosystem Design Principles

- Version: 1.0
- Status: Accepted

One page. These principles decide arguments. When two options both seem fine, the one that better fits a principle wins.

## 1. Relationships over contacts

The product is a relationship graph, not a contact list. Every screen should make "who knows whom, and how well" easier to see. If a design treats people as isolated cards, it is fighting the model.

## 2. Evidence over scores

Show what happened. Do not ask people to maintain abstract numbers. A timeline of real activity beats a Warmth score every time. We earn the right to compute a score only after we have accumulated the evidence behind it.

## 3. Warm data over cold data

The valuable context is human: who owns the relationship, when we last spoke, what was said, where we met. That beats decision-power metrics and influence ratings. Lead with the warm data.

## 4. Honest inference

When the system computes or infers something, it says so. An inferred connection looks different from a confirmed one. Generated suggestions are labelled as generated. The system never launders a guess into a fact. This is what makes the intelligence trustworthy rather than slick.

## 5. Progressive disclosure

Especially for Orbit and any graph view. Default to a filtered, legible state. Filter before you decorate. Detail lives in a panel that opens on demand, not crammed into every node and row. Reduce cognitive load first, add richness second.

## 6. Computed truth stays computed

Layer 1 (what people enter), Layer 2 (what the system derives) and Layer 3 (what AI reasons) stay separate. Derived values are views, not editable columns. AI and sync follow ADR 0010: provenance-tagged sync facts may auto-write; identity, connections, and enrichment require human action; AI enrichment is labelled, never silent overwrite.

## What world-class means here

Not the flashiest graph, not AI chat on day one, not a bespoke design system before we have used the product. It means clarity and trust in relationship intelligence: search that returns evidence fast, Orbit as a real operating view of the network, inference shown honestly, and privacy handled with care before email goes anywhere near production.
