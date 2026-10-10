# EcomAssistant

An AI agent on WhatsApp for Algerian online shops. It confirms cash-on-delivery orders, answers questions about products, and hands hard cases to a human.

## Language

**Merchant**:
The shop owner who uses EcomAssistant.
_Avoid_: seller, client, user

**Customer**:
The shop's buyer. The person who writes on WhatsApp.
_Avoid_: client, buyer, user

**Conversation**:
One chat between one merchant's shop and one customer.
_Avoid_: thread, session

**Takeover**:
A human owns the Conversation. The agent stays silent.

**Escalation**:
The agent hands the Conversation to a human. It turns Takeover on.
_Avoid_: handoff

**COD**:
Cash on delivery. The customer pays the driver when the parcel arrives.

**Wilaya**:
An Algerian province. There are 58.
_Avoid_: province, state

**Commune**:
A town inside a wilaya.
_Avoid_: city, town

**Delivery address**:
The wilaya, commune and street where an order is sent. The Conversation notes keep the one the customer gave.

**Derdja**:
Algerian Arabic. Often written in Latin letters and mixed with French.
_Avoid_: Darija, Darja

**Tool**:
A backend action the agent can call, such as creating an order or looking up a delivery cost.
_Avoid_: function, intent

**Flow**:
One topic in a Conversation, for example "looking at product X". It is kept in the Conversation notes.
_Avoid_: thread, topic

**Draft**:
A tool call the agent is still filling in. A Flow holds at most one. It is removed when the tool has run, the customer cancels, or the agent hands over because the Draft is stuck.
_Avoid_: pending call

**Ready**:
A Draft is ready when every piece it needs is known, so the agent can run the tool. For an order, that includes the Delivery address. Until then it is still being collected.

**Conversation notes**:
What the agent remembers about one Conversation: its Flows, its Draft and the customer's Delivery address.
_Avoid_: state

**Turn**:
One run of the agent for one customer message. It ends with a reply or an Escalation.
_Avoid_: request, job

**Stalled Turn**:
A Turn where the customer gave the Draft nothing new. A Turn that adds anything resets the count.
_Avoid_: failed attempt
