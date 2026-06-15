EcomAssistant — Implementation Plan 

## **EcomAssistant** 

## Implementation Plan — MVP 

Version 1.0 — June 2026 

Team: 2 full-stack developers 

Duration: 16 weeks (4 phases of 4 weeks) 

_This plan assumes both developers are comfortable across the stack (Node.js/Express backend, React frontend, PostgreSQL). Tasks are split to minimize blocking dependencies between the two developers within each phase. Dev A leads backend/infrastructure-heavy work; Dev B leads frontend/integration-heavy work — but both contribute to both layers as needed._ 

Page 1 

EcomAssistant — Implementation Plan 

## **0. Pre-development setup (before week 1)** 

- Register Meta Developer account and create a WhatsApp Business app (sandbox). 

- Create Shopify Partner account + dev store for testing. 

- Create a WooCommerce test site (local or hosted) with sample products. 

- Apply for Yalidine and Procolis API access — confirm documentation and sandbox availability (this can take time, start early). 

- Set up Chargily merchant account for DZD payments. 

- Set up cloud accounts: Railway/Render (backend), Vercel (frontend), Supabase (DB + auth + storage). 

- Set up shared repo (monorepo recommended): /apps/api, /apps/dashboard, /packages/shared. 

- Set up CI: lint + test on PR, auto-deploy main branch to staging. 

- Get API keys: Anthropic/OpenAI (LLM), OpenAI Whisper (STT). 

Page 2 

EcomAssistant — Implementation Plan 

## **Phase 1 — Core infrastructure (weeks 1-4)** 

Goal: a merchant can sign up, connect a Shopify store, see synced products, and connect WhatsApp. Orders create conversations and basic manual messaging works (no AI yet). 

## **Week 1** 

## **Dev A — Backend foundation** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Project scaffolding|Initialize Express app, folder structure,<br>env config, error handling middleware,<br>logging (pino).|A|
|Database schema (part 1)|Create PostgreSQL schema +<br>migrations for: merchants,<br>store_connections, products,<br>agent_configs. Set up RLS policies.|A|
|Auth system|Implement signup/login with Supabase<br>Auth or custom JWT. Email verification<br>flow.|A|
|GET /me endpoint|Returns merchant profile and<br>onboarding_step.|A|



## **Dev B — Frontend foundation** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Dashboard scaffolding|Initialize React + Vite + Tailwind project,<br>routing (React Router), layout shell<br>(sidebar + topbar).|B|
|Auth screens|Sign up, login, email verification pages,<br>connected to backend auth endpoints.|B|
|Onboarding shell|4-step progress indicator component,<br>route structure for /onboarding/store,<br>/whatsapp, /agent, /activate.|B|
|Design system setup|Tailwind theme config (colors, spacing<br>per design doc section 8), shared UI<br>components: Button, Card, Badge,<br>Input.|B|



Page 3 

EcomAssistant — Implementation Plan 

## **Week 2** 

## **Dev A — Shopify integration** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Shopify OAuth flow|Implement /integrations/shopify/connect<br>and /callback. Store access_token<br>encrypted.|A|
|Shopify catalog sync job|Fetch products via Shopify Admin API,<br>upsert into products table. Implement<br>/integrations/sync.|A|
|Shopify order webhook|Register orders/create webhook on<br>connect. Implement<br>/webhooks/shopify/orders — verify<br>HMAC, upsert order.|A|
|Database schema (part 2)|Migrations for: orders, conversations,<br>messages, wilaya_pricing (seed default<br>48-wilaya pricing).|A|



## **Dev B — Onboarding UI: store connection** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Store connection screen|Build screen 6.2:<br>Shopify/WooCommerce selection cards,<br>Shopify domain input, OAuth redirect<br>handling.|B|
|Sync status UI|Spinner + product count display,<br>polling /integrations/sync status.|B|
|Catalog screen (read-only)|Build screen 6.9: table of synced<br>products with thumbnails, stock badges,<br>resync button.|B|
|Encryption utility|Shared package for<br>encrypting/decrypting secrets (used by<br>both Shopify and WooCommerce<br>credentials).|B|



