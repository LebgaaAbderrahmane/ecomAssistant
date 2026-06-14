# Product Requirements Document — EcomAssistant MVP

**Version**: 1.0  
**Date**: June 2026  
**Status**: Draft

---

## 1. Product overview

### 1.1 Product summary

EcomAssistant is a SaaS platform that provides Algerian e-commerce merchants with an AI-powered WhatsApp agent. The agent handles the full post-order COD workflow: confirming orders with customers, following up on non-responses, answering product questions, and suggesting related products — all in Derdja, French, and Modern Standard Arabic, 24/7.

### 1.2 Problem statement

Algerian e-commerce runs almost entirely on Cash on Delivery (COD). Failed deliveries are the #1 cost driver for merchants: a driver shows up, the customer isn't there, denies the order, or simply never confirmed. This happens because confirmation is done manually — by phone call or WhatsApp message — which is time-consuming, inconsistent, and doesn't scale.

Additionally:
- Customers send voice notes instead of typing, especially in Derdja.
- Customers ask product questions before or during confirmation.
- Merchants lose revenue because no one is available 24/7 to respond.

### 1.3 Solution

A self-serve platform where merchants connect their Shopify or WooCommerce store, set up their WhatsApp Business number, and get an AI agent that:
- Automatically contacts customers after an order is placed.
- Confirms COD orders in conversational Derdja/French/Arabic.
- Follows up automatically if there is no response.
- Answers product questions from the synced catalog.
- Suggests related products based on what the customer ordered.
- Understands voice messages and product images from customers.
- Creates the confirmed delivery order directly in Yalidine or Procolis.

### 1.4 Target users

**Primary**: Algerian e-commerce merchants running COD stores on Shopify or WooCommerce.  
**Secondary**: Small teams managing multiple stores.

### 1.5 Success metrics (MVP)

| Metric | Target at 3 months |
|---|---|
| Active paying merchants | 30 |
| Order confirmation rate (agent-handled) | ≥ 65% |
| Average time to confirm an order | < 10 minutes |
| Agent conversation resolution rate (no human needed) | ≥ 75% |
| Merchant churn in first month | < 15% |

---

## 2. Scope

### 2.1 In scope (MVP)

- Merchant self-serve onboarding (signup, store connection, WhatsApp setup)
- Shopify integration (OAuth, catalog sync, order webhooks)
- WooCommerce integration (API key, catalog sync, order webhooks)
- WhatsApp Cloud API integration (Meta)
- AI agent: order confirmation, follow-ups, product Q&A, product suggestions
- Multilingual: Derdja + French + Modern Standard Arabic
- Voice message understanding (STT → LLM processing → text reply)
- Image recognition: customer sends product photo → agent identifies from catalog
- Delivery integration: Yalidine and Procolis (auto-create shipment on confirmed order)
- Wilaya-based delivery cost communication
- Customer identification by phone number
- Merchant dashboard: conversation view, escalation management, basic KPIs, agent configuration
- Subscription billing in DZD (monthly plans)

### 2.2 Out of scope (post-MVP)

- Anti-fraud / customer blacklisting
- Pack / bundle promotions
- Fine-tuned custom model
- Additional delivery integrations (Maystro, Ecotrack, Guepex, etc.)
- Agent voice replies (agent replies in text only for MVP)
- Multi-store support per account
- Mobile app for merchants
- Public API for third-party developers

---

## 3. User stories

### Merchant (onboarding)

- As a merchant, I can sign up with my email and create an account without contacting anyone.
- As a merchant, I can connect my Shopify or WooCommerce store via OAuth or API key so my catalog syncs automatically.
- As a merchant, I can set up my WhatsApp Business number through Meta's Embedded Signup directly in the dashboard.
- As a merchant, I can configure the agent's language preference, follow-up timing, and tone before going live.
- As a merchant, I can test the agent on my catalog before activating it.

### Merchant (operations)

