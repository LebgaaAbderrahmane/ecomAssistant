# EcomAssistant — Product Design Document
**Version**: 2.0 — Based on implemented screens (June 2026)  
**Source**: Derived from live application screenshots (Lovable build — Boutique Al Manar)  
**Purpose**: Canonical design reference for development, handoff, and iteration

> This document is the single source of truth for the EcomAssistant UI/UX. It captures the exact design decisions visible in the implemented screens, extends them with missing screen specs, and defines the complete component library, design tokens, and interaction patterns to be used across the entire product.

---

## Table of contents

1. [Design philosophy](#1-design-philosophy)
2. [Design tokens](#2-design-tokens)
3. [Component library](#3-component-library)
4. [Layout system](#4-layout-system)
5. [Screen specifications](#5-screen-specifications)
   - 5.1 [Login / Sign up](#51-login--sign-up)
   - 5.2 [Dashboard — Home](#52-dashboard--home)
   - 5.3 [Conversations list](#53-conversations-list)
   - 5.4 [Conversation detail](#54-conversation-detail)
   - 5.5 [Escalations](#55-escalations)
   - 5.6 [Catalog](#56-catalog)
   - 5.7 [Settings](#57-settings)
   - 5.8 [Billing](#58-billing)
6. [System banners](#6-system-banners)
7. [Navigation](#7-navigation)
8. [Status & badge system](#8-status--badge-system)
9. [Empty states](#9-empty-states)
10. [Edge cases & error states](#10-edge-cases--error-states)
11. [Responsiveness](#11-responsiveness)
12. [Missing screens to build](#12-missing-screens-to-build)

---

## 1. Design philosophy

EcomAssistant is a B2B operations tool used daily by Algerian e-commerce merchants. The design must feel like a professional instrument — not a consumer app. Key principles:

- **Clarity over decoration.** Every pixel serves a function. No decorative elements.
- **Status at a glance.** A merchant should understand their business state within 3 seconds of opening the dashboard.
- **Contextual urgency.** Critical alerts (WhatsApp disconnected, quota exceeded) are always visible regardless of which page the user is on.
- **Familiar patterns.** Table-based list views, left sidebar navigation, inline status badges — patterns merchants already know from tools like Shopify or Notion.
- **Multilingual respect.** The product serves users mixing Derdja, French, and Arabic in the same sentence. Language badges are visual, not buried.

---

## 2. Design tokens

### 2.1 Color palette

#### Primary — Green

| Token | Hex | Usage |
|---|---|---|
| `green-50` | `#f0fdf4` | Hover backgrounds, subtle highlights |
| `green-100` | `#dcfce7` | Confirmed badge background |
| `green-200` | `#bbf7d0` | Active nav item background |
| `green-600` | `#16a34a` | Confirmed badge text, active nav text, toggle ON |
| `green-700` | `#15803d` | Primary button background |
| `green-800` | `#166534` | Primary button hover |
| `green-900` | `#14532d` | Logo, sidebar active fill |

**Observed primary brand color**: `#0F6E56` (dark teal-green) — used for logo, active nav, primary buttons, and selected states. The exact hex sits between green-700 and green-800. Use `#0F6E56` as `--color-primary`.

#### Semantic colors

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#0F6E56` | Logo, active nav, primary buttons, selected states |
| `--color-primary-hover` | `#0B5443` | Primary button hover state |
| `--color-primary-light` | `#E1F5EE` | Active nav item background, light highlights |
| `--color-warning` | `#D97706` | Amber warning banners, Pending badge text |
| `--color-warning-bg` | `#FEF3C7` | Amber warning banner background |
| `--color-warning-border` | `#F59E0B` | Amber warning banner left border / icon |
| `--color-danger` | `#DC2626` | Red banner text, Failed badge text |
| `--color-danger-bg` | `#FEF2F2` | Red banner background |
| `--color-danger-border` | `#EF4444` | Red banner left border / icon |
| `--color-escalation` | `#EA580C` | Escalation badge text (orange-red) |
| `--color-escalation-bg` | `#FFF7ED` | Escalation badge background |
| `--color-cancelled-text` | `#6B7280` | Cancelled badge text |
| `--color-cancelled-bg` | `#F3F4F6` | Cancelled badge background |
| `--color-failed-text` | `#9CA3AF` | Failed badge text |
| `--color-failed-bg` | `#F9FAFB` | Failed badge background |

#### Neutrals

| Token | Hex | Usage |
|---|---|---|
| `--color-bg-page` | `#F3F4F6` | Page background (light gray) |
| `--color-bg-surface` | `#FFFFFF` | Cards, sidebar, panels |
| `--color-bg-hover` | `#F9FAFB` | Table row hover |
| `--color-border` | `#E5E7EB` | Card borders, table borders, input borders |
| `--color-border-light` | `#F3F4F6` | Subtle dividers |
| `--color-text-primary` | `#111827` | Headings, table primary content |
| `--color-text-secondary` | `#6B7280` | Subtitles, timestamps, metadata |
| `--color-text-muted` | `#9CA3AF` | Placeholder text, disabled states |
| `--color-text-link` | `#0F6E56` | Clickable links (Reconnect, Upgrade, Manage billing) |

### 2.2 Typography

**Font family**: System UI stack — `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

| Token | Size | Weight | Line height | Usage |
|---|---|---|---|---|
| `--text-page-title` | 24px / 1.5rem | 700 | 1.3 | Page titles (Dashboard, Conversations) |
| `--text-section-title` | 16px / 1rem | 600 | 1.4 | Card headings, section headings |
| `--text-body` | 14px / 0.875rem | 400 | 1.5 | Table rows, body content |
| `--text-body-medium` | 14px / 0.875rem | 500 | 1.5 | Nav items, button labels, column headers |
| `--text-small` | 13px / 0.8125rem | 400 | 1.4 | Timestamps, metadata, subtitles |
| `--text-tiny` | 12px / 0.75rem | 500 | 1.3 | Badge labels, language tags, plan chip |
| `--text-kpi-value` | 28px / 1.75rem | 700 | 1.1 | KPI numbers on dashboard |
| `--text-kpi-label` | 13px / 0.8125rem | 400 | 1.4 | KPI card labels |
| `--text-delta` | 12px / 0.75rem | 500 | 1.3 | KPI delta indicators |
| `--text-plan-price` | 28px / 1.75rem | 700 | 1.1 | Billing plan prices |

### 2.3 Spacing scale

Base unit: 4px

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Micro gaps |
| `--space-2` | 8px | Icon-to-text gap, tight row padding |
| `--space-3` | 12px | Badge padding horizontal |
| `--space-4` | 16px | Standard element padding |
| `--space-5` | 20px | Card inner padding vertical |
| `--space-6` | 24px | Card inner padding, section gaps |
| `--space-8` | 32px | Between major sections |
| `--space-10` | 40px | Large section separators |

### 2.4 Border radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 4px | Input fields, small badges |
| `--radius-md` | 6px | Buttons, filter pills |
| `--radius-lg` | 8px | Cards, table containers, modals |
| `--radius-xl` | 12px | Plan cards, KPI cards |
| `--radius-full` | 9999px | Avatar circles, language badges, toggle |

### 2.5 Shadows

| Token | Value | Usage |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.05)` | Input focus ring |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)` | Cards, panels |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)` | Dropdowns, popovers |
| `--shadow-ring-primary` | `0 0 0 2px #0F6E56` | Active/focused primary elements |

---

## 3. Component library

### 3.1 Buttons

#### Primary button
- Background: `--color-primary` (`#0F6E56`)
- Text: white, 14px, weight 600
- Padding: 10px 16px
- Border radius: `--radius-md` (6px)
- Hover: `--color-primary-hover`
- States: default, hover (darken 10%), disabled (opacity 50%)
- Example: "Log in", "Save changes", "Resync now", "Mark all as resolved"

#### Secondary button (outline)
- Background: white
- Border: 1px solid `--color-border`
- Text: `--color-text-primary`, 14px, weight 500
- Padding: 10px 16px
- Border radius: `--radius-md`
- Hover: background `--color-bg-hover`
- Example: "Reset", "Update payment method", "Downgrade"

#### Ghost / link button
- No background, no border
- Text: `--color-text-link`, 13px, weight 500
- Underline on hover
- Example: "View all", "Manage billing", "Forgot?"

#### Icon button
- Square, 32px × 32px
- Background: white, border: `--color-border`
- Icon: 16px, `--color-text-secondary`
- Hover: background `--color-bg-hover`
- Example: action icons on escalation rows (message icon, resolve icon)

### 3.2 Input fields

- Height: 40px
- Border: 1px solid `--color-border`
- Border radius: `--radius-md` (6px)
- Padding: 10px 12px
- Font: 14px, `--color-text-primary`
- Placeholder: `--color-text-muted`
- Focus: border-color `--color-primary`, shadow `--shadow-xs`
- Background: white

**Search input**: same as above, with a search icon (16px, `--color-text-muted`) prepended inside the field, left-padded to 38px.

### 3.3 Select / dropdown

- Same dimensions and styling as input
- Trailing chevron icon (16px, `--color-text-secondary`)
- Example: "All stock" dropdown on Catalog

### 3.4 Toggle switch

- Track: 44px × 24px, border-radius full
- Thumb: 20px circle, white, 2px inset from edges
- OFF state: track `#D1D5DB`, thumb left
- ON state: track `--color-primary`, thumb right
- Transition: 150ms ease
- Example: "Suggest related products" toggle in Settings

### 3.5 Status badges

All badges: inline-flex, align-items center, padding 3px 10px, border-radius full, font-size 12px, font-weight 600.

| Status | Background | Text color | Usage |
|---|---|---|---|
| Confirmed | `#DCFCE7` | `#166534` | Order confirmed |
| Pending | `#FEF3C7` | `#92400E` | Awaiting confirmation |
| Escalated | `#FFF7ED` | `#EA580C` | Escalated conversation |
| Cancelled | `#F3F4F6` | `#6B7280` | Order cancelled |
| Failed | `#F9FAFB` | `#9CA3AF` | No reply, order failed |
| Active | `#DCFCE7` | `#166534` | Subscription active (Billing) |
| Paid | `#DCFCE7` | `#166534` | Invoice paid |
| In stock | `#DCFCE7` | `#166534` | Product available |
| Low stock | `#FEF3C7` | `#92400E` | Product nearly out |
| Out of stock | `#F3F4F6` | `#6B7280` | Product unavailable |
| Human Requested | `#FFF7ED` | `#EA580C` | Escalation reason badge |
| Customer Angry | `#FFF7ED` | `#EA580C` | Escalation reason badge |
| Agent Uncertain | `#F3F4F6` | `#6B7280` | Escalation reason (resolved) |
| Escalated (reason) | `#FFF7ED` | `#EA580C` | Recent escalations widget |

### 3.6 Language badges

Compact pill showing the detected conversation language.

- Size: 28px × 20px, border-radius 4px
- Font: 11px, weight 700, letter-spacing 0.05em
- Background: `#F3F4F6`
- Text: `#374151`
- Values: `DZ`, `FR`, `AR`

### 3.7 Customer avatar

Circular avatar with initials, shown in conversation list and escalations rows.

- Size: 36px × 36px
- Border-radius: full
- Background: `--color-primary-light` (`#E1F5EE`)
- Text: initial letter, 14px, weight 700, color `--color-primary`
- Example: "K" for Karim, "A" for Amina

### 3.8 Cards

Standard surface for grouping content.

- Background: white
- Border: 1px solid `--color-border`
- Border-radius: `--radius-lg` (8px)
- Padding: 20px 24px
- Shadow: none (border-only treatment)

**KPI card** (dashboard): same as card + icon in top-right corner (32px circle, background light green, icon 18px primary green).

**Plan card** (billing): same as card + highlighted variant for current plan (border 2px `--color-primary`, background `#F0FDF4`).

### 3.9 Tables

- Container: white background, border 1px `--color-border`, border-radius `--radius-lg`
- Header row: background white, border-bottom 1px `--color-border`
- Header text: 13px, weight 500, `--color-text-secondary`, no uppercase transform
- Data rows: 56px height, border-bottom 1px `#F9FAFB`
- Last row: no border-bottom
- Row hover: background `#F9FAFB`
- Row cursor: pointer (clickable rows)
- Cell padding: 12px 16px

### 3.10 Filter tabs (pill filter)

Used on Conversations page to filter by status.

- Active pill: background `--color-primary`, text white, border-radius full, padding 6px 16px, font 13px weight 600
- Inactive pill: background white, border 1px `--color-border`, text `--color-text-secondary`, same sizing
- Gap between pills: 8px

### 3.11 System banners

Persistent, dismissible banners shown at top of main content area (below topbar). See full spec in [section 6](#6-system-banners).

### 3.12 Account dropdown menu

Triggered by clicking the user avatar/email in the topbar.

- Position: absolute, top-right of topbar, min-width 180px
- Background: white, border 1px `--color-border`, border-radius `--radius-lg`, shadow `--shadow-md`
- Items: 40px height, 12px 16px padding, 14px text
- Items: Settings (icon: gear), Billing (icon: credit card), Log out (icon: arrow-right, text `--color-danger`)
- Divider: 1px `--color-border` above "Log out"

### 3.13 Settings sub-navigation

Vertical pill nav inside the Settings page left panel.

- Panel width: 220px
- Active item: background `--color-primary`, text white, border-radius `--radius-md`, padding 10px 16px, icon + label
- Inactive item: no background, text `--color-text-secondary`, same padding
- Items: Agent config (robot/config icon), Store connection (store icon), WhatsApp (phone icon), Wilaya pricing (pin icon)

### 3.14 Segment control (button group)

Used for language and tone selection in Settings.

- Container: inline-flex, border 1px `--color-border`, border-radius `--radius-md`
- Each segment: padding 8px 20px, font 14px weight 500
- Selected: border 2px `--color-primary`, text `--color-primary`, background white, border-radius `--radius-md` (independent of group)
- Unselected: background white, text `--color-text-primary`, no individual border
- Hover: background `--color-bg-hover`
- Examples: Derdja / French / MSA / Auto-detect; Friendly / Formal; Yalidine / Procolis

---

## 4. Layout system

### 4.1 Global layout structure

```
┌──────────────────────────────────────────────────────┐
│  TOPBAR (56px height, full width, white, border-bottom) │
├────────────┬─────────────────────────────────────────┤
│            │  SYSTEM BANNERS (if active, stacked)    │
│  SIDEBAR   ├─────────────────────────────────────────┤
│  (250px)   │                                         │
│  fixed     │         MAIN CONTENT AREA               │
│  left      │         padding: 24px 32px              │
│  white     │                                         │
│  border-   │                                         │
│  right     │                                         │
│            │                                         │
│  PLAN CHIP │                                         │
│  (bottom)  │                                         │
└────────────┴─────────────────────────────────────────┘
```

### 4.2 Topbar

- Height: 56px
- Background: white
- Border-bottom: 1px `--color-border`
- Position: sticky top-0, z-index 50
- Left section: store name with store icon (18px, `--color-text-secondary`), text 14px weight 500
- Right section: user avatar circle (32px, `--color-primary`) + email text + chevron icon → triggers account dropdown
- Store selector: "Boutique Al Manar" — clicking may allow store switching in future

### 4.3 Sidebar

- Width: 250px (exact, based on screenshots)
- Background: white
- Border-right: 1px `--color-border`
- Position: fixed left-0, full height
- Top section: logo (32px height, top-left) + wordmark "EcomAssistant"
- Logo: rounded square icon, dark green fill, white inner mark
- Nav items: 44px height, 8px 12px padding, icon (18px) + label (14px weight 500), `--color-text-secondary`
- Active nav item: background `--color-primary-light`, text `--color-primary`, icon filled/colored
- Hover: background `#F9FAFB`
- Nav icons (Tabler or similar): Home, Chat/message, Alert triangle, Package/box, Settings gear, Credit card
- Bottom section (fixed to sidebar bottom): plan name + expiry date + "Manage billing" link

**Sidebar bottom plan chip:**
- Background: `--color-primary-light`
- Border-radius: `--radius-lg`
- Padding: 12px
- Plan name: 13px weight 600, `--color-primary`
- Expiry: 12px, `--color-text-secondary`
- "Manage billing": 12px, `--color-text-link`, underline

### 4.4 Main content area

- Left offset: 250px (sidebar width)
- Top offset: 56px (topbar height) + banner height (variable)
- Padding: 24px 32px
- Max-width: none (full remaining width)

---

## 5. Screen specifications

### 5.1 Login / Sign up

**URL**: `/login`

**Layout**: Centered auth card, full-page background `--color-bg-page`.

**Header (outside card)**:
- Logo icon (36px) + "EcomAssistant" wordmark, centered, top of page
- Padding-bottom: 32px

**Card**:
- Max-width: 440px, centered
- Background: white, border 1px `--color-border`, border-radius `--radius-xl`, padding: 32px
- No shadow

**Login content**:
- Title: "Welcome back" — 24px, weight 700, centered
- Subtitle: "Log in to manage your WhatsApp agent" — 14px, `--color-text-secondary`, centered
- Spacer: 24px

**Form fields**:
- Label: "Email" — 13px weight 500, margin-bottom 6px
- Email input: full width, standard input style
- Label: "Password" + "Forgot?" link (right-aligned, 13px, `--color-text-link`) — same row
- Password input: full width, with eye toggle icon (right, 16px)
- "Keep me signed in" checkbox + label (13px) row
- Spacer: 16px
- Primary button "Log in" — full width, 44px height
- Divider: "or" with horizontal lines
- Secondary button "Continue with Google" — full width, 44px height, globe icon (16px) left, standard secondary style
- Footer text: "New to EcomAssistant? Create an account" (link on "Create an account")

**Sign up screen** (same card, different content):
- Title: "Create your account"
- Fields: Business name, Email, Password, Confirm password
- Primary CTA: "Create account"
- Footer: "Already have an account? Log in"

**States**:
- Loading: button shows spinner + disabled
- Error: red helper text below the relevant field, border turns red
- Success: redirect to dashboard or onboarding

---

### 5.2 Dashboard — Home

**URL**: `/` or `/dashboard`  
**Nav active**: Home

#### Topbar
Standard topbar. Displays current merchant: "Boutique Al Manar".

#### System banners (if active)
See section 6. Shown stacked below topbar, above page content.

#### Page header
- Title: "Dashboard" — `--text-page-title`
- Subtitle: "Overview of your AI WhatsApp agent performance" — 14px, `--color-text-secondary`
- Margin-bottom: 24px

#### KPI cards row

4 cards in a grid (25% each, gap 16px).

**Card 1 — Orders this month**
- Label: "Orders this month"
- Value: large number (e.g. 47)
- Delta: "+12% vs last month" in green with upward arrow icon
- Icon (top-right): shopping cart, 18px, inside 32px circle, background `--color-primary-light`, icon color `--color-primary`

**Card 2 — Confirmation rate**
- Label: "Confirmation rate"
- Value: percentage (e.g. 72%)
- Delta: "+5% vs last month" in green
- Icon: checkmark circle

**Card 3 — Avg. confirmation time**
- Label: "Avg. confirmation time"
- Value: time (e.g. 4h 23m)
- Delta: "-45m vs last month" in green (lower = better)
- Icon: clock

**Card 4 — Pending follow-ups**
- Label: "Pending follow-ups"
- Value: number (e.g. 8)
- Delta: "3 need attention" in orange/amber with warning icon
- Icon: bell

**KPI delta color rules**:
- Positive direction (more orders, higher rate, less time, fewer pending issues): green text
- Negative direction or attention needed: `--color-warning` (amber) text
- Icon: small arrow-up (green) or arrow-up (amber/red) depending on semantic

#### Main content row

2-column grid (ratio ~65% / 35%, gap 16px), below KPI row.

**Left card — Confirmations vs Cancellations chart**
- Card heading: "Confirmations vs Cancellations"
- Right-aligned tag: "Last 14 days"
- Chart: grouped bar chart, date labels on x-axis (May 30 → Jun 11), count on y-axis (0–8)
- Green bars: confirmed orders
- Orange/red bars: cancelled orders
- Legend: "● Confirmed" (green) + "● Cancelled" (orange-red), centered below chart
- Chart height: ~220px inside the card

**Right card — Recent escalations**
- Card heading: "Recent escalations" + "View all" link (right-aligned, `--color-text-link`, 13px)
- Each escalation item: warning triangle icon (amber) + customer name (14px weight 600) + product name (13px `--color-text-secondary`) + "Escalated" badge (orange-red)
- Divider between items: 1px `--color-border-light`
- Shows max 2–3 most recent open escalations
- If none: empty state (no escalations text + green check icon)

#### Recent orders table

Below the 2-column row. Full width card.

- Section heading: "Recent orders" (16px weight 600)
- Columns: Order (#XXXX), Customer (name), Product (name, `--color-text-link` style), Total (amount + DA), Status (badge)
- Shows last 5 orders
- No pagination on dashboard (full list is on Orders page, not in MVP)
- Row hover: `--color-bg-hover`
- No "View all" link visible — to be added

---

### 5.3 Conversations list

**URL**: `/conversations`  
**Nav active**: Conversations

#### Page header
- Title: "Conversations"
- Subtitle: "{N} total conversations" — 14px, `--color-text-secondary`
- No CTA button in header

#### Search bar
- Full-width input (max-width not constrained), right-aligned
- Placeholder: "Search by name or phone..."
- Search icon prepended inside field

#### Filter tabs (pill filters)
Below search bar, left-aligned. Pills: All | Pending | Confirmed | Escalated | Failed

- Count not shown in tab labels (unlike our earlier spec — actual implementation omits counts from tabs)
- Active: "All" pill solid green; others outline

#### Table

Columns in order:
1. **Customer** — avatar (initials) + full name
2. **Phone** — phone icon (14px, `--color-text-muted`) + number in E.164-like format (+213 XXX XXX XXX)
3. **Last message** — truncated text preview (max ~40 chars + "..."), `--color-text-secondary`
4. **Order** — status badge (Confirmed / Pending / Cancelled / Failed)
5. **Lang** — language badge (DZ / FR / AR)
6. **Activity** — clock icon + relative timestamp ("3d ago", "4d ago")

**Row behavior**: clicking any row navigates to conversation detail.

**Status badge mapping** (Order column):
- `Confirmed` → green badge
- `Pending` → amber badge
- `Cancelled` → gray badge
- `Failed` → light gray badge

**Activity column**: shows time of last message, not last order action.

**Notable real data from screenshots**:
- Karim Bensalah — Confirmed — DZ — "Tmam! Merci bcp, rana nest..."
- Amina Zoubiri — Pending — FR — "Wach kayen d'autres couleu..."
- Yassine Hamidi — Pending — DZ — "Bghit nkalem ma3a wahed, h..."
- Fatima Djellali — Pending — AR — "Hala, chkun inta?"
- Sofiane Merabet — Cancelled — FR — "Désolé, j'ai changé d'avis. A..."
- Nadia Rahmouni — Failed — DZ — "Automated: last follow-up sent"

The "Automated:" prefix in the last message preview for Nadia shows a system-generated message when the agent sends the final follow-up.

---

### 5.4 Conversation detail

**URL**: `/conversations/:id`  
**Nav active**: Conversations

> This screen was not shown in the provided screenshots. Spec below is based on the PRD and design doc v1, consistent with the design language observed in the implemented screens.

#### Page header
- Back arrow + customer name as page title
- Right side: "Take over conversation" button (secondary style) OR "Re-activate agent" button

#### Status bar (below header)
- Order summary: order number + product + amount in DZD + wilaya + delivery cost
- Order status badge
- If escalated: amber/red banner showing escalation reason + "Mark as resolved" button

#### Chat thread area
- Background: `#EFEDE6` (WhatsApp-like warm gray)
- Customer messages: left-aligned, white bubble, border 1px `--color-border`, border-radius 12px (bottom-left 2px)
- Agent messages: right-aligned, `--color-primary-light` bubble, border-radius 12px (bottom-right 2px)
- Merchant (manual) messages: right-aligned, `#D9EFFF` bubble
- System messages: centered, italic, `--color-text-muted`, no bubble
- Voice messages: bubble contains play button (green circle) + waveform bars + duration
- Transcription below voice bubble: italic 12px `--color-text-secondary`
- Images: rendered as thumbnail (160×120px, border-radius 8px) inside customer bubble
- Language badge: tiny pill (DZ/FR/AR) + timestamp shown below each bubble
- Agent Escalation notice: dashed border, coral background, red text

#### Manual reply input (shown when in human_active state)
- Amber banner: "Agent paused — you are replying manually"
- Full-width text input + "Send" primary button

---

### 5.5 Escalations

**URL**: `/escalations`  
**Nav active**: Escalations (with red badge count when open escalations exist)

#### Page header
- Title: "Escalations"
- Subtitle: "{N} open, {N} resolved"
- CTA button (right): "Mark all as resolved" — secondary button with checkmark icon

#### Open escalations section

- Section header: warning triangle icon (amber) + "Open escalations" (16px weight 600)
- Contained in bordered card (standard card style)

**Table columns**:
1. **Customer** — avatar + name (14px weight 600) + phone below name (12px `--color-text-secondary`)
2. **Product** — product name (14px)
3. **Reason** — reason badge (Human Requested / Customer Angry)
4. **Created** — relative timestamp ("3d ago", "2d ago")
5. **Action** — two icon buttons: message/chat icon + checkmark/resolve icon

**Reason badges** (different styling from order status badges):
- `Human Requested`: amber-orange background (`#FFF7ED`), text `#EA580C`, with circle-info icon prefix
- `Customer Angry`: same color as Human Requested
- `Agent Uncertain`: gray background, gray text (appears in resolved section)

**Row avatar**: circle with initial letter, background `--color-primary-light`, text `--color-primary`

#### Recently resolved section

- Section header: green checkmark icon + "Recently resolved" (16px weight 600)
- Different card from open escalations (separated visually)

**Table columns**:
1. **Customer** — name only (no avatar, no phone in resolved section)
2. **Product** — product name
3. **Reason** — reason badge (grayed out style for resolved: `Agent Uncertain`)
4. **Resolved** — relative timestamp ("4d ago")

No action column in resolved section.

**Real data from screenshots**:
- Yassine Hamidi / +213556789234 / Chargeur Rapide USB-C 65W / Human Requested / 3d ago
- Rachid Mokhtari / +213559876543 / Montre Connectée SmartFit Pro / Customer Angry / 2d ago
- Lila Hadj / Enceinte Portable Bluetooth / Agent Uncertain / 4d ago (resolved)

---

### 5.6 Catalog

**URL**: `/catalog`  
**Nav active**: Catalog

#### Page header
- Title: "Catalog"
- Subtitle: "{N} products synced from your store"
- CTA button (right): "Resync now" — secondary button with refresh/sync icon

#### Filters row
- Search input (left, ~320px width): placeholder "Search products..."
- Stock filter dropdown (right of search, ~160px): "All stock" | In stock | Low stock | Out of stock

#### Table

Columns:
1. **Image** — 48px × 48px image placeholder (icon when no image loaded), border-radius 8px, background `--color-bg-page`
2. **Product** — product name (14px weight 500) + description preview (12px `--color-text-secondary`, max 1 line, truncated)
3. **Price** — amount + "DA" suffix, right-aligned
4. **Variants** — comma-separated variant names (color/size)
5. **Stock** — badge (In stock / Low stock / Out of stock)
6. **Last synced** — date in DD/MM/YYYY format

**Product name**: 14px, weight 500, `--color-text-primary`  
**Description**: 12px, `--color-text-secondary`, single line, `text-overflow: ellipsis`

**Stock badge styles**:
- In stock: green badge
- Low stock: amber badge
- Out of stock: gray badge (appears slightly muted/pill with softer borders in screenshots)

**Image placeholder**: image-off icon (18px, `--color-text-muted`) centered in a 48px square with `--color-bg-page` background and `--radius-sm` radius.

**Real data from screenshots**:
| Product | Price | Variants | Stock | Last synced |
|---|---|---|---|---|
| Montre Connectée SmartFit Pro | 12 900 DA | Noir, Argent | In stock | 11/06/2026 |
| Casque Bluetooth Sans Fil | 8 900 DA | Standard | Low stock | 11/06/2026 |
| Chargeur Rapide USB-C 65W | 3 500 DA | Blanc | In stock | 11/06/2026 |
| Enceinte Portable Bluetooth | 5 200 DA | Noir, Bleu | Out of stock | 11/06/2026 |
| Support Téléphone Voiture Magnétique | 1 800 DA | Gris | In stock | 11/06/2026 |

---

### 5.7 Settings

**URL**: `/settings`  
**Nav active**: Settings

#### Page header
- Title: "Settings"
- Subtitle: "Manage your store, agent, and delivery settings"
- No CTA button in header

#### Two-column layout

- Left: sub-navigation panel (220px wide, white card)
- Right: content panel (remaining width, white card)
- Gap: 24px

#### Left sub-navigation

4 items with icons:
1. **Agent config** (robot/cog icon) — active by default
2. **Store connection** (store/shop icon)
3. **WhatsApp** (phone icon)
4. **Wilaya pricing** (map pin icon)

Active item: green background, white text, full-radius within the panel.

#### Right panel — Agent config tab

**Panel title**: "Agent configuration" (18px weight 600)

**Language mode section**:
- Label: "Language mode" (14px weight 500)
- 4-button segment control: Derdja | French | MSA | Auto-detect
- Auto-detect is default selected (green border/text)
- Buttons are side by side, each equal width

**Tone section**:
- Label: "Tone" (14px weight 500)
- 2-button segment control: Friendly | Formal
- Friendly is default selected (green border)

**Follow-up delays section**:
- Label: "Follow-up delays" (14px weight 500)
- 3 number inputs in a row, each with "hours" text after and "→" arrow between
- Values: 2 hours → 24 hours → 48 hours
- Below inputs: "Max follow-ups: 3" (13px, `--color-text-secondary`)

**Suggest related products toggle row**:
- Full-width row with border (`--color-border`), border-radius `--radius-md`, padding 16px
- Label: "Suggest related products" (14px weight 500) + sublabel "After confirmation, offer related items" (13px `--color-text-secondary`)
- Toggle: right-aligned, ON state (green)

**Delivery provider section**:
- Label: "Delivery provider" (14px weight 500)
- 2-button segment control: Yalidine | Procolis
- Yalidine selected by default (green border)

**Action buttons** (bottom of panel):
- "Save changes" — primary button with save/floppy icon
- "Reset" — secondary button with reset/undo icon

#### Right panel — Store connection tab (spec, not shown)

- Shows connected store name, type, domain, connection status badge
- "Reconnect" button + "Resync catalog" button
- "Disconnect" link (danger color, with confirmation modal)
- Last sync time

#### Right panel — WhatsApp tab (spec, not shown)

- Connected phone number + display name
- Connection status badge (Connected / Disconnected)
- "Reconnect with Meta" button
- Template approval status list

#### Right panel — Wilaya pricing tab (spec, not shown)

- 48-row editable table: wilaya code + wilaya name + delivery cost input (DZD)
- "Reset to defaults" button
- "Save changes" button

---

### 5.8 Billing

**URL**: `/billing`  
**Nav active**: Billing

#### Page header
- Title: "Billing"
- Subtitle: "Manage your subscription and payment details"

#### Current plan card

Full-width card (standard card style).

- Section label: "Current plan" (12px, `--color-text-secondary`)
- Plan name: "Growth" (18px weight 700)
- Next billing: "Next billing: 11 juillet 2026" (13px, `--color-text-secondary`)
- Right side: "Active" badge (green) + "Update payment method" button (secondary, with credit card icon)

#### Plan comparison section

- Section heading: "Change plan" (16px weight 600)
- 3-column grid (equal width), gap 16px

**Starter plan card**:
- Plan name: "Starter" (16px weight 600) with star/sparkle icon
- Price: "4 900 DA/mo" (28px weight 700)
- Tagline: "For small shops getting started" (13px `--color-text-secondary`)
- Features list: checkmark + text, 13px
  - Up to 100 orders/month
  - 1 store connection
  - Basic agent customization
  - Email support
- CTA: "Downgrade" — secondary button, full width

**Growth plan card** (current):
- Card: highlighted with `--color-primary` border (2px), light green background
- Plan name: "Growth" with lightning/bolt icon
- Price: "9 900 DA/mo"
- Tagline: "For growing businesses"
- Features:
  - Up to 500 orders/month
  - 2 store connections
  - Advanced agent customization
  - Priority support
  - Wilaya pricing editor
- CTA: "Current plan" — primary button, full width, disabled

**Pro plan card**:
- Plan name: "Pro" with crown icon
- Price: "19 900 DA/mo"
- Tagline: "For high-volume merchants"
- Features:
  - Unlimited orders
  - 5 store connections
  - Full agent customization
  - Dedicated support
  - Wilaya pricing editor
  - API access
- CTA: "Upgrade" — secondary button, full width

#### Invoice history section

- Section heading: "Invoice history" (16px weight 600)
- Table with columns: Invoice (INV-YYYY-NNN), Date (written date), Amount (XXXX DA), Status (Paid badge), download icon button

**Real data from screenshots**:
| Invoice | Date | Amount | Status |
|---|---|---|---|
| INV-2026-006 | 1 juin 2026 | 9 900 DA | Paid |
| INV-2026-005 | 1 mai 2026 | 9 900 DA | Paid |
| INV-2026-004 | 1 avril 2026 | 4 900 DA | Paid |

Note: INV-2026-004 was 4 900 DA (Starter plan), INV-2026-005 onwards is 9 900 DA (Growth plan) — shows plan upgrade history.

#### Account dropdown (observed on Billing page)

Dropdown from avatar/email click in topbar:
- "Settings" item (gear icon)
- "Billing" item (credit card icon)
- Divider
- "Log out" item (arrow-right icon, red text `--color-danger`)

---

## 6. System banners

Two persistent banners appear across all authenticated pages (below topbar, above page content). They are stacked vertically, each dismissible (✕ icon, right side).

### Banner 1 — WhatsApp disconnected (critical)

- Background: `#FEF2F2` (light red)
- Left border: none (inline banner, not bordered)
- Icon: WiFi-off or antenna-off icon, 16px, `--color-danger`
- Bold text: "WhatsApp disconnected." (14px weight 600, `--color-text-primary`)
- Normal text: "Your agent is paused. Reconnect to resume sending messages."
- CTA link: "Reconnect" — `--color-text-link`, weight 600, underline on hover
- Dismiss: ✕ icon, right-aligned

### Banner 2 — Quota warning (amber)

- Background: `#FFFBEB` (light amber)
- Icon: lightning bolt icon, 16px, `--color-warning`
- Bold text: "You've used 87% of your monthly conversations."
- Normal text: "Upgrade to avoid interruption."
- CTA link: "Upgrade" — `--color-text-link`, weight 600
- Dismiss: ✕ icon, right-aligned

### Banner display rules

- Both banners shown when both conditions are true
- Either banner shown independently when only one condition is true
- Neither shown when all systems are normal
- Dismissed state persists for the session only (re-appears on page reload if condition persists)
- Banners push page content down — they are not overlaid

### Future banner types (to implement)

| Type | Trigger | Color |
|---|---|---|
| Trial expiring | < 7 days left | Amber |
| Trial expired | Trial period over | Red |
| Payment failed | Last payment failed | Red |
| New feature | Product announcement | Blue/teal |
| Sync completed | After manual resync | Green (auto-dismiss 4s) |

---

## 7. Navigation

### 7.1 Sidebar nav items

| Label | Icon | URL | Badge |
|---|---|---|---|
| Home | home icon | `/` | none |
| Conversations | chat/message icon | `/conversations` | none |
| Escalations | alert-triangle icon | `/escalations` | count of open escalations (red, shown when > 0) |
| Catalog | package/box icon | `/catalog` | none |
| Settings | settings/gear icon | `/settings` | none |
| Billing | credit-card icon | `/billing` | none |

### 7.2 Active state rules

- Exactly one nav item is active at a time
- Active = the current page's route matches the nav item's URL
- Sub-pages (e.g. `/conversations/123`) keep the parent nav item active ("Conversations")

### 7.3 Escalations badge

- Red circle badge with white count number
- Position: right-aligned within the nav item, replacing the right margin
- Shows only when there are open (unresolved) escalations
- Disappears when count reaches 0
- Updates in real-time (polling or websocket)

---

## 8. Status & badge system

### 8.1 Order / conversation status flow

```
Pending → Confirmed → (shipment created)
         → Cancelled
         → Escalated → (resolved by merchant) → back to Pending or closed
Failed (no reply after max follow-ups)
```

### 8.2 Badge color mapping (complete reference)

| Status value | Background | Text | Border | Context |
|---|---|---|---|---|
| `Confirmed` | `#DCFCE7` | `#166534` | none | Orders, conversations |
| `Pending` | `#FEF3C7` | `#92400E` | none | Orders, conversations |
| `Escalated` | `#FFF7ED` | `#EA580C` | none | Conversations |
| `Cancelled` | `#F3F4F6` | `#6B7280` | none | Orders, conversations |
| `Failed` | `#F9FAFB` | `#9CA3AF` | none | Conversations |
| `Active` | `#DCFCE7` | `#166534` | none | Subscription |
| `Paid` | `#DCFCE7` | `#166534` | none | Invoices |
| `In stock` | `#DCFCE7` | `#166534` | none | Catalog |
| `Low stock` | `#FEF3C7` | `#92400E` | none | Catalog |
| `Out of stock` | `#F3F4F6` | `#6B7280` | `#E5E7EB` 1px | Catalog |
| `Human Requested` | `#FFF7ED` | `#EA580C` | none | Escalation reason |
| `Customer Angry` | `#FFF7ED` | `#EA580C` | none | Escalation reason |
| `Agent Uncertain` | `#F3F4F6` | `#6B7280` | none | Escalation reason (resolved) |

---

## 9. Empty states

### 9.1 No conversations yet

- Icon: chat bubble illustration (teal, 64px)
- Title: "No conversations yet"
- Body: "Once a customer places an order, EcomAssistant will automatically reach out on WhatsApp. Conversations will appear here."
- CTA: "Test the agent" (primary button)

### 9.2 No escalations

- Icon: checkmark circle (green, 64px)
- Title: "All clear!"
- Body: "No open escalations. Your agent is handling conversations smoothly."
- No CTA

### 9.3 No catalog products

- Icon: box/package icon (gray, 64px)
- Title: "No products synced"
- Body: "Connect your Shopify or WooCommerce store to sync your catalog."
- CTA: "Go to Settings" (primary button)

### 9.4 Conversations — filtered tab empty

- No icon, smaller treatment
- Text: "No conversations match this filter."
- Sub-text: "Try a different filter or search term."

---

## 10. Edge cases & error states

### 10.1 WhatsApp disconnected state

Shown in all screenshots. Persistent red banner (see section 6). Agent is paused. No new messages sent until reconnected.

### 10.2 Quota at 87%+ (warning)

Amber banner visible. CTA to upgrade. Agent continues to function until 100% is reached.

### 10.3 Quota at 100%

- Both banners visible
- Red banner: "Monthly conversation limit reached. Upgrade to resume."
- Agent paused
- Existing conversations marked as failed if limit hit mid-conversation

### 10.4 Store disconnected

- Settings > Store connection shows red error state
- Dashboard shows warning banner
- Webhook not receiving orders

### 10.5 Meta template rejected

- Settings > WhatsApp shows template list with "Rejected" status badge (red)
- Banner: "One or more message templates were rejected by Meta. Review and resubmit."

### 10.6 Payment failed

- Billing page shows "Payment failed" badge next to plan
- Red banner: "Your last payment failed. Update your payment method to avoid service interruption."
- After grace period: account suspended

---

## 11. Responsiveness

The screenshots show a desktop-first design (min-width ~1280px). Responsive breakpoints:

| Breakpoint | Width | Behavior |
|---|---|---|
| Desktop (default) | ≥ 1280px | Full sidebar + content layout as designed |
| Tablet | 768px–1279px | Sidebar collapses to icon-only (44px) or hamburger menu |
| Mobile | < 768px | Sidebar hidden, accessible via hamburger menu; tables collapse to card-list view |

**Priority for MVP**: desktop only. Tablet and mobile are post-MVP.

---

## 12. Missing screens to build

The following screens are defined in the PRD but not yet implemented in the current Lovable build. They must be designed and built following the design system above.

| Priority | Screen | URL | Notes |
|---|---|---|---|
| P0 | Conversation detail | `/conversations/:id` | Chat thread, voice/image rendering, takeover |
| P0 | Onboarding — sign up | `/signup` | Create account form |
| P0 | Onboarding — store connection | `/onboarding/store` | Shopify/WooCommerce cards |
| P0 | Onboarding — WhatsApp | `/onboarding/whatsapp` | Embedded Signup + connection status |
| P0 | Onboarding — agent config | `/onboarding/agent` | Same form as Settings agent config tab |
| P0 | Onboarding — activation | `/onboarding/activate` | Summary + "Activate" CTA |
| P1 | Settings — Store connection tab | `/settings` (tab) | Connected store + reconnect |
| P1 | Settings — WhatsApp tab | `/settings` (tab) | Number + template approval status |
| P1 | Settings — Wilaya pricing tab | `/settings` (tab) | 48-row editable table |
| P1 | Password reset | `/reset-password` | Email input + confirmation |
| P2 | Orders list | `/orders` | Separate orders page (currently only on dashboard) |
| P2 | Human takeover — active state | `/conversations/:id` | Amber banner + manual input shown |
| P2 | Store disconnection error | `/settings` (tab) | Red error with reconnect CTA |