Page 4 

EcomAssistant — Implementation Plan 

## **Week 3** 

## **Dev A — WooCommerce + WhatsApp setup** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|WooCommerce integration|Implement<br>/integrations/woocommerce/connect<br>(test connection via REST API), catalog<br>sync, order webhook handler.|A|
|WhatsApp Cloud API setup|Register app webhook, implement<br>/whatsapp/embedded-signup/callback,<br>store phone_number_id and access<br>token per merchant.|A|
|Outbound message service|Generic<br>sendWhatsAppMessage(merchantId, to,<br>payload) — supports template and free-<br>form text.|A|
|Webhook receiver: WhatsApp inbound|Implement /webhooks/whatsapp —<br>verify signature, parse message types<br>(text/voice/image), create/find<br>conversation, log message.|A|



## **Dev B — Onboarding UI: WhatsApp + Agent config** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|WhatsApp connection screen|Build screen 6.3: Embedded Signup<br>button integration, connection status<br>display, template approval status list.|B|
|Agent config screen|Build screen 6.4: language/tone radios,<br>follow-up timing inputs, delivery provider<br>selection, wilaya pricing table<br>(collapsible).|B|
|Wilaya pricing table component|Reusable 48-row editable table<br>component (used in onboarding and<br>settings).|B|
|Onboarding completion + activation|Activate button, calls backend to set<br>onboarding_step = done and merchant<br>status = active.|B|



Page 5 

EcomAssistant — Implementation Plan 

## **Week 4** 

## **Dev A — Conversations backend** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Conversations API|GET /conversations (filters, search),<br>GET /conversations/:id with messages.|A|
|Manual reply endpoint|POST /conversations/:id/messages —<br>merchant sends manual reply via<br>WhatsApp API.|A|
|Takeover endpoint|POST /conversations/:id/takeover —<br>toggles conversation.status between<br>agent_active and human_active.|A|
|Order confirmation message job|send_confirmation_message job: on<br>new order, build template payload using<br>product + wilaya_pricing, send via<br>WhatsApp, create conversation.|A|



## **Dev B — Conversations UI** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Conversations list screen|Build screen 6.6: filter tabs, search,<br>table with status badges.|B|
|Conversation detail screen|Build screen 6.7: chat thread (bubbles),<br>order summary header, takeover toggle,<br>manual reply input.|B|
|Voice/image message rendering|Render voice messages with play icon<br>(audio player), images as thumbnails<br>with lightbox.|B|
|End-to-end smoke test (Phase 1)|Both devs: full manual walkthrough —<br>signup → connect store → connect<br>WhatsApp → place test order → see<br>conversation → reply manually.|A+B|



## **Phase 1 deliverables checklist** 

- Merchant can sign up and complete onboarding end to end (Shopify or WooCommerce + WhatsApp + agent config). 

- Catalog syncs and displays correctly. 

- New orders trigger a WhatsApp template message to the customer. 

- Inbound messages (text/voice/image) are received and logged, visible in dashboard. 

- Merchant can manually reply and take over a conversation. 

Page 6 

EcomAssistant — Implementation Plan 

## **Phase 2 — AI agent core (weeks 5-8)** 

Goal: the agent automatically handles order confirmation conversations in Derdja/French/MSA, runs follow-ups, and escalates when needed. 

## **Week 5** 

## **Dev A — LLM integration core** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|LLM client wrapper|Shared service for calling Claude/GPT-4<br>API with retries, timeout, token usage<br>logging.|A|
|System prompt builder|Function assembling the prompt per<br>design doc 5.2: persona, constraints,<br>catalog excerpt, order summary, wilaya<br>cost, history.|A|
|Structured output parsing|Define and parse the LLM's structured<br>response: reply text, intent, detected<br>language.|A|
|Agent engine: message handler|On inbound message, build prompt, call<br>LLM, parse intent, persist agent reply as<br>outbound message.|A|