- As a merchant, I can see all conversations the agent is having, in real time.
- As a merchant, I can take over a conversation manually when the agent escalates or when I choose to.
- As a merchant, I can see which orders were confirmed, which are pending, and which failed.
- As a merchant, I can see KPIs: confirmation rate, follow-up stats, average confirmation time.

### End customer (buyer)

- As a customer, I receive a WhatsApp message after placing an order asking me to confirm.
- As a customer, I can confirm or cancel my order by replying in Derdja, French, or Arabic.
- As a customer, I can send a voice note and the agent understands it.
- As a customer, I can send a photo of a product and get information about it.
- As a customer, I can ask questions about the product I ordered and get answers.
- As a customer, I am told the delivery cost based on my wilaya.
- As a customer, I receive a follow-up if I haven't replied within the configured time.

---

## 4. Functional requirements

### 4.1 Onboarding & authentication

- Email/password signup with email verification.
- Google OAuth signup as an option.
- Onboarding wizard: (1) store connection → (2) WhatsApp setup → (3) agent configuration → (4) activation.
- No manual activation required; merchant goes live independently.

### 4.2 Store integration

**Shopify**
- OAuth connection (read access: products, orders, customers).
- Webhook subscription: `orders/create` triggers the confirmation flow.
- Catalog sync: product name, description, price, images, variants, stock status.
- Full resync available on demand from the dashboard.

**WooCommerce**
- Connection via WooCommerce REST API (consumer key + secret).
- Webhook: `woocommerce_new_order` triggers the confirmation flow.
- Same catalog data fields as Shopify.

### 4.3 WhatsApp integration

- Meta WhatsApp Cloud API (official).
- Meta Embedded Signup flow built into the dashboard.
- Message templates submitted and approved through the platform.
- Outbound: template message sent when order is created (must be a Meta-approved template).
- Inbound: free-form replies handled by the AI agent session.
- One WhatsApp number per merchant account (MVP).

### 4.4 AI agent — conversation engine

**Languages**: Derdja, French, MSA. Agent detects language from the customer's reply and responds in kind. Default language configurable by merchant.

**LLM backbone**: Cloud LLM (Claude or GPT-4) via API. System prompt includes:
- Merchant's catalog (product names, prices, descriptions, delivery pricing matrix by wilaya).
- Merchant's configured tone (formal / friendly).
- Conversation objective (confirm order, answer questions, suggest products).
- Strict output rules (no hallucinated products, no invented prices).

**Conversation capabilities**:

| Capability | Description |
|---|---|
| Order confirmation | Present order summary, ask for confirmation, record response. |
| Cancellation | Accept cancellation, update order status in store. |
| Follow-up | Send follow-up at T+2h, T+24h, T+48h if no response (configurable). |
| Product Q&A | Answer questions about the ordered product using catalog data. |
| Product suggestion | After confirmation, suggest 1–2 related products based on the order. |
| Delivery cost | Look up wilaya from customer address, communicate delivery fee. |
| Escalation | Escalate to merchant dashboard if: customer is angry, agent cannot answer, customer explicitly requests a human. |

**Session management**: Each customer phone number has an active session tied to the current order. Sessions expire after 48h of inactivity.

### 4.5 Voice message handling

1. Customer sends voice note on WhatsApp.
2. Platform downloads the audio file via WhatsApp Cloud API.
3. Audio sent to speech-to-text service (Whisper or equivalent) — supports Arabic, French, Algerian Derdja.
4. Transcribed text passed to the LLM as the customer's message.
5. Agent replies in text.

### 4.6 Image recognition

1. Customer sends an image (product inquiry).
2. Platform downloads the image via WhatsApp Cloud API.
3. Image passed to a vision model (LLM with vision capability).
4. Model is prompted to identify the product from the merchant's catalog based on visual match.
5. Agent replies with product info if matched, or clarifies if not found.

### 4.7 Delivery integration

