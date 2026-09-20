# Roadmap

A simple list of features.
`[x]` means it is built. `[ ]` means it is next.
Bug fixes and security work are not here. Those are in [PROJECT_REPORT.md](PROJECT_REPORT.md).
How the system works is in [architecture.md](architecture.md).

---

## AI (the agent)

### Done

- [x] **Answer customer messages.** The agent reads a WhatsApp message and writes a reply.
- [x] **Search products.** The customer asks for a product and gets matching products with prices.
- [x] **Product details.** The agent gives price, stock, description and category.
- [x] **Suggest products.** The agent suggests products by category, color, size, price or taste.
- [x] **Remember the chosen product.** The customer picks a product and the agent keeps it in mind.
- [x] **Collect missing order info.** The agent asks step by step for quantity, wilaya and commune.
- [x] **Create, change, confirm and cancel an order.** The agent does this with tools in the backend.
- [x] **Delivery price by wilaya.** The agent tells the customer the delivery cost.
- [x] **Order status.** The agent tells the customer the status and tracking number.
- [x] **Hand over to a human.** The agent escalates when it cannot help.
- [x] **Two AI providers.** If Groq fails, the agent uses Gemini.
- [x] **Remember the chat.** The agent remembers what was said while the agent is running.

### Next

- [ ] **Speak the customer's language.** Detect Derdja, French or Arabic and answer in the same one.
- [ ] **Use the merchant's settings.** Use the shop name, the tone (formal or friendly) and the default language.
- [ ] **Confirm an order from the customer's reply.** The customer says yes in any language. The agent confirms the right order without asking for an id.
- [ ] **Follow-up messages.** If the customer does not answer, the agent writes a reminder in the customer's language. The scheduler that sends them (2h, 24h, 48h) is in the Software list.
- [ ] **Tell the customer about the human.** When the agent hands over, it says "a person will reply soon".
- [ ] **Detect an angry customer or a request for a human.** Hand over at once.
- [ ] **Remember customers for a long time.** Keep name, address and language, even after a restart.
- [ ] **Suggest related products after a confirmation.** Offer one or two products that fit the order.

### Later

- [ ] **Understand product photos.** The customer sends a photo and the agent finds the product in the catalog.
- [ ] **Send tracking updates in the customer's language.**
- [ ] **Reply with a voice note.**

---

## Software (backend, dashboard, WhatsApp, delivery)

### Done

- [x] **Sign up and log in.** Email with a code, or Google. Log out on one or all devices.
- [x] **Onboarding pages.** Store, WhatsApp, agent settings, activation.
- [x] **Connect Shopify.** Login with Shopify, then products and orders come in by webhook.
- [x] **Connect WhatsApp.** One number per merchant. The merchant scans a QR code.
- [x] **Receive WhatsApp messages.** Text, voice notes (turned into text) and images (described in text).
- [x] **Send a confirmation message.** When an order arrives, the customer gets a message.
- [x] **Orders page.** Filters, bulk status change, bulk hold of the agent.
- [x] **Customers page.** List and bulk block.
- [x] **Catalog page.** Products, with an on/off switch for the agent per product.
- [x] **Escalations page.** Conversations that need a human, with a resolve button.
- [x] **Live notifications.** New orders, escalations and connection changes show up at once.
- [x] **Pause the agent on a chat.** A simple on/off switch for takeover.
- [x] **Delivery companies.** Connect Yalidine, Procolis, Noest or Maystro. Ship an order and get a tracking number.
- [x] **Delivery updates.** The carrier sends a status and the customer gets a WhatsApp message.
- [x] **Agent settings.** Language, tone, follow-up delays and message templates are saved.
- [x] **Dashboard in three languages.** French, English and Arabic.
- [x] **Start a payment.** The backend creates a Chargily checkout for a plan. There is no billing page yet.

### Next

- [ ] **Conversations page.** See all chats with the full message history.
- [ ] **Take over from the dashboard.** The merchant writes a reply that goes to WhatsApp, then hands the chat back to the agent.
- [ ] **Follow-up scheduler.** Send the reminders at the times the merchant chose. Stop when the customer answers. Mark the order failed after the last one.
- [ ] **Ship when the order is confirmed.** Create the parcel at the carrier and send the tracking number to the customer.
- [ ] **Delivery price table.** The merchant edits the price for each of the 58 wilayas. A default table comes with a new account.
- [ ] **Real numbers on the home page.** Confirmation rate, average time to confirm, pending follow-ups, failed orders, and the latest escalations.
- [ ] **Subscriptions.** Plans, a 14-day free trial, limits, upgrade and downgrade, and the billing page.
- [ ] **Forgot and reset password pages.**
- [ ] **Save the delivery address on the order.** The customer gives a street address and it is stored with the order.
- [ ] **Try the agent before going live.** The merchant chats with the agent on their own catalog.
- [ ] **Save onboarding progress.** The merchant continues where they stopped.

### Later

- [ ] **Arabic right-to-left dashboard.**
- [ ] **Connect WooCommerce.**
- [ ] **Official WhatsApp Cloud API.** An option next to the QR code, with approved message templates.
- [ ] **Pairing code login.** Link WhatsApp with a code as an alternative to the QR code.
- [ ] **Read and delivery status.** Show if a message was delivered and read, and mark customer messages as read.
- [ ] **Product cards.** Send a product photo with its name and price, and reply to a specific customer message.
- [ ] **Message templates page.** The merchant edits the confirmation and follow-up texts.
- [ ] **Landing page.** Working buttons, and prices that match the real plans.

---

History of the gRPC split: [architecture-roadmap.md](architecture-roadmap.md).