## **Dev B — Prompt content + language testing harness** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Derdja/French/MSA prompt content|Draft and iterate<br>persona/tone/instruction blocks for each<br>language mode. Collaborate closely<br>with Dev A on prompt builder interface.|B|
|Internal testing tool|Simple internal page (or script) to send<br>test messages to the agent and view<br>raw LLM responses, for prompt<br>iteration.|B|
|Catalog excerpt selection logic|Logic to select relevant products<br>(ordered product + N similar) to include<br>in the prompt, keeping token usage<br>bounded.|B|
|Message template management UI|Settings screen section to view template<br>approval statuses and copy template<br>text for Meta submission.|B|



Page 7 

EcomAssistant — Implementation Plan 

## **Week 6** 

## **Dev A — Intent handling: confirmation & cancellation** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Confirm intent handler|On 'confirmed' intent: update<br>order.confirmation_status,<br>conversation.status, trigger shipment<br>creation job (stub for now).|A|
|Cancel intent handler|On 'cancelled' intent: update order<br>status, push cancellation back to<br>Shopify/WooCommerce via API.|A|
|Conversation state machine implementation|Implement transitions per design doc<br>5.3 as a single reusable function/module<br>with full test coverage.|A|
|LLM call cost monitoring|Log token usage per merchant for future<br>billing/limits awareness.|A|



## **Dev B — Follow-up scheduler** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|BullMQ setup|Set up Redis + BullMQ queue and<br>worker process.|B|
|Follow-up jobs|Schedule follow-up jobs at<br>T+2h/24h/48h (configurable per<br>merchant) on order creation; each job<br>checks confirmation_status before<br>sending.|B|
|Follow-up message builder|Build follow-up template payloads per<br>design doc 5.4 templates 1-3.|B|
|Expired order handling|After max follow-ups with no reply: mark<br>order as failed/expired, create<br>escalation row with reason<br>max_followups_reached.|B|



Page 8 

EcomAssistant — Implementation Plan 

## **Week 7** 

## **Dev A — Product Q&A and suggestions** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Product Q&A intent handler|On 'question' intent: ensure catalog<br>excerpt in prompt covers the asked-<br>about product; return informational reply<br>without changing order state.|A|
|Product suggestion logic|After confirmation, select 1-2 related<br>products (simple rule-based: same<br>category or co-purchase frequency for<br>MVP) and have agent propose them.|A|
|pgvector setup (optional fallback)|If time allows, set up embeddings for<br>products to improve suggestion<br>relevance; otherwise defer.|A|
|Escalation creation logic|Implement escalation triggers per<br>design doc 5.5: angry sentiment, explicit<br>human request, low-confidence LLM<br>response.|A|



## **Dev B — Escalations UI + Dashboard KPIs (part 1)** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Escalations list screen|Build screen 6.8: list, reason badges,<br>mark resolved action, bulk resolve.|B|
|Escalation notification badge|Sidebar badge showing count of open<br>escalations, polling or websocket-<br>based.|B|
|KPI backend endpoint (collab)|Work with Dev A to define GET /kpis<br>response shape: orders this month,<br>confirmation rate, avg confirmation time,<br>pending follow-ups.|B|
|Dashboard home screen (part 1)|Build screen 6.5 KPI cards layout with<br>mock data, ready to wire to real<br>endpoint.|B|



Page 9 

EcomAssistant — Implementation Plan 

## **Week 8** 

## **Dev A — KPIs backend + hardening** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|GET /kpis implementation|Compute confirmation rate, avg<br>confirmation time, pending follow-ups,<br>orders count from orders table.|A|
|Conversation expiry job|Background job to mark conversations<br>expired after 48h inactivity per design<br>doc.|A|
|Rate limiting|Implement per-merchant outbound<br>message rate limiting to respect<br>WhatsApp limits.|A|
|Error handling & retries|Add retry logic for LLM calls, WhatsApp<br>API calls, and store API calls with<br>exponential backoff.|A|