**Yalidine and Procolis** supported at MVP.

On order confirmation:
1. Platform retrieves the confirmed order details (customer name, phone, address, wilaya, product, COD amount).
2. API call to the selected delivery provider to create a shipment.
3. Tracking number returned and stored on the order record.
4. Agent sends tracking confirmation to the customer via WhatsApp.

Merchant selects their preferred delivery provider in dashboard settings. Credentials (API key / token) entered by merchant.

**Wilaya delivery cost matrix**: A configurable table (48 wilayas × price) stored per merchant. Default matrix provided on signup. Merchant can edit.

### 4.8 Merchant dashboard

**Conversations view**
- List of all conversations (filtered by: all / pending / confirmed / escalated / failed).
- Click into any conversation to see full message history.
- "Take over" button to disable the agent and reply manually for that conversation.
- "Re-activate agent" button to hand back to the agent.

**Escalations**
- Dedicated view for conversations flagged for human attention.
- Notification badge on dashboard when new escalation occurs.

**KPIs (home screen)**
- Total orders handled this month.
- Confirmation rate (%).
- Average confirmation time.
- Pending follow-ups count.
- Failed / cancelled orders count.

**Agent configuration**
- Default language (Derdja / French / Arabic / Auto-detect).
- Tone (formal / friendly).
- Follow-up delays (T+Xh, T+Yh, T+Zh) — configurable per merchant.
- Max follow-up attempts (1–3).
- Delivery provider selection (Yalidine / Procolis).
- Delivery cost matrix editor (wilaya × price table).

**Store & WhatsApp settings**
- Reconnect / refresh store integration.
- Resync catalog manually.
- WhatsApp number status and reconnection.

### 4.9 Billing

- Subscription model in DZD.
- Monthly billing via CIB/Edahabia card (or bank transfer for MVP fallback).
- Plans based on conversation volume (to be defined during pricing research).
- 14-day free trial on signup.
- Plan upgrade/downgrade from dashboard.

---

## 5. Non-functional requirements

| Category | Requirement |
|---|---|
| Availability | 99.5% uptime target for the agent processing pipeline |
| Latency | Agent response to customer message: < 8 seconds (p95) |
| Scalability | Architecture must support multi-tenant isolation from day one |
| Security | WhatsApp credentials and delivery API keys encrypted at rest (Vault or equivalent) |
| Data privacy | Customer phone numbers and conversation data scoped per merchant tenant, never shared |
| Compliance | WhatsApp Cloud API terms of service; Meta template approval process respected |
| Language | All UI strings in French for the merchant dashboard (MVP); Arabic UI is post-MVP |

---

## 6. System architecture overview

### 6.1 Components

```
┌─────────────────────────────────────────────────────────┐
│                    Merchant Dashboard (React)            │
└─────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────┐
│                    Backend API (Node.js / Express)       │
│  - Auth  - Merchant config  - Webhooks  - Billing        │
└──────┬──────────────┬────────────────┬───────────────────┘
       │              │                │
┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────────────────┐
│  Store      │ │  WhatsApp  │ │  Agent Engine            │
│  Connectors │ │  Gateway   │ │  (LLM + STT + Vision)    │
│  Shopify    │ │  Meta API  │ │                          │
│  WooCommerce│ │            │ │                          │
└─────────────┘ └─────┬──────┘ └──────────────────────────┘
                      │
              ┌───────▼───────┐
              │  Delivery     │
              │  Connectors   │
              │  Yalidine     │
              │  Procolis     │
              └───────────────┘
```