## **Dev B — Dashboard home (part 2) + multilingual QA** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Wire KPI cards to real data|Connect screen 6.5 to GET /kpis, add<br>14-day confirmation/cancellation chart<br>(e.g. recharts).|B|
|Recent escalations widget|Add widget to dashboard home showing<br>5 most recent open escalations.|B|
|Multilingual agent QA pass|Run structured test conversations in<br>Derdja, French, and MSA; log issues for<br>prompt refinement with Dev A.|B|
|End-to-end test (Phase 2)|Both devs: place a test order, simulate<br>full conversation (confirm, question,<br>suggestion, follow-up trigger) and verify<br>dashboard reflects state correctly.|A+B|



## **Phase 2 deliverables checklist** 

- Agent automatically responds to customers in Derdja, French, and MSA. 

- Order confirmation and cancellation update order status correctly. 

- Follow-ups fire automatically per configured schedule. 

- Product questions and suggestions work using catalog data. 

- Escalations are created automatically and visible in dashboard. 

- Dashboard home shows real KPIs. 

Page 10 

EcomAssistant — Implementation Plan 

## **Phase 3 — Voice, image, delivery (weeks 9-12)** 

Goal: agent understands voice notes and product images; confirmed orders automatically create shipments in Yalidine/Procolis. 

## **Week 9** 

## **Dev A — Voice message pipeline** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Media download service|Service to download voice/image media<br>from WhatsApp Cloud API given media<br>ID, store in object storage.|A|
|Whisper STT integration|Send downloaded audio to Whisper<br>API, handle Arabic/French/Derdja<br>transcription, store transcription in<br>messages.content.|A|
|Agent engine: voice flow|Wire transcription output into the<br>existing message handler as effective<br>text input.|A|
|STT error handling|Handle unsupported formats,<br>transcription failures — fall back to<br>asking customer to type.|A|



## **Dev B — Image message pipeline** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Image download + storage|Reuse media download service for<br>images, store in object storage with<br>merchant-scoped paths.|B|
|Vision model integration|Send image + relevant catalog subset to<br>vision-capable LLM, prompt for product<br>identification.|B|
|Agent engine: image flow|Wire vision model output into message<br>handler — if product matched, include in<br>context; if not, agent asks clarifying<br>question.|B|
|Image message UI polish|Ensure dashboard conversation view<br>(6.7) clearly shows customer-sent<br>images and agent's identification result.|B|



Page 11 

EcomAssistant — Implementation Plan 

## **Week 10** 

## **Dev A — Yalidine integration** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Yalidine API client|Implement authentication and shipment<br>creation call per Yalidine API docs.|A|
|Shipment creation job|On order confirmation, build shipment<br>payload (customer info, wilaya, COD<br>amount, product) and call Yalidine.|A|
|Shipments table + status|Persist shipment record, tracking ID,<br>handle API errors gracefully (retry once,<br>then escalate).|A|
|Tracking confirmation message|Send shipment confirmation template<br>(design doc 5.4) to customer once<br>shipment is created.|A|



## **Dev B — Settings: delivery + WooCommerce polish** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Delivery provider settings UI|Settings screen 6.10: provider selection,<br>credential inputs, connection test button.|B|
|Shipment status in conversation view|Show shipment tracking ID and status in<br>conversation detail header once<br>created.|B|
|WooCommerce sync edge cases|Handle product variants, out-of-stock<br>states, partial sync failures — surface<br>errors in catalog screen.|B|
|Order status sync back to store|Ensure confirmed/cancelled status<br>updates reflect in<br>Shopify/WooCommerce order notes or<br>tags.|B|



Page 12 

EcomAssistant — Implementation Plan 

## **Week 11** 

## **Dev A — Procolis integration** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Procolis API client|Implement authentication and shipment<br>creation call per Procolis API docs.|A|
|Provider abstraction layer|Refactor shipment creation into a<br>common interface so Yalidine/Procolis<br>are interchangeable based on merchant<br>config.|A|
|Shipment error escalation|If shipment creation fails after retry,<br>create escalation with reason and<br>details for merchant.|A|
|Wilaya pricing edge cases|Handle missing/edited wilaya entries<br>gracefully; validate pricing table<br>completeness on activation.|A|