### 6.2 Recommended tech stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React + Vite + TailwindCSS | Fast, familiar, component-based |
| Backend API | Node.js + Express (or Fastify) | JavaScript throughout, fast iteration |
| Database | PostgreSQL (via Supabase or Railway) | Relational, RLS for multi-tenancy |
| Queue / async jobs | BullMQ + Redis | Follow-up scheduling, async LLM calls |
| LLM | Claude API or OpenAI GPT-4o | Via API, no self-hosting needed for MVP |
| STT | OpenAI Whisper API | Best Arabic/Derdja accuracy available |
| Vision | GPT-4o Vision or Claude 3.5 Sonnet | Product image matching |
| WhatsApp | Meta WhatsApp Cloud API | Official, no ban risk |
| Auth | Supabase Auth or Auth0 | Ready-made, handles OAuth |
| Hosting | Railway or Render (backend) + Vercel (frontend) | Easy deploy, scales when needed |
| Payments | Chargily (Algerian payment gateway, CIB/Edahabia) | Only real option for DZD billing in Algeria |

---

## 7. Agent conversation flow

### 7.1 Primary flow — COD confirmation

```
Order created in Shopify/WooCommerce
        ↓
Webhook received by EcomAssistant backend
        ↓
Build order context (product, price, wilaya, delivery cost)
        ↓
Send WhatsApp template message to customer
"Salam [Name], lkomanda dyalek [Product] b [Price] DZD
 tcakkad? Frais livraison [Wilaya]: [Cost] DZD"
        ↓
Wait for customer reply
        ↓
    ┌───▼────────────────────────────────────────────────┐
    │              Customer replies                       │
    ├──────────────┬──────────────┬───────────────────────┤
    │   Confirms   │   Cancels    │  Asks question /      │
    │              │              │  sends voice / image  │
    └──────┬───────┴──────┬───────┴──────────┬────────────┘
           ↓              ↓                  ↓
    Create shipment  Update order       Answer via LLM
    in Yalidine or   as cancelled       then re-ask for
    Procolis         in store           confirmation
           ↓
    Send tracking    
    number to        
    customer         
```

### 7.2 Follow-up flow

```
No reply after T+2h  →  Follow-up message 1
No reply after T+24h →  Follow-up message 2
No reply after T+48h →  Follow-up message 3 (final)
Still no reply       →  Mark as failed, escalate to dashboard
```

---

## 8. Phased delivery plan

### Phase 1 — Core infrastructure (weeks 1–4)
- Project setup, database schema, auth system
- Merchant onboarding flow (signup → store connection → WhatsApp)
- Shopify webhook + catalog sync
- Basic WhatsApp send/receive (no AI yet — manual replies)
- Minimal dashboard: conversation list + message view

### Phase 2 — AI agent (weeks 5–8)
- LLM integration with system prompt (Derdja/FR/AR)
- Order confirmation conversation flow
- Follow-up scheduler (BullMQ)
- Escalation logic
- Agent configuration in dashboard

### Phase 3 — Voice, image, delivery (weeks 9–12)
- Whisper STT integration
- Vision model for product image recognition
- Yalidine API integration
- Procolis API integration
- Wilaya delivery cost matrix
- WooCommerce integration

### Phase 4 — Dashboard & billing (weeks 13–16)
- KPI dashboard (charts, stats)
- Chargily billing integration (subscriptions in DZD)
- Product suggestion feature
- End-to-end QA and hardening
- Beta launch with 5–10 pilot merchants

---

## 9. Open questions (to resolve before development)

1. **Chargily**: Does Chargily support recurring subscriptions, or will billing be manual invoice for MVP?
2. **Wilaya default pricing matrix**: Who defines the default delivery cost per wilaya — us or the merchant on first setup?
3. **Meta template approval**: Which pre-approved template messages are needed for the confirmation and follow-up flows? Must be prepared and approved before launch.
4. **Derdja system prompt**: What is the initial system prompt strategy for Derdja coverage? Need a dedicated prompt engineering phase.
5. **Yalidine / Procolis API access**: Are their APIs publicly documented and accessible for Algerian developers, or does it require a partnership agreement?
6. **Data residency**: Should customer conversation data be stored in an EU or local server? (Relevant if targeting enterprise merchants later.)