## **Dev B — Settings: wilaya pricing + WhatsApp templates** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Wilaya pricing full editor|Settings screen 6.10 wilaya tab: full 48-<br>row table, inline edit, save, reset to<br>defaults.|B|
|Template status dashboard|Build full view of all WhatsApp<br>templates with approval status,<br>resubmission guidance if rejected.|B|
|Conversation language badges|Add per-message language indicator<br>(DZ/FR/AR) to conversation thread per<br>design doc 6.7.|B|
|Mobile responsiveness pass|Ensure conversations list/detail and<br>dashboard home are usable on<br>mobile/tablet widths.|B|



Page 13 

EcomAssistant — Implementation Plan 

## **Week 12** 

## **Dev A — Integration testing & hardening** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Voice/image/delivery integration tests|Write automated tests for STT pipeline,<br>vision pipeline, and both delivery<br>connectors using mocked APIs.|A|
|Load testing webhook endpoints|Basic load test for order and WhatsApp<br>webhook endpoints; ensure queueing<br>prevents blocking.|A|
|Security review|Review encryption of all stored<br>credentials, webhook signature<br>verification, RLS policies across all<br>tables.|A|
|Logging & observability|Centralized error logging (e.g. Sentry),<br>structured logs for agent decisions<br>(intent, escalation reasons).|A|



## **Dev B — End-to-end QA** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Full pilot scenario walkthrough|Simulate a complete merchant journey:<br>onboarding → order → voice question<br>→ image question → confirmation →<br>shipment.|B|
|Bug triage and fixes|Address issues found during<br>walkthrough across UI and conversation<br>flows.|B|
|Catalog + suggestion accuracy review|Verify product suggestions and image<br>matching are reasonable across a<br>varied test catalog.|B|
|Documentation pass|Write internal runbook: how to onboard<br>a pilot merchant manually, common<br>troubleshooting steps.|A+B|



## **Phase 3 deliverables checklist** 

- Voice messages are transcribed and understood by the agent. 

- Product images are matched against the catalog. 

- Confirmed orders automatically create shipments in Yalidine or Procolis. 

- Wilaya-based delivery pricing is fully configurable and used in conversations. 

- System passes an end-to-end pilot scenario without manual intervention. 

Page 14 

EcomAssistant — Implementation Plan 

## **Phase 4 — Dashboard polish & billing (weeks 13-16)** 

Goal: billing is live, dashboard is polished and complete, system is ready for beta merchants. 

## **Week 13** 

## **Dev A — Chargily billing integration** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Chargily API integration|Implement subscription creation,<br>webhook handling for payment events.|A|
|Subscription model wiring|Connect subscriptions table to merchant<br>status (trial/active/past_due/cancelled),<br>gate access on status.|A|
|Trial logic|14-day trial countdown, automatic<br>transition to required payment or<br>suspension.|A|
|Plan limits enforcement|Define plan tiers (conversation volume<br>limits) and enforce/notify when<br>approaching limits.|A|



## **Dev B — Billing UI** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Billing screen|Build screen 6.11: current plan card,<br>plan comparison cards, payment<br>method section, invoice history.|B|
|Plan upgrade/downgrade flow|UI flow for changing plans, confirmation<br>modals for downgrade impact.|B|
|Trial countdown banner|Global banner showing days remaining<br>in trial, CTA to add payment method.|B|
|Account settings polish|Merchant profile editing, password<br>change, account deletion request flow.|B|



Page 15 

EcomAssistant — Implementation Plan 

## **Week 14** 

## **Dev A — Performance & reliability** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Database indexing review|Add indexes for common query patterns<br>(conversations by merchant+status,<br>orders by status, messages by<br>conversation).|A|
|LLM latency optimization|Review prompt size, consider caching<br>catalog excerpts, measure p95<br>response time against < 8s target.|A|
|Webhook idempotency audit|Ensure all webhook handlers are fully<br>idempotent (safe to receive duplicates<br>from Shopify/WooCommerce/Meta).|A|
|Backup & recovery setup|Configure automated database backups<br>and document recovery procedure.|A|



## **Dev B — UI polish pass** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Design consistency audit|Review all screens against design doc<br>section 8 guidelines — color usage,<br>badge consistency, spacing.|B|
|Empty states & loading states|Add proper empty/loading/error states<br>across all dashboard screens.|B|
|Accessibility pass|Keyboard navigation, color contrast<br>checks, aria labels on key interactive<br>elements.|B|
|Onboarding polish|Smooth transitions between onboarding<br>steps, better error messaging for<br>connection failures.|B|



Page 16 

EcomAssistant — Implementation Plan 

## **Week 15** 

## **Dev A — Pre-launch backend checklist** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Production environment setup|Provision production database, Redis,<br>object storage; separate from staging.|A|
|Secrets management review|Audit all API keys and credentials are<br>stored securely in production<br>environment variables/vault.|A|
|Monitoring & alerting|Set up uptime monitoring for API and<br>webhook endpoints, alert on queue<br>backlog or job failures.|A|
|WhatsApp template final approval|Ensure all message templates are<br>submitted and approved by Meta well<br>before launch (lead time ~24-48h).|A|



## **Dev B — Pilot merchant onboarding prep** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Onboarding walkthrough recording/guide|Create a short guide or video for pilot<br>merchants covering signup through<br>activation.|B|
|In-app help tooltips|Add contextual help text on key settings<br>(agent config, wilaya pricing, delivery<br>provider setup).|B|
|Feedback collection mechanism|Simple in-dashboard feedback form or<br>link for pilot merchants to report issues.|B|
|Cross-browser testing|Test dashboard on Chrome, Firefox,<br>Safari, and mobile browsers.|B|



Page 17 

EcomAssistant — Implementation Plan 

## **Week 16** 

## **Both devs — Beta launch** 

|**Task**|**Description**|**Owner**|
|---|---|---|
|Pilot merchant onboarding (5-10 merchants)|Manually assist first pilot merchants<br>through onboarding, monitor closely for<br>issues.|A+B|
|Live monitoring|Monitor agent conversations,<br>escalations, and system health daily<br>during initial rollout.|A+B|
|Rapid bug-fix cycle|Daily triage and fix of issues surfaced by<br>pilot merchants.|A+B|
|Retrospective & roadmap planning|Review MVP against success metrics<br>(design doc 1. success metrics), plan<br>post-MVP priorities (anti-fraud, packs,<br>fine-tuning, more delivery providers).|A+B|



## **Phase 4 deliverables checklist** 

- Billing is live with trial, active, and past-due states handled correctly. 

- Dashboard is polished, consistent, and accessible. 

- Production environment is monitored and backed up. 

- 5-10 pilot merchants are onboarded and actively using the platform. 

- Post-MVP roadmap defined based on real usage data. 

Page 18 

EcomAssistant — Implementation Plan 

**Appendix A — Risks and dependencies to track from week 1** 

|**Risk / dependency**|**Mitigation**|
|---|---|
|Yalidine/Procolis API access<br>approval delays|Apply in week 0; have a manual shipment-entry fallback ready<br>for pilot if APIs are delayed.|
|Meta WhatsApp template<br>approval delays (24-48h,<br>sometimes longer)|Submit all templates by week 3 at the latest, well before Phase<br>2 testing needs them.|
|Derdja LLM accuracy|Budget extra prompt-iteration time in weeks 5-8; collect real<br>conversation data from pilot for future fine-tuning.|
|Chargily subscription API<br>maturity|Confirm recurring billing support early (week 1); have manual<br>invoicing as fallback for MVP if needed.|
|WhatsApp messaging limits for<br>new business accounts|Start with low-volume pilot merchants; monitor Meta's tier<br>upgrades as conversation volume grows.|



Page 19 

